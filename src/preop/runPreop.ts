import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  generateImageDirect,
  generateImagesBatchDirect,
  generateVideosBatchDirect,
  type TaskOutcome,
} from "../../tools/imarouter.ts";

try {
  process.loadEnvFile(".env");
} catch {
  // Rely on the host environment in production.
}

export type PreopArtifact = {
  kind: "image" | "video";
  index: number;
  url: string;
};

export type PreopStoredVideo = {
  objectId: string;
  objectKey?: string;
  downloadUrl: string;
  expiresIn?: number;
};

export type PreopManifest = {
  input: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  model: string;
  sessionId: string;
  totalCostUsd: number;
  finalText: string;
  imageUrls: string[];
  videoUrls: string[];
  finalVideoUrl: string | null;
  storedVideo: PreopStoredVideo | null;
  storageError?: string;
  toolCalls: ToolCallRecord[];
};

export type PreopRunResult = {
  manifest: PreopManifest;
  downloadedVideo?: {
    bytes: Buffer;
    contentType: string;
  };
};

export type PreopRunEvent =
  | { type: "status"; stage: string; message: string; ts: string }
  | { type: "assistant_text"; text: string; ts: string }
  | { type: "tool_use"; name: string; input: unknown; inputPreview: string; ts: string }
  | { type: "tool_result"; name: string; result: string; ts: string }
  | ({ type: "artifact"; ts: string } & PreopArtifact)
  | { type: "done"; result: PreopManifest; ts: string }
  | { type: "error"; error: string; ts: string };

export type RunPreopOptions = {
  abortController?: AbortController;
  emit?: (event: PreopRunEvent) => void | Promise<void>;
  persistToButterbase?: boolean;
  downloadFinalVideo?: boolean;
};

type ToolCallRecord = { name: string; input: unknown; result: string; ts: string };
type Storyboard = z.infer<typeof storyboardSchema>;

const BUTTERBASE_API_URL = process.env.BUTTERBASE_API_URL ?? "https://api.butterbase.ai";
const execFileAsync = promisify(execFile);

const frameSchema = z.object({
  title: z.string().min(1),
  imagePrompt: z.string().min(80),
  motionPrompt: z.string().min(30),
});

const storyboardSchema = z.object({
  procedureName: z.string().min(1),
  patientLanguageSummary: z.string().min(1),
  narrationScript: z.string().min(1),
  frames: z.array(frameSchema).length(6),
});

const systemAppend =
  "You are the storyboard writer for PreOp, a pre-operative patient education tool that turns a surgical diagnosis into a personalized cinematic video. " +
  "Your only job is to interpret the user's freeform diagnosis and author a six-frame storyboard for arthroscopic meniscus repair. " +
  "Do not call tools. Do not mention URLs. Do not persist anything. Output only valid JSON matching this exact TypeScript shape: " +
  "{ procedureName: string, patientLanguageSummary: string, narrationScript: string, frames: [{ title: string, imagePrompt: string, motionPrompt: string }, ...six total] }. " +
  "The six frames must follow this fixed arc in order: healthy baseline, the patient's specific injury, instruments entering, repair moment, healed result, return-to-life closing shot. " +
  "Each imagePrompt must be complete and self-contained: subject, setting, action, style, lighting, composition, mood, in-image text, vertical 9:16 composition, and constraints. " +
  "Each motionPrompt must describe subtle motion for the matching frame and must be suitable for a short image-to-video clip. " +
  "Constitution (non-negotiable): anonymous patient in every frame, consistent illustration style and palette across all six frames, no gore or blood, anatomical accuracy is sacred, education first. " +
  "For this hackathon, stay within arthroscopic meniscus repair even if the input is loose. Return raw JSON only, with no markdown fence.";

export function validatePreopEnv() {
  if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_AUTH_TOKEN. Put it in .env (see .env.example) or export it in your shell.");
  }
  if (!process.env.ANTHROPIC_BASE_URL) {
    throw new Error("Missing ANTHROPIC_BASE_URL. Set it to https://api.z.ai/api/anthropic to route through z.ai.");
  }
  if (!process.env.IMAROUTER_API_KEY) {
    throw new Error("Missing IMAROUTER_API_KEY. Put it in .env (see .env.example) — sk-prefixed key from imarouter.com.");
  }
  if (!process.env.BUTTERBASE_API_KEY) {
    throw new Error("Missing BUTTERBASE_API_KEY. Put it in .env (see .env.example) — keys look like bb_sk_...");
  }
}

export function warnIfImarouterKeyLooksWrong(write: (message: string) => void) {
  const key = process.env.IMAROUTER_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (key && !key.startsWith("sk-")) {
    write(`Warning: IMAROUTER_API_KEY does not start with 'sk-' (got prefix '${key.slice(0, 4)}...'). Verify it before running paid generation.\n`);
  }
}

export async function runPreop(input: string, options: RunPreopOptions = {}): Promise<PreopRunResult> {
  const userInput = input.trim();
  if (!userInput) throw new Error("Empty input.");
  validatePreopEnv();

  const emit = async (event: PreopRunEvent) => {
    await options.emit?.(event);
  };
  const startedAt = new Date();
  const toolCalls: ToolCallRecord[] = [];
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  let finalText = "";
  let totalCostUsd = 0;
  let sessionId = "";
  let modelName = "";

  await emit({
    type: "status",
    stage: "starting",
    message: "Starting PreOp generation",
    ts: new Date().toISOString(),
  });

  const maxBudgetUsd = Number(process.env.PREOP_MAX_BUDGET_USD ?? 8);
  const q = query({
    prompt: storyboardPrompt(userInput),
    options: {
      abortController: options.abortController,
      allowedTools: [],
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      maxBudgetUsd: Number.isFinite(maxBudgetUsd) && maxBudgetUsd > 0 ? maxBudgetUsd : 8,
      systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: systemAppend },
    },
  });

  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
      modelName = msg.model;
      await emit({
        type: "status",
        stage: "sdk_init",
        message: `Initialized model ${msg.model}`,
        ts: new Date().toISOString(),
      });
      continue;
    }

    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          finalText += block.text;
          await emit({ type: "assistant_text", text: block.text, ts: new Date().toISOString() });
        }
      }
      continue;
    }

    if (msg.type === "result") {
      if (typeof msg.total_cost_usd === "number") totalCostUsd = msg.total_cost_usd;
      if ("result" in msg && typeof msg.result === "string" && !finalText.trim()) finalText = msg.result;
    }
  }

  const storyboard = parseStoryboard(finalText);
  finalText = finalSummary(storyboard, imageUrls, videoUrls, null);

  await emit({
    type: "status",
    stage: "painting",
    message: "Generating the style anchor frame",
    ts: new Date().toISOString(),
  });
  const anchorInput = {
    prompt: storyboard.frames[0].imagePrompt,
    aspect_ratio: "9:16",
  };
  await emit({ type: "tool_use", name: "generate_image", input: anchorInput, inputPreview: preview(anchorInput), ts: new Date().toISOString() });
  const anchor = await generateImageDirect(anchorInput);
  recordToolCall(toolCalls, "generate_image", anchorInput, anchor);
  await emit({ type: "tool_result", name: "generate_image", result: formatOutcome(anchor), ts: new Date().toISOString() });
  if (!anchor.ok) throw new Error(`Frame 1 image generation failed: ${anchor.error}`);
  imageUrls.push(anchor.url);
  await emit({ type: "artifact", kind: "image", index: imageUrls.length, url: anchor.url, ts: new Date().toISOString() });

  await emit({
    type: "status",
    stage: "painting",
    message: "Generating referenced frames 2-6",
    ts: new Date().toISOString(),
  });
  const imageBatchInput = {
    frames: storyboard.frames.slice(1).map((frame) => ({
      prompt: frame.imagePrompt,
      reference_image_url: anchor.url,
      aspect_ratio: "9:16",
    })),
  };
  await emit({ type: "tool_use", name: "generate_images_batch", input: imageBatchInput, inputPreview: preview(imageBatchInput), ts: new Date().toISOString() });
  const imageOutcomes = await generateImagesBatchDirect(imageBatchInput);
  recordToolCall(toolCalls, "generate_images_batch", imageBatchInput, imageOutcomes);
  await emit({ type: "tool_result", name: "generate_images_batch", result: formatOutcomes(imageOutcomes), ts: new Date().toISOString() });
  const failedImage = imageOutcomes.find((outcome) => !outcome.ok);
  if (failedImage && !failedImage.ok) throw new Error(`Referenced image generation failed: ${failedImage.error}`);
  for (const outcome of imageOutcomes) {
    if (!outcome.ok) continue;
    imageUrls.push(outcome.url);
    await emit({ type: "artifact", kind: "image", index: imageUrls.length, url: outcome.url, ts: new Date().toISOString() });
  }

  await emit({
    type: "status",
    stage: "filming",
    message: "Animating all six frames",
    ts: new Date().toISOString(),
  });
  const videoBatchInput = {
    clips: storyboard.frames.map((frame, index) => ({
      prompt: frame.motionPrompt,
      first_frame_url: imageUrls[index],
      duration: 4,
      aspect_ratio: "9:16",
    })),
  };
  await emit({ type: "tool_use", name: "generate_videos_batch", input: videoBatchInput, inputPreview: preview(videoBatchInput), ts: new Date().toISOString() });
  const videoOutcomes = await generateVideosBatchDirect(videoBatchInput);
  recordToolCall(toolCalls, "generate_videos_batch", videoBatchInput, videoOutcomes);
  await emit({ type: "tool_result", name: "generate_videos_batch", result: formatOutcomes(videoOutcomes), ts: new Date().toISOString() });
  const failedVideo = videoOutcomes.find((outcome) => !outcome.ok);
  if (failedVideo && !failedVideo.ok) throw new Error(`Video generation failed: ${failedVideo.error}`);
  for (const outcome of videoOutcomes) {
    if (!outcome.ok) continue;
    videoUrls.push(outcome.url);
    await emit({ type: "artifact", kind: "video", index: videoUrls.length, url: outcome.url, ts: new Date().toISOString() });
  }

  let finalVideoUrl: string | null = null;
  let downloadedVideo: PreopRunResult["downloadedVideo"];
  let storedVideo: PreopStoredVideo | null = null;
  let storageError: string | undefined;

  if (videoUrls.length === 6) {
    await emit({
      type: "status",
      stage: "composing",
      message: "Combining the six clips",
      ts: new Date().toISOString(),
    });
    try {
      downloadedVideo = await concatenateVideos(videoUrls, startedAt);
    } catch (err) {
      storageError = `Final video composition failed: ${err instanceof Error ? err.message : String(err)}`;
      await emit({
        type: "status",
        stage: "storage_warning",
        message: `${storageError}. Falling back to the last generated clip.`,
        ts: new Date().toISOString(),
      });
      finalVideoUrl = videoUrls.at(-1) ?? null;
      if (finalVideoUrl && options.downloadFinalVideo) {
        downloadedVideo = await downloadVideo(finalVideoUrl);
      }
    }
  }
  if (downloadedVideo && options.persistToButterbase) {
    await emit({
      type: "status",
      stage: "storing",
      message: "Saving the final video to Butterbase storage",
      ts: new Date().toISOString(),
    });
    try {
      storedVideo = await persistVideoToButterbase(downloadedVideo.bytes, downloadedVideo.contentType, startedAt);
    } catch (err) {
      storageError = err instanceof Error ? err.message : String(err);
      await emit({
        type: "status",
        stage: "storage_warning",
        message: `Butterbase storage skipped: ${storageError}`,
        ts: new Date().toISOString(),
      });
    }
  }
  if (storedVideo) finalVideoUrl = storedVideo.downloadUrl;
  if (!finalVideoUrl && videoUrls.length > 0 && (storageError || !downloadedVideo)) {
    finalVideoUrl = videoUrls.at(-1) ?? null;
  }
  finalText = finalSummary(storyboard, imageUrls, videoUrls, finalVideoUrl);

  const manifest: PreopManifest = {
    input: userInput,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: (Date.now() - startedAt.getTime()) / 1000,
    model: modelName,
    sessionId,
    totalCostUsd,
    finalText,
    imageUrls,
    videoUrls,
    finalVideoUrl,
    storedVideo,
    storageError,
    toolCalls,
  };

  await emit({ type: "done", result: manifest, ts: new Date().toISOString() });
  return { manifest, downloadedVideo };
}

export async function writePreopArtifacts(result: PreopRunResult, outPathOverride?: string) {
  const stamp = result.manifest.startedAt.replace(/[:.]/g, "-").replace(/Z$/, "");
  const outDir = "out";
  await mkdir(outDir, { recursive: true });
  const manifestPath = outPathOverride ?? join(outDir, `preop-${stamp}.json`);
  const videoPath = outPathOverride ? null : join(outDir, `preop-${stamp}.mp4`);

  await writeFile(manifestPath, JSON.stringify(result.manifest, null, 2));
  if (videoPath && result.downloadedVideo) {
    await writeFile(videoPath, result.downloadedVideo.bytes);
  }
  return { manifestPath, videoPath: result.downloadedVideo ? videoPath : null };
}

function storyboardPrompt(input: string) {
  return `Patient/procedure input:\n${input}\n\nReturn the PreOp storyboard JSON only.`;
}

function parseStoryboard(raw: string): Storyboard {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : extractJsonObject(trimmed);
  const parsed = JSON.parse(jsonText);
  return storyboardSchema.parse(parsed);
}

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`Storyboard response did not contain JSON: ${text.slice(0, 300)}`);
  }
  return text.slice(first, last + 1);
}

function recordToolCall(
  toolCalls: ToolCallRecord[],
  name: string,
  input: unknown,
  outcome: TaskOutcome | TaskOutcome[],
) {
  const result = Array.isArray(outcome) ? formatOutcomes(outcome) : formatOutcome(outcome);
  toolCalls.push({ name, input, result, ts: new Date().toISOString() });
}

function formatOutcomes(outcomes: TaskOutcome[]): string {
  return outcomes.map((item, index) => formatOutcome(item, `[${index + 1}/${outcomes.length}]`)).join("\n");
}

function formatOutcome(outcome: TaskOutcome, indexLabel?: string): string {
  const prefix = indexLabel ? `${indexLabel} ` : "";
  if (!outcome.ok) {
    const idStr = outcome.taskId ? ` (task ${outcome.taskId})` : "";
    return `${prefix}FAILED${idStr}: ${outcome.error}`;
  }
  const cost = typeof outcome.costUsd === "number" ? ` ($${outcome.costUsd.toFixed(4)})` : "";
  return `${prefix}ready (task ${outcome.taskId})${cost}: ${outcome.url}`;
}

function preview(value: unknown): string {
  return JSON.stringify(value).slice(0, 240);
}

function finalSummary(
  storyboard: Storyboard,
  imageUrls: string[],
  videoUrls: string[],
  finalVideoUrl: string | null,
) {
  return [
    `Procedure: ${storyboard.procedureName}`,
    `Summary: ${storyboard.patientLanguageSummary}`,
    `Narration: ${storyboard.narrationScript}`,
    `Images: ${imageUrls.join(", ") || "pending"}`,
    `Clips: ${videoUrls.join(", ") || "pending"}`,
    `Final video: ${finalVideoUrl ?? "local composed video pending storage"}`,
  ].join("\n");
}

async function concatenateVideos(urls: string[], startedAt: Date) {
  const dir = await mkdtemp(join(tmpdir(), "preop-clips-"));
  try {
    const clipPaths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const video = await downloadVideo(urls[i]);
      const path = join(dir, `${String(i + 1).padStart(2, "0")}.mp4`);
      await writeFile(path, video.bytes);
      clipPaths.push(path);
    }

    const listPath = join(dir, "clips.txt");
    await writeFile(listPath, clipPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"));
    const outputPath = join(dir, `preop-${startedAt.getTime()}.mp4`);
    try {
      await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
    } catch {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    }
    return {
      bytes: await readFile(outputPath),
      contentType: "video/mp4",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function downloadVideo(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video download failed (${res.status}) from ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "video/mp4",
  };
}

async function persistVideoToButterbase(bytes: Buffer, contentType: string, startedAt: Date): Promise<PreopStoredVideo> {
  const appId = process.env.BUTTERBASE_APP_ID;
  const token = process.env.BUTTERBASE_API_KEY;
  if (!appId) throw new Error("Missing BUTTERBASE_APP_ID; cannot persist final video to Butterbase storage.");
  if (!token) throw new Error("Missing BUTTERBASE_API_KEY; cannot persist final video to Butterbase storage.");

  const filename = `preop-${startedAt.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "")}.mp4`;
  const upload = await fetch(`${BUTTERBASE_API_URL}/storage/${appId}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      contentType,
      sizeBytes: bytes.byteLength,
      public: true,
    }),
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(`Butterbase upload URL request failed (${upload.status}): ${text.slice(0, 400)}`);
  }

  const uploadData = (await upload.json()) as {
    uploadUrl?: string;
    objectId?: string;
    objectKey?: string;
  };
  if (!uploadData.uploadUrl || !uploadData.objectId) {
    throw new Error(`Butterbase upload response missing uploadUrl/objectId: ${JSON.stringify(uploadData).slice(0, 400)}`);
  }

  const put = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
  if (!put.ok) {
    const text = await put.text();
    throw new Error(`Butterbase video upload failed (${put.status}): ${text.slice(0, 400)}`);
  }

  const download = await fetch(`${BUTTERBASE_API_URL}/storage/${appId}/download/${uploadData.objectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!download.ok) {
    const text = await download.text();
    throw new Error(`Butterbase download URL request failed (${download.status}): ${text.slice(0, 400)}`);
  }
  const downloadData = (await download.json()) as { downloadUrl?: string; expiresIn?: number };
  if (!downloadData.downloadUrl) {
    throw new Error(`Butterbase download response missing downloadUrl: ${JSON.stringify(downloadData).slice(0, 400)}`);
  }

  return {
    objectId: uploadData.objectId,
    objectKey: uploadData.objectKey,
    downloadUrl: downloadData.downloadUrl,
    expiresIn: downloadData.expiresIn,
  };
}
