import http from "node:http";
import { runPreop, type PreopRunEvent } from "../src/preop/runPreop.ts";

const PORT = Number(process.env.PREOP_API_PORT ?? 8787);
const HOST = process.env.PREOP_API_HOST ?? "127.0.0.1";
const allowedOrigin = process.env.PREOP_WEB_ORIGIN ?? "*";
const inFlightRuns = new Set<string>();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    writeCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    writeCors(res);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/api/preop/runs") {
    writeCors(res);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    writeCors(res);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected JSON body" }));
    return;
  }

  const diagnosis = typeof (body as { diagnosis?: unknown }).diagnosis === "string"
    ? (body as { diagnosis: string }).diagnosis.trim()
    : "";
  const idempotencyKey = typeof (body as { idempotencyKey?: unknown }).idempotencyKey === "string"
    ? (body as { idempotencyKey: string }).idempotencyKey.trim()
    : "";
  if (!diagnosis) {
    writeCors(res);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "diagnosis is required" }));
    return;
  }
  if (idempotencyKey && inFlightRuns.has(idempotencyKey)) {
    writeCors(res);
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "This generation is already running." }));
    return;
  }
  if (idempotencyKey) inFlightRuns.add(idempotencyKey);

  const abortController = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  writeCors(res);
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: PreopRunEvent) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    await runPreop(diagnosis, {
      abortController,
      persistToButterbase: true,
      emit: send,
    });
  } catch (err) {
    console.error("[preop-api] run failed:", err);
    send({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    });
  } finally {
    if (idempotencyKey) inFlightRuns.delete(idempotencyKey);
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PreOp API listening at http://${HOST}:${PORT}`);
});

function writeCors(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
