import * as readline from "node:readline/promises";
import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { getWeather } from "./tools/weather.ts";
import { wikipediaSummary } from "./tools/wikipedia.ts";

try { process.loadEnvFile(".env"); } catch { /* rely on shell env */ }

if (!process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_AUTH_TOKEN. Put it in .env (see .env.example) or export it in your shell.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_BASE_URL) {
  console.error("Missing ANTHROPIC_BASE_URL. Set it to https://api.z.ai/api/anthropic to route through z.ai.");
  process.exit(1);
}

const tools = createSdkMcpServer({
  name: "poc",
  version: "0.1.0",
  tools: [getWeather, wikipediaSummary],
});

const higgsfieldHeaders: Record<string, string> = {};
if (process.env.HIGGSFIELD_TOKEN) {
  higgsfieldHeaders.Authorization = `Bearer ${process.env.HIGGSFIELD_TOKEN}`;
}

if (!process.env.BUTTERBASE_API_KEY) {
  console.error("Missing BUTTERBASE_API_KEY. Put it in .env (see .env.example) — keys look like bb_sk_...");
  process.exit(1);
}

const mcpServers = {
  poc: tools,
  higgsfield: {
    type: "http" as const,
    url: "https://mcp.higgsfield.ai/mcp",
    ...(Object.keys(higgsfieldHeaders).length > 0 ? { headers: higgsfieldHeaders } : {}),
  },
  butterbase: {
    type: "http" as const,
    url: "https://api.butterbase.ai/mcp",
    headers: { Authorization: `Bearer ${process.env.BUTTERBASE_API_KEY}` },
  },
};

const allowedTools = [
  "mcp__poc__get_weather",
  "mcp__poc__wikipedia_summary",
  "mcp__higgsfield",
  "mcp__butterbase",
];

const baseOptions = {
  mcpServers,
  allowedTools,
  permissionMode: "bypassPermissions" as const,
  systemPrompt: {
    type: "preset" as const,
    preset: "claude_code" as const,
    append:
      "You are a terse hackathon demo chat agent running on z.ai's GLM via the Anthropic-compatible API. " +
      "You have local tools (get_weather, wikipedia_summary), a remote Higgsfield MCP server " +
      "exposing image and video generation (Seedance, Kling, Veo, Soul, Nano Banana, Flux), " +
      "and a remote Butterbase MCP server (backend-as-a-service: apps, schema/migrations, rows, " +
      "auth/RLS, storage, serverless functions, frontend deploys, realtime). " +
      "Prefer tools over guessing. Keep replies short and conversational.",
  },
};

async function runTurn(userText: string, continueSession: boolean): Promise<number> {
  let cost = 0;
  for await (const msg of query({
    prompt: userText,
    options: continueSession ? { ...baseOptions, continue: true } : baseOptions,
  })) {
    if (msg.type === "system" && msg.subtype === "init") {
      if (!continueSession) console.log(`[init] model=${msg.model} session=${msg.session_id.slice(0, 8)}…`);
      continue;
    }
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
        else if (block.type === "tool_use") {
          process.stdout.write(`\n[tool_use] ${block.name}(${JSON.stringify(block.input)})\n`);
        }
      }
      continue;
    }
    if (msg.type === "user") {
      for (const block of msg.message.content as Array<{ type: string; content?: unknown }>) {
        if (block.type === "tool_result") {
          const c = block.content;
          const txt = Array.isArray(c) ? c.map((p: { text?: string }) => p.text ?? "").join("") : String(c ?? "");
          process.stdout.write(`\n[tool_result] ${txt.slice(0, 300)}${txt.length > 300 ? "…" : ""}\n`);
        }
      }
      continue;
    }
    if (msg.type === "result") {
      if (typeof msg.total_cost_usd === "number") cost = msg.total_cost_usd;
    }
  }
  return cost;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("agent-sdk-zai REPL · z.ai GLM via Anthropic-compatible endpoint · /exit to quit");

let totalCost = 0;
let turnCount = 0;

while (true) {
  const raw = await rl.question("\nyou> ").catch(() => null);
  if (raw === null) break;
  const text = raw.trim();
  if (!text) continue;
  if (text === "/exit" || text === "/quit") break;

  const cost = await runTurn(text, turnCount > 0);
  turnCount++;
  totalCost += cost;
  process.stdout.write(`\n[turn ${turnCount} · $${cost.toFixed(4)} · session $${totalCost.toFixed(4)}]\n`);
}

rl.close();
process.exit(0);
