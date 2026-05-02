import {
  runPreop,
  validatePreopEnv,
  warnIfImarouterKeyLooksWrong,
  writePreopArtifacts,
} from "./src/preop/runPreop.ts";

if (process.argv.slice(2).some((a) => a === "-h" || a === "--help")) {
  console.error(
    "Usage: npm run agent -- \"<diagnosis or procedure>\"  [--out <path>]\n" +
      "       echo \"<text>\" | npm run agent\n\n" +
      "Writes a manifest to out/preop-<timestamp>.json and the final MP4 to out/preop-<timestamp>.mp4.",
  );
  process.exit(0);
}

validatePreopEnv();
warnIfImarouterKeyLooksWrong((message) => process.stderr.write(message));

const args = process.argv.slice(2);
let outPathOverride: string | undefined;
const promptParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && i + 1 < args.length) {
    outPathOverride = args[++i];
    continue;
  }
  promptParts.push(args[i]);
}

let userInput = promptParts.join(" ").trim();
if (!userInput) {
  if (process.stdin.isTTY) {
    console.error(
      "Provide input as an argument or via stdin.\n" +
        "  npm run agent -- \"torn meniscus, surgery scheduled next Tuesday\"\n" +
        "  echo \"...\" | npm run agent",
    );
    process.exit(1);
  }
  userInput = (await readStdin()).trim();
}
if (!userInput) {
  console.error("Empty input.");
  process.exit(1);
}

const startedAt = Date.now();
process.stderr.write(`[preop] input: ${userInput.slice(0, 200)}${userInput.length > 200 ? "..." : ""}\n`);
process.stderr.write("[preop] running...\n");

const result = await runPreop(userInput, {
  downloadFinalVideo: true,
  emit: (event) => {
    if (event.type === "status") {
      process.stderr.write(`[preop] ${event.stage}: ${event.message}\n`);
    } else if (event.type === "assistant_text") {
      process.stderr.write(event.text);
    } else if (event.type === "tool_use") {
      process.stderr.write(`\n[tool_use] ${event.name}(${event.inputPreview})\n`);
    } else if (event.type === "tool_result") {
      process.stderr.write(`\n[tool_result] ${event.result.slice(0, 300)}${event.result.length > 300 ? "..." : ""}\n`);
    }
  },
});

process.stderr.write(
  `\n[preop] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, cost $${result.manifest.totalCostUsd.toFixed(4)}\n`,
);

const written = await writePreopArtifacts(result, outPathOverride);
process.stderr.write(`[preop] manifest: ${written.manifestPath}\n`);
if (written.videoPath) {
  process.stderr.write(
    `[preop] video:    ${written.videoPath} (${((result.downloadedVideo?.bytes.byteLength ?? 0) / 1_000_000).toFixed(1)} MB)\n`,
  );
} else if (!result.manifest.finalVideoUrl) {
  process.stderr.write("[preop] no video URL produced. Manifest captures the run for inspection.\n");
}

process.stdout.write(`${written.manifestPath}\n`);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
