// Recover finished imarouter tasks by id. Useful when the agent's poll loop timed out
// but the task itself completed server-side.
//
// Usage:
//   npm run recover -- task_abc task_def task_ghi
//   npm run recover -- --kind images task_xyz   # default kind is videos
//
// Output: writes JSON status + downloads any succeeded MP4/PNG to out/recovered/.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

try { process.loadEnvFile(".env"); } catch { /* rely on shell env */ }

const KEY = process.env.IMAROUTER_API_KEY?.trim().replace(/^["']|["']$/g, "");
if (!KEY) { console.error("Missing IMAROUTER_API_KEY in .env"); process.exit(1); }
const BASE = process.env.IMAROUTER_BASE_URL ?? "https://api.imarouter.com";

let kind: "images" | "videos" = "videos";
const ids: string[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--kind" && i + 1 < argv.length) {
    const k = argv[++i];
    if (k !== "images" && k !== "videos") { console.error(`--kind must be 'images' or 'videos', got '${k}'`); process.exit(1); }
    kind = k;
    continue;
  }
  ids.push(argv[i]);
}
if (ids.length === 0) {
  console.error("Usage: npm run recover -- [--kind images|videos] task_id [task_id …]");
  process.exit(1);
}

const path = kind === "images" ? `${BASE}/v1/images/generations` : `${BASE}/v1/videos`;
const ext = kind === "images" ? "png" : "mp4";
const outDir = "out/recovered";
await mkdir(outDir, { recursive: true });

function pickUrl(raw: any): string | undefined {
  return raw?.data?.url ?? raw?.url ?? raw?.results?.[0]?.url ?? raw?.metadata?.url;
}
function pickStatus(raw: any): string {
  return raw?.data?.status ?? raw?.status ?? "unknown";
}

const summary: Array<{ id: string; status: string; url?: string; downloaded?: string; error?: string }> = [];
for (const id of ids) {
  process.stderr.write(`\n=== ${id} ===\n`);
  try {
    const res = await fetch(`${path}/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!res.ok) {
      const text = await res.text();
      process.stderr.write(`  HTTP ${res.status}: ${text.slice(0, 200)}\n`);
      summary.push({ id, status: `http_${res.status}`, error: text.slice(0, 200) });
      continue;
    }
    const raw = await res.json();
    await writeFile(join(outDir, `${id}.json`), JSON.stringify(raw, null, 2));
    const status = pickStatus(raw);
    const url = pickUrl(raw);
    process.stderr.write(`  status: ${status}\n`);
    if (url) {
      const filePath = join(outDir, `${id}.${ext}`);
      const dl = await fetch(url);
      if (!dl.ok) {
        process.stderr.write(`  download failed: HTTP ${dl.status}\n`);
        summary.push({ id, status, url, error: `download HTTP ${dl.status}` });
      } else {
        const buf = Buffer.from(await dl.arrayBuffer());
        await writeFile(filePath, buf);
        process.stderr.write(`  saved:  ${filePath} (${(buf.byteLength / 1_000_000).toFixed(1)} MB)\n`);
        summary.push({ id, status, url, downloaded: filePath });
      }
    } else {
      process.stderr.write(`  no url available — task may still be in progress\n`);
      summary.push({ id, status });
    }
  } catch (err) {
    process.stderr.write(`  error: ${(err as Error).message}\n`);
    summary.push({ id, status: "exception", error: (err as Error).message });
  }
}

const okCount = summary.filter((s) => s.downloaded).length;
process.stderr.write(`\n[recover] ${okCount}/${summary.length} task(s) saved to ${outDir}/\n`);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
