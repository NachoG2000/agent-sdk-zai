import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateImage, generateImagesBatch, generateVideo, generateVideosBatch } from "./tools/imarouter.ts";

try { process.loadEnvFile(".env"); } catch { /* rely on shell env */ }

if (process.argv.slice(2).some((a) => a === "-h" || a === "--help")) {
  console.error("Usage: npm run agent -- \"<diagnosis or procedure>\"  [--out <path>]\n       echo \"<text>\" | npm run agent\n\nWrites a manifest to out/preop-<timestamp>.json and the final MP4 to out/preop-<timestamp>.mp4.");
  process.exit(0);
}

if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_AUTH_TOKEN. Put it in .env (see .env.example) or export it in your shell.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_BASE_URL) {
  console.error("Missing ANTHROPIC_BASE_URL. Set it to https://api.z.ai/api/anthropic to route through z.ai.");
  process.exit(1);
}
if (!process.env.IMAROUTER_API_KEY) {
  console.error("Missing IMAROUTER_API_KEY. Put it in .env (see .env.example) — sk-prefixed key from imarouter.com.");
  process.exit(1);
}
{
  const key = process.env.IMAROUTER_API_KEY.trim().replace(/^["']|["']$/g, "");
  if (!key.startsWith("sk-")) {
    console.error(`Warning: IMAROUTER_API_KEY does not start with 'sk-' (got prefix '${key.slice(0, 4)}…'). imarouter keys are 'sk-...'; if this is wrong, the run will 401 on the first tool call. Verify with: curl -i -H "Authorization: Bearer $IMAROUTER_API_KEY" https://api.imarouter.com/api/usage/token/user-balance`);
  }
}
if (!process.env.BUTTERBASE_API_KEY) {
  console.error("Missing BUTTERBASE_API_KEY. Put it in .env (see .env.example) — keys look like bb_sk_...");
  process.exit(1);
}

const args = process.argv.slice(2);
let outPathOverride: string | undefined;
const promptParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && i + 1 < args.length) { outPathOverride = args[++i]; continue; }
  promptParts.push(args[i]);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

let userInput = promptParts.join(" ").trim();
if (!userInput) {
  if (process.stdin.isTTY) {
    console.error("Provide input as an argument or via stdin.\n  npm run agent -- \"torn meniscus, surgery scheduled next Tuesday\"\n  echo \"...\" | npm run agent");
    process.exit(1);
  }
  userInput = (await readStdin()).trim();
}
if (!userInput) {
  console.error("Empty input.");
  process.exit(1);
}

const tools = createSdkMcpServer({
  name: "poc",
  version: "0.1.0",
  tools: [generateImage, generateImagesBatch, generateVideo, generateVideosBatch],
});

const mcpServers = {
  poc: tools,
  butterbase: {
    type: "http" as const,
    url: "https://api.butterbase.ai/mcp",
    headers: { Authorization: `Bearer ${process.env.BUTTERBASE_API_KEY}` },
  },
};

const allowedTools = [
  "mcp__poc__generate_image",
  "mcp__poc__generate_images_batch",
  "mcp__poc__generate_video",
  "mcp__poc__generate_videos_batch",
  "mcp__butterbase",
];

const systemAppend =
  "You are the orchestration agent for PreOp, a pre-operative patient education tool that turns a surgical diagnosis into a personalized cinematic video. " +
  "Pipeline: (1) interpret the user's freeform diagnosis into a canonical procedure, (2) author a six-frame storyboard (healthy → injury → instruments entering → repair → healed → return-to-life), " +
  "(3) call generate_image for frame 1 alone (no reference; this is the style anchor), then call generate_images_batch ONCE with frames 2–6 in a single call, every entry passing reference_image_url = the frame-1 URL — this runs them in parallel and is roughly 5× faster than calling generate_image five times. " +
  "(4) once all six stills are ready, call generate_videos_batch ONCE with the six clip specs in a single call, each entry's first_frame_url set to its corresponding still — this runs the Seedance jobs concurrently. Then list the per-clip URLs in your final reply. " +
  "Use the singular generate_image / generate_video tools only for frame 1 or for one-off iteration; for the storyboard pass, always batch. " +
  "Both image and video tools route through imarouter.com (one key, one base URL). Returned imarouter URLs can be fed directly between tools — no upload step needed in the chain. " +
  "Persist final assets via the Butterbase MCP storage tools, since imarouter URLs expire in ~30 days. " +
  "Constitution (non-negotiable): anonymous patient in every frame, consistent illustration style and palette across all six frames, no gore or blood, anatomical accuracy is sacred, education first. " +
  "End your final assistant message with a concise plain-text summary listing the procedure name, the six image URLs, and the per-clip video URLs in order. Do not output JSON — the harness captures the structured artifacts itself.";

type ToolCallRecord = { name: string; input: unknown; result: string; ts: string };
const toolCalls: ToolCallRecord[] = [];
const pendingToolUses = new Map<string, { name: string; input: unknown }>();
let finalText = "";
let totalCostUsd = 0;
let sessionId = "";
let modelName = "";
const startedAt = new Date();

process.stderr.write(`[preop] input: ${userInput.slice(0, 200)}${userInput.length > 200 ? "…" : ""}\n`);
process.stderr.write(`[preop] running…\n`);

for await (const msg of query({
  prompt: userInput,
  options: {
    mcpServers,
    allowedTools,
    permissionMode: "bypassPermissions" as const,
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemAppend },
  },
})) {
  if (msg.type === "system" && msg.subtype === "init") {
    sessionId = msg.session_id;
    modelName = msg.model;
    process.stderr.write(`[preop] init model=${msg.model} session=${msg.session_id.slice(0, 8)}…\n`);
    continue;
  }
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text") process.stderr.write(block.text);
      else if (block.type === "tool_use") {
        pendingToolUses.set(block.id, { name: block.name, input: block.input });
        process.stderr.write(`\n[tool_use] ${block.name}(${JSON.stringify(block.input).slice(0, 200)})\n`);
      }
    }
    continue;
  }
  if (msg.type === "user") {
    for (const block of msg.message.content as Array<{ type: string; tool_use_id?: string; content?: unknown }>) {
      if (block.type === "tool_result" && block.tool_use_id) {
        const c = block.content;
        const txt = Array.isArray(c) ? c.map((p: { text?: string }) => p.text ?? "").join("") : String(c ?? "");
        const pending = pendingToolUses.get(block.tool_use_id);
        if (pending) {
          toolCalls.push({ name: pending.name, input: pending.input, result: txt, ts: new Date().toISOString() });
          pendingToolUses.delete(block.tool_use_id);
        }
        process.stderr.write(`\n[tool_result] ${txt.slice(0, 300)}${txt.length > 300 ? "…" : ""}\n`);
      }
    }
    continue;
  }
  if (msg.type === "result") {
    if (typeof msg.total_cost_usd === "number") totalCostUsd = msg.total_cost_usd;
    if ("result" in msg && typeof msg.result === "string") finalText = msg.result;
  }
}

const finishedAt = new Date();
process.stderr.write(`\n[preop] done in ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}s, cost $${totalCostUsd.toFixed(4)}\n`);

// Match through any query string (signed-URL params after .mp4?, .png?, etc.).
// The trailing class excludes whitespace, brackets, quotes, and angle brackets so
// a URL inside markdown like `(<https://x.mp4?sig=…>)` still terminates cleanly.
const imageUrlRe = /https?:\/\/[^\s)"'<>]+\.(?:png|jpe?g|webp)(?:\?[^\s)"'<>]*)?/gi;
const videoUrlRe = /https?:\/\/[^\s)"'<>]+\.mp4(?:\?[^\s)"'<>]*)?/gi;
const imageUrls: string[] = [];
const videoUrls: string[] = [];
const seen = new Set<string>();
for (const call of toolCalls) {
  for (const u of call.result.match(imageUrlRe) ?? []) if (!seen.has(u)) { seen.add(u); imageUrls.push(u); }
  for (const u of call.result.match(videoUrlRe) ?? []) if (!seen.has(u)) { seen.add(u); videoUrls.push(u); }
}
const finalVideoUrl = videoUrls.at(-1) ?? null;

const stamp = startedAt.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
const outDir = "out";
await mkdir(outDir, { recursive: true });
const manifestPath = outPathOverride ?? join(outDir, `preop-${stamp}.json`);
const clipsDir = outPathOverride ? null : join(outDir, `preop-${stamp}-clips`);

async function downloadTo(url: string, path: string): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(path, buf);
    return { ok: true, bytes: buf.byteLength };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

type DownloadRecord = { url: string; path: string; ok: boolean; bytes?: number; error?: string };
const downloadedClips: DownloadRecord[] = [];

if (clipsDir && videoUrls.length > 0) {
  await mkdir(clipsDir, { recursive: true });
  process.stderr.write(`[preop] downloading ${videoUrls.length} clip(s) to ${clipsDir}/...\n`);
  const results = await Promise.all(videoUrls.map(async (url, i) => {
    const path = join(clipsDir, `clip-${String(i + 1).padStart(2, "0")}.mp4`);
    const r = await downloadTo(url, path);
    return r.ok ? { url, path, ok: true, bytes: r.bytes } : { url, path, ok: false, error: r.error };
  }));
  for (const r of results) {
    downloadedClips.push(r);
    if (r.ok) process.stderr.write(`[preop]   ✓ ${r.path} (${((r.bytes ?? 0) / 1_000_000).toFixed(1)} MB)\n`);
    else process.stderr.write(`[preop]   ✗ ${r.path} — ${r.error} (URL preserved in manifest)\n`);
  }
} else if (videoUrls.length === 0) {
  process.stderr.write(`[preop] no video URLs produced. Manifest captures the run for inspection.\n`);
}

const manifest = {
  input: userInput,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationSeconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
  model: modelName,
  sessionId,
  totalCostUsd,
  finalText,
  imageUrls,
  videoUrls,
  finalVideoUrl,
  downloadedClips,
  toolCalls,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
process.stderr.write(`[preop] manifest: ${manifestPath}\n`);

process.stdout.write(`${manifestPath}\n`);
