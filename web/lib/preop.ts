export type PreopStoredVideo = {
  objectId: string;
  objectKey?: string;
  downloadUrl: string;
  expiresIn?: number;
};

export type PreopRunResult = {
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
};

export type PreopStreamEvent =
  | { type: "status"; stage: string; message: string; ts: string }
  | { type: "assistant_text"; text: string; ts: string }
  | { type: "tool_use"; name: string; inputPreview: string; ts: string }
  | { type: "tool_result"; name: string; result: string; ts: string }
  | { type: "artifact"; kind: "image" | "video"; index: number; url: string; ts: string }
  | { type: "done"; result: PreopRunResult; ts: string }
  | { type: "error"; error: string; ts: string };

const RUNS_URL =
  process.env.NEXT_PUBLIC_PREOP_RUNS_URL ??
  `${process.env.NEXT_PUBLIC_PREOP_API_URL ?? "http://127.0.0.1:8787"}/api/preop/runs`;

export async function streamPreopRun(
  diagnosis: string,
  idempotencyKey: string,
  onEvent: (event: PreopStreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(RUNS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diagnosis, idempotencyKey }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `PreOp API failed with status ${response.status}`);
  }
  if (!response.body) throw new Error("PreOp API returned no response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as PreopStreamEvent);
      newline = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  const finalLine = buffer.trim();
  if (finalLine) onEvent(JSON.parse(finalLine) as PreopStreamEvent);
}
