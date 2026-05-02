import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = process.env.IMAROUTER_BASE_URL ?? "https://api.imarouter.com";
const DEFAULT_IMAGE_MODEL = process.env.IMAROUTER_IMAGE_MODEL ?? "gpt-image-2";
const DEFAULT_VIDEO_MODEL = process.env.IMAROUTER_VIDEO_MODEL ?? "seedance-2.0-fast";
const POLL_INTERVAL_MS = Number(process.env.IMAROUTER_POLL_INTERVAL_MS ?? 5_000);
const IMAGE_TIMEOUT_MS = Number(process.env.IMAROUTER_IMAGE_TIMEOUT_MS ?? 3 * 60_000);
const VIDEO_TIMEOUT_MS = Number(process.env.IMAROUTER_VIDEO_TIMEOUT_MS ?? 12 * 60_000);

function timeoutFor(kind: Kind): number {
  return kind === "images" ? IMAGE_TIMEOUT_MS : VIDEO_TIMEOUT_MS;
}

type Kind = "images" | "videos";
type CreateTaskResponse = { id?: string; task_id?: string; status?: string; error?: { message?: string } };

// imarouter returns at least two response shapes depending on endpoint and modality:
//   wrapped: { code, data: { task_id, status: "succeeded"|"failed"|..., url, error, amount_usd } }
//   flat:    { id, task_id, status: "completed"|"failed"|..., progress, completed_at,
//              results: [{ url }], metadata: { url }, amount_usd, error }
// We accept either and normalize.
type TaskResult = Record<string, unknown>;
type NormalizedStatus = "succeeded" | "failed" | "pending";
type NormalizedTask = { status: NormalizedStatus; url?: string; error?: string; amountUsd?: number };

function getProp(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

function asString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

function asNumber(x: unknown): number | undefined {
  return typeof x === "number" ? x : undefined;
}

function normalize(raw: TaskResult): NormalizedTask {
  const data = (getProp(raw, "data") as TaskResult | undefined) ?? raw;
  const statusStr = asString(getProp(data, "status")) ?? asString(getProp(raw, "status"));

  let status: NormalizedStatus = "pending";
  if (statusStr) {
    if (statusStr === "succeeded" || statusStr === "completed") status = "succeeded";
    else if (statusStr === "failed" || statusStr === "error" || statusStr === "cancelled") status = "failed";
  }
  // Fallback heuristics when no explicit status string (or unknown value)
  if (status === "pending") {
    const errBlock = getProp(data, "error") ?? getProp(raw, "error");
    if (errBlock) status = "failed";
    else {
      const completedAt = getProp(data, "completed_at") ?? getProp(raw, "completed_at");
      const progress = asNumber(getProp(data, "progress") ?? getProp(raw, "progress"));
      const resultsArr = (getProp(data, "results") ?? getProp(raw, "results")) as Array<{ url?: string }> | undefined;
      if (completedAt || progress === 100 || resultsArr?.[0]?.url) status = "succeeded";
    }
  }

  const url =
    asString(getProp(data, "url")) ??
    asString(getProp(raw, "url")) ??
    asString(((getProp(data, "results") ?? getProp(raw, "results")) as Array<{ url?: string }> | undefined)?.[0]?.url) ??
    asString(getProp(getProp(data, "metadata") ?? getProp(raw, "metadata"), "url"));

  const errBlock = getProp(data, "error") ?? getProp(raw, "error");
  const error =
    asString(getProp(errBlock, "message")) ??
    (typeof errBlock === "string" ? errBlock : undefined);

  const amountUsd = asNumber(getProp(data, "amount_usd") ?? getProp(raw, "amount_usd"));

  return { status, url, error, amountUsd };
}

type TaskOutcome =
  | { ok: true; url: string; taskId: string; costUsd?: number }
  | { ok: false; error: string; taskId?: string };

function authHeader(): Record<string, string> {
  const raw = process.env.IMAROUTER_API_KEY;
  if (!raw) throw new Error("IMAROUTER_API_KEY is not set");
  const key = raw.trim().replace(/^["']|["']$/g, "");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function endpoint(kind: Kind): string {
  return kind === "images" ? `${BASE_URL}/v1/images/generations` : `${BASE_URL}/v1/videos`;
}

async function createTask(kind: Kind, body: unknown): Promise<string> {
  const res = await fetch(endpoint(kind), {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`imarouter create-${kind} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as CreateTaskResponse;
  const id = data.task_id ?? data.id;
  if (!id) throw new Error(`imarouter create-${kind} returned no task_id: ${JSON.stringify(data).slice(0, 400)}`);
  return id;
}

async function getTask(kind: Kind, id: string): Promise<TaskResult> {
  const res = await fetch(`${endpoint(kind)}/${id}`, { headers: { Authorization: authHeader().Authorization } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`imarouter get-${kind} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as TaskResult;
}

async function pollUntilDone(kind: Kind, id: string): Promise<NormalizedTask> {
  const timeout = timeoutFor(kind);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const raw = await getTask(kind, id);
    const norm = normalize(raw);
    if (norm.status !== "pending") return norm;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`imarouter ${kind} task ${id} did not finish within ${timeout / 1000}s. The task may still complete server-side; check it manually with: curl -H "Authorization: Bearer $IMAROUTER_API_KEY" ${endpoint(kind)}/${id}`);
}

async function runTask(kind: Kind, body: unknown): Promise<TaskOutcome> {
  let id: string | undefined;
  try {
    id = await createTask(kind, body);
    const norm = await pollUntilDone(kind, id);
    if (norm.status === "failed") {
      return { ok: false, error: norm.error ?? "failed", taskId: id };
    }
    if (!norm.url) return { ok: false, error: "succeeded but returned no url", taskId: id };
    return { ok: true, url: norm.url, taskId: id, costUsd: norm.amountUsd };
  } catch (err) {
    return { ok: false, error: (err as Error).message, taskId: id };
  }
}

function imageBody(input: {
  prompt: string;
  reference_image_url?: string;
  size?: string;
  aspect_ratio?: string;
  model?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { model: input.model ?? DEFAULT_IMAGE_MODEL, prompt: input.prompt };
  if (input.reference_image_url) body.images = [input.reference_image_url];
  if (input.size) body.size = input.size;
  if (input.aspect_ratio) body.aspect_ratio = input.aspect_ratio;
  return body;
}

function videoBody(input: {
  prompt: string;
  first_frame_url?: string;
  duration?: number;
  aspect_ratio?: string;
  size?: string;
  model?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { model: input.model ?? DEFAULT_VIDEO_MODEL, prompt: input.prompt };
  if (input.first_frame_url) {
    body.images = [input.first_frame_url];
    body.metadata = { role_mode: "frame" };
  }
  if (typeof input.duration === "number") body.duration = input.duration;
  if (input.aspect_ratio) body.aspect_ratio = input.aspect_ratio;
  if (input.size) body.size = input.size;
  return body;
}

function formatOutcome(kind: Kind, outcome: TaskOutcome, indexLabel?: string): string {
  const prefix = indexLabel ? `${indexLabel} ` : "";
  if (!outcome.ok) {
    const idStr = outcome.taskId ? ` (task ${outcome.taskId})` : "";
    return `${prefix}imarouter ${kind} FAILED${idStr}: ${outcome.error}`;
  }
  const cost = typeof outcome.costUsd === "number" ? ` ($${outcome.costUsd.toFixed(4)})` : "";
  const label = kind === "images" ? "Image" : "Video";
  return `${prefix}${label} ready (task ${outcome.taskId})${cost}: ${outcome.url}`;
}

export const generateImage = tool(
  "generate_image",
  "Generate ONE still image via imarouter (default model: gpt-image-2). Use this for the storyboard's frame 1 (the style anchor) or for a one-off iteration. For frames 2–6 of the same storyboard, prefer generate_images_batch — it fires the requests in parallel and finishes ~5× faster.",
  {
    prompt: z.string().describe("Full image prompt: subject, setting, action, style, lighting, composition, mood, in-image text, constraints. Be explicit about anonymity (no identifiable face) and the no-gore aesthetic for PreOp frames."),
    reference_image_url: z.string().url().optional().describe("Optional public URL of an earlier frame to use as a style/content reference. Sent as `images: [<url>]` in the request body. Omit for the first frame."),
    size: z.string().optional().describe("Image size, e.g. '1024x1024', '1024x1536' (vertical, suits PreOp's vertical video output), '1536x1024'. Model-specific."),
    aspect_ratio: z.string().optional().describe("Aspect ratio, e.g. '9:16', '16:9', '1:1'. Some models prefer this over `size`."),
    model: z.string().optional().describe(`imarouter image model id. Defaults to env IMAROUTER_IMAGE_MODEL or '${DEFAULT_IMAGE_MODEL}'.`),
  },
  async (input) => {
    const outcome = await runTask("images", imageBody(input));
    return { content: [{ type: "text", text: formatOutcome("images", outcome) }] };
  },
);

const imageFrameSchema = z.object({
  prompt: z.string().describe("Full prompt for this frame."),
  reference_image_url: z.string().url().optional().describe("Optional style-anchor URL. For PreOp frames 2–6 this should be the URL returned for frame 1."),
  size: z.string().optional(),
  aspect_ratio: z.string().optional(),
});

export const generateImagesBatch = tool(
  "generate_images_batch",
  "Generate up to 8 still images IN PARALLEL via imarouter. All requests fire concurrently with Promise.all, so total wall-clock time is roughly the slowest single frame instead of the sum. Use this for PreOp storyboard frames 2–6 (after frame 1 has returned) — pass the same reference_image_url on every entry to lock style continuity. Returns one combined text result with per-frame URLs in input order; failed frames are reported individually so the rest are still usable.",
  {
    frames: z.array(imageFrameSchema).min(1).max(8).describe("Frames to generate concurrently. Order is preserved in the output."),
    model: z.string().optional().describe(`Default imarouter image model for every frame (overridable per frame is not supported in this batch tool). Defaults to env IMAROUTER_IMAGE_MODEL or '${DEFAULT_IMAGE_MODEL}'.`),
  },
  async ({ frames, model }) => {
    const startedAt = Date.now();
    const outcomes = await Promise.all(frames.map((f) => runTask("images", imageBody({ ...f, model: model ?? DEFAULT_IMAGE_MODEL }))));
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const okCount = outcomes.filter((o) => o.ok).length;
    const lines = outcomes.map((o, i) => formatOutcome("images", o, `[${i + 1}/${outcomes.length}]`));
    const header = `Batch image: ${okCount}/${outcomes.length} succeeded in ${elapsed}s.`;
    return { content: [{ type: "text", text: `${header}\n${lines.join("\n")}` }] };
  },
);

export const generateVideo = tool(
  "generate_video",
  "Generate ONE short video clip via imarouter (default model: seedance-2.0-fast). Pass first_frame_url to use a generated still as the literal opening frame. Blocks ~30–120s. For multiple clips of the same storyboard, prefer generate_videos_batch — it runs them concurrently.",
  {
    prompt: z.string().describe("Motion direction and scene continuation, e.g. 'gentle camera dolly toward the meniscus, soft anatomical illustration style, no blood'."),
    first_frame_url: z.string().url().optional().describe("Optional public URL of an image to use as the literal first frame of the clip. Sent as `images: [<url>]` with `metadata.role_mode: 'frame'`. Omit for pure text-to-video."),
    duration: z.number().int().min(3).max(15).optional().describe("Clip length in seconds. Seedance accepts 3–15. Defaults to model default if omitted."),
    aspect_ratio: z.string().optional().describe("Aspect ratio, e.g. '9:16' (vertical, the PreOp default), '16:9', '1:1'."),
    size: z.string().optional().describe("Resolution shorthand, e.g. '720P', '1080P', or 'WxH'."),
    model: z.string().optional().describe(`imarouter video model id. Defaults to env IMAROUTER_VIDEO_MODEL or '${DEFAULT_VIDEO_MODEL}'.`),
  },
  async (input) => {
    const outcome = await runTask("videos", videoBody(input));
    return { content: [{ type: "text", text: formatOutcome("videos", outcome) }] };
  },
);

const videoClipSchema = z.object({
  prompt: z.string().describe("Motion direction for this clip."),
  first_frame_url: z.string().url().optional().describe("URL of the generated still that should open this clip."),
  duration: z.number().int().min(3).max(15).optional(),
  aspect_ratio: z.string().optional(),
  size: z.string().optional(),
});

export const generateVideosBatch = tool(
  "generate_videos_batch",
  "Generate up to 8 video clips IN PARALLEL via imarouter. All Seedance tasks fire concurrently, so wall-clock time is the slowest single clip (~60–120s) instead of the sum (~6–12 minutes for six clips). Use this for PreOp's per-frame animation pass — one entry per storyboard frame, each with its own first_frame_url. Returns one combined text result with per-clip URLs in input order.",
  {
    clips: z.array(videoClipSchema).min(1).max(8).describe("Clips to generate concurrently. Order is preserved in the output."),
    model: z.string().optional().describe(`Default imarouter video model for every clip. Defaults to env IMAROUTER_VIDEO_MODEL or '${DEFAULT_VIDEO_MODEL}'.`),
  },
  async ({ clips, model }) => {
    const startedAt = Date.now();
    const outcomes = await Promise.all(clips.map((c) => runTask("videos", videoBody({ ...c, model: model ?? DEFAULT_VIDEO_MODEL }))));
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const okCount = outcomes.filter((o) => o.ok).length;
    const lines = outcomes.map((o, i) => formatOutcome("videos", o, `[${i + 1}/${outcomes.length}]`));
    const header = `Batch video: ${okCount}/${outcomes.length} succeeded in ${elapsed}s.`;
    return { content: [{ type: "text", text: `${header}\n${lines.join("\n")}` }] };
  },
);
