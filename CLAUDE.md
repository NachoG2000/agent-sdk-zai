# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A hackathon proof-of-concept that uses the **Claude Agent SDK** (TypeScript) as the agent harness, but routes all model calls to **z.ai's GLM models** via z.ai's Anthropic-compatible API endpoint. The agent runs as an interactive terminal REPL that keeps a single multi-turn conversation alive against z.ai with custom in-process MCP tools.

The whole point is: prove that a stock Anthropic agent harness can drive a non-Anthropic model with zero code changes — only env-var overrides — and that custom MCP tools work end-to-end against it.

## Commands

- `npm install` — install deps (`@anthropic-ai/claude-agent-sdk`, `zod`, `tsx`).
- `npm run agent` — start the REPL. Type messages at the `you>` prompt; `/exit` or Ctrl+D quits.
- `npm run typecheck` — `tsc --noEmit`. There are no tests; typecheck is the only static check.

The agent reads three env vars at startup and exits early if any is missing:
- `ANTHROPIC_BASE_URL` — must be `https://api.z.ai/api/anthropic`
- `ANTHROPIC_AUTH_TOKEN` — the z.ai API key
- `BUTTERBASE_API_KEY` — Butterbase API key (`bb_sk_...`), sent as a Bearer token to the Butterbase MCP server

Copy `.env.example` to `.env` and source it, e.g. `set -a && source .env && set +a && npm run agent -- "..."`.

## Architecture

Three files do all the work:

- `agent.ts` — entry point. Builds an in-process MCP server via `createSdkMcpServer`, then runs a single `query()` in **streaming-input mode** so one session spans every REPL turn. The `prompt` argument is an async generator (`userMessages()`) backed by a small `Queue<SDKUserMessage>` — `readline`'s `rl.question` pushes into the queue when the user hits Enter, and the SDK pulls from it whenever it's ready for the next turn. Output messages are dispatched by type: `system` → init banner, `assistant` → stream text and surface `tool_use` blocks, `user` → surface `tool_result` blocks the harness injected back, `result` → print cost footer and re-prompt.
- `tools/weather.ts` — custom tool `get_weather`. Two-step: Open-Meteo geocoding API → forecast API. No auth.
- `tools/wikipedia.ts` — custom tool `wikipedia_summary`. Hits the Wikipedia REST `/page/summary/{title}` endpoint. No auth.

Both tools are exported as values produced by `tool(name, description, zodShape, handler)` and registered together under one MCP server named `poc`. They surface to the model as `mcp__poc__get_weather` and `mcp__poc__wikipedia_summary`.

### Key non-obvious bits

- **One `query()` call spans the whole chat.** Earlier one-shot versions called `query()` per user message and lost history every turn. The streaming-input pattern (async-iterable prompt + push-from-readline) is what makes multi-turn memory work. If you replace the prompt argument with a string, you're back to one-shot and history is dropped.
- **`SDKUserMessage` shape is fussy.** `session_id` and `parent_tool_use_id` are required even for the very first turn — pass `session_id: ""` and `parent_tool_use_id: null`. The SDK fills in real values on its side. Forgetting these surfaces as a TS error pointing at "Property 'parent_tool_use_id' is missing".
- **The REPL prompt is driven from message events, not a separate loop.** `ask()` is called once after `system`/`init` and again on every `result` message — that way the prompt only reappears when the model is actually done with its turn (including any tool calls), so the user can't interleave input mid-tool-call.
- **`allowedTools` is an allowlist, not a hint.** `agent.ts` lists only the two MCP tool IDs, which silently disables every built-in (Bash/Read/Write/etc.). Important because z.ai-routed runs shouldn't try to spawn `claude_code` built-ins that may depend on Anthropic-only behavior.
- **`permissionMode: "bypassPermissions"`** is set so the demo runs end-to-end without prompting. Safe here because both tools are read-only HTTP fetches; do not relax this if you add filesystem or shell tools.
- **`systemPrompt` uses the `claude_code` preset with an `append`.** The preset gives the model the standard agent scaffolding; the append narrows behavior to the two tools and asks for short, conversational replies. Replacing the preset with a custom string strips the harness conventions and is usually not what you want.
- **No `model` is set explicitly.** z.ai applies its own Sonnet/Opus → GLM mapping on the server side. Pinning `ANTHROPIC_MODEL=glm-4.6` overrides this but blocks z.ai's automatic upgrades to newer GLM releases.
- **`process.loadEnvFile(".env")`** runs at startup, so a populated `.env` next to `agent.ts` is sufficient — no need to `source` it. Requires Node 20.12+. Wrapped in try/catch so the script still runs if the file is absent and env is provided some other way.

## Adding a new tool

1. Create `tools/<name>.ts`, export a `tool(...)` value (see existing files for the shape — Zod schema, async handler returning `{ content: [{ type: "text", text }] }`).
2. Import it in `agent.ts`, add it to the `tools: [...]` array passed to `createSdkMcpServer`, and add the `mcp__poc__<name>` ID to `allowedTools`.
3. If the tool can mutate state or hit paid APIs, reconsider `permissionMode` — `bypassPermissions` was chosen on the assumption every tool is a read-only public HTTP call.

## Adding an external (stdio) MCP server

Pass it alongside `poc` in the `mcpServers` map, e.g.:

```ts
mcpServers: {
  poc: tools,
  filesystem: { command: "npx", args: ["@modelcontextprotocol/server-filesystem", "/some/path"] },
}
```

Then add the relevant `mcp__filesystem__*` tool IDs to `allowedTools`. External servers run as child processes — startup latency is non-trivial, so prefer in-process tools for hackathon demos.
