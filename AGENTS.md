# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository. It is the constitution of the project. The principles below are not aspirational — they are the rules the build does not break, no matter how clever a shortcut seems.

## Project: PreOp

A pre-operative patient education tool. The user inputs a surgical diagnosis or procedure name. The system returns a personalized cinematic video that walks them through what is about to happen inside their body, in language and visuals they can understand. The goal is to replace the generic, expensive, one-size-fits-all surgical education videos that hospitals show to every patient regardless of their specific case, with a personalized two-minute film generated on demand for that exact patient.

## The problem we are solving

Patients scheduled for surgery are anxious because they have no mental model of what is about to happen to them. Hospitals know this. The current solutions are bad: a paper brochure that no one reads, a surgeon's rushed five-minute explanation in clinical language, or a generic stock animation made once for $50,000 and shown to every patient regardless of their specific diagnosis.

The cost of this gap is measurable. Patients cancel surgeries because of fear. They show up unprepared. They consent without truly understanding. They recover worse because they did not internalize what was done to them. Hospitals lose money on cancellations. Surgeons lose time on repeated explanations. Patients lose sleep.

The unfair advantage we have today is that generative video has crossed a threshold where personalized anatomical visualization is finally cheap enough to produce per-patient. We are building the tool that uses that threshold.

## What the user experiences

A patient or their doctor opens the app. They type or paste a diagnosis or procedure name in natural language — anything from "torn meniscus, surgery scheduled next Tuesday" to formal terminology like "arthroscopic medial meniscectomy." They tap one button. About thirty seconds later, they have a vertical video, roughly twenty to thirty seconds long, that shows them the inside of their own body, the problem, the precise procedure that will be done, and what their healed body will look like afterward. They can watch it, share it with family, rewatch it the night before surgery.

The video is calm. It is accurate. It is not gory. It is not generic. It feels like a film made specifically for this person, because it was.

## The pipeline

The system has four stages. Each stage has one job and hands clean structured output to the next.

**Stage one — diagnosis interpretation.** The freeform user input is parsed by a language model that identifies the specific surgical procedure being described. It maps loose patient language to a canonical procedure type and pulls the relevant anatomical context. For the hackathon, we focus on a single surgery family (arthroscopic meniscus repair) so this stage can be tightly validated. The output of this stage is a structured object describing the procedure, the affected anatomy, the key narrative beats, and the patient-facing language to use.

**Stage two — frame generation.** The structured procedure object is expanded into a six-frame storyboard. Each frame is a complete, self-contained image generation prompt covering subject, setting, action, style, lighting, composition, mood, in-image text, aspect ratio, and constraints. The six frames follow a fixed narrative arc — healthy baseline, the patient's specific injury, the instruments entering, the repair moment, the healed result, and a return-to-life closing shot. This arc is not negotiable; it is the spine of every video the system makes. The output of this stage is a single JSON document containing all six frame prompts plus the voiceover narration script and the per-frame motion direction for the video model.

**Stage three — visual production.** The six frame prompts are sent to the image generation model in sequence, with the first frame used as a style reference for the subsequent five so that visual continuity is preserved across cuts. Each generated still is then paired with its motion direction and sent to the video model, which produces a short clip with the still as its starting frame. The clips are concatenated, the voiceover is laid over the top, and a final video file is produced.

**Stage four — delivery.** The video is presented in a frontend that feels closer to a film than a medical app. A single play button. Vertical orientation. The patient watches it. They can save it, share it, watch it again. There are no metrics, no graphs, no clinical chrome. The product disappears so the content can do its work.

## The model and infrastructure stack

These are fixed for the hackathon. Treat them as constraints, not choices.

- **Image + video generation: imarouter** (`https://api.imarouter.com`). One unified router behind one API key for both modalities. We use `gpt-image-2` for stills and `seedance-2.0-fast` for clips; both are exposed by the local `generate_image` and `generate_video` tools, which share auth, base URL, and the create-task + poll loop. Both endpoints take JSON only — reference and first-frame images are passed as **URLs**, never multipart. The image endpoint returns a hosted URL directly, so the image → video chain has no intermediate upload step. imarouter URLs expire in ~30 days, so anything that needs to outlive the session goes to Butterbase storage.
- **Deployment + durable storage: Butterbase.ai.** Mandatory for the hackathon — the demo must run on Butterbase. The Butterbase MCP server is already registered in the agent (apps, schema, rows, auth, storage, functions, deploys, realtime). Final stills and videos are persisted to Butterbase storage; the deploy itself runs there. Do not introduce a second backend.
- **Agent harness: Codex Agent SDK (TypeScript), routed to z.ai's GLM models** via z.ai's Anthropic-compatible endpoint. No code change is required to swap models — only env-var overrides. This is what makes the orchestration layer cheap to run.

## Scope discipline for the hackathon

We build one surgery, end to end, perfectly. Arthroscopic meniscus repair. Every frame is dialed in, every transition is smooth, the narration is right, the video looks like something a hospital would actually show a patient. We do not generalize during the build. We do not try to support every body part. The pitch to judges is that the *pipeline* generalizes, not that we have demonstrated it generalizing. Showing one thing flawlessly is more convincing than showing four things at sixty percent. If something feels half-finished, we cut it before we add anything new.

## The non-negotiable principles

These are the rules the project does not break, no matter how clever a shortcut seems. They are listed because every one of them is the kind of thing that gets quietly violated under hackathon time pressure, and each violation makes the product worse in a way that is hard to recover from.

**The patient is anonymous in every frame.** No identifiable face, ever. The user is the patient — they need to be able to project themselves onto the figure. Anonymous bodies also sidestep a real ethical landmine around generating identifiable medical imagery.

**The visual style is consistent across all six frames.** Same illustration language, same color palette, same camera angle for the anatomical shots. Cuts must feel like time-lapse on a single body, not six unrelated images stitched together. The first frame is the style anchor for the rest of the sequence.

**No gore. No blood. No scary medical drama.** This is a tool to *reduce* anxiety, not to confront the patient with horror. Surgical instruments are rendered as small and precise, not large and threatening. Cutting and trimming actions are gentle and clinical, not violent. If a frame would scare the patient, it is the wrong frame.

**Anatomical accuracy is sacred.** This is the entire point of the product. A generic-but-pretty animation already exists in every hospital. The reason a personalized video is worth making is because it shows *the patient's actual situation*, not a stylized cartoon. If the model gets anatomy wrong, we regenerate. We do not ship visually appealing inaccuracy.

**The video earns its runtime.** Every frame must show the user something they could not have learned from a static diagram or a paragraph of text. If a frame is just a label and a still picture, it should be a slide, not a video. The reason this is a video is the motion in the repair moment, the dissolve from anatomy to walking person, the transitions that text cannot do.

**Education first, emotion second.** Earlier versions of this concept leaned on calm-app aesthetics — arrival at the hospital, a family member's hand. Those frames were warm but they did not teach the patient anything. The product is now anatomical-narrative: problem, procedure, outcome. Emotion comes from clarity, not from mood lighting.

## The pitch frame

PreOp is the layer between the diagnosis and the surgery that has been missing for fifty years of modern medicine. Hospitals already have the data. Patients already have the phones. What was missing was the cost curve on personalized visual content, and that curve has just bent. We are the product that bends with it.

The hackathon demo shows one knee. The roadmap is every body part, every procedure, every language. The buyer is any healthcare provider that schedules elective surgeries and currently sees cancellation rates above zero — which is all of them.

## Working principles for the build

**One surgery, perfectly demoed, beats four surgeries half-working.** When in doubt about whether to add scope or polish what exists, polish what exists.

**The JSON storyboard is the contract between stages.** Stage one outputs to it, stage two reads from it, stage three consumes it. Keep the schema simple, keep it stable, version it once and stop touching it.

**Style reference passing is what makes the cuts feel cinematic.** Do not skip it. Generating each frame independently is the difference between a film and a slideshow.

**The frontend is the last priority and the highest ceiling.** A working pipeline with a flat UI loses to a working pipeline with a beautiful one. Save time on the frontend by making it brutally simple — one input, one button, one video player, nothing else — and put the saved time into making the player itself feel premium.

**If a feature does not directly serve the patient watching the final video, it does not exist.** No accounts. No settings. No history. No sharing analytics. No dashboard. The product is the video. Everything else is distraction during a hackathon and feature bloat afterward.

## Commands

- `npm install` — install deps (`@anthropic-ai/Codex-agent-sdk`, `zod`, `tsx`).
- `npm run agent -- "<diagnosis>"` — run the pipeline once on a piece of input text and exit. Input can also come from stdin (`echo "..." | npm run agent`). Optional `--out <path>` overrides the manifest path.
- `npm run typecheck` — `tsc --noEmit`. There are no tests; typecheck is the only static check.

The script writes two artifacts to `out/`:
- `out/preop-<timestamp>.json` — manifest: input, full tool-call log, every image and video URL, the final video URL, cost, duration, and the model's final assistant text.
- `out/preop-<timestamp>.mp4` — the final video, downloaded from the imarouter URL (which expires in ~30 days).

Progress (assistant text, tool calls, tool results) is streamed to **stderr** so it's visible while the run is in flight. The manifest path is printed to **stdout** so the script composes cleanly with shell pipes.

The agent reads these env vars at startup and exits early if any required one is missing:
- `ANTHROPIC_BASE_URL` — must be `https://api.z.ai/api/anthropic`
- `ANTHROPIC_AUTH_TOKEN` — the z.ai API key
- `IMAROUTER_API_KEY` — imarouter `sk-...` key, drives both `generate_image` and `generate_video`
- `BUTTERBASE_API_KEY` — Butterbase API key (`bb_sk_...`), sent as a Bearer token to the Butterbase MCP server

Optional: `IMAROUTER_BASE_URL` overrides the router base (default `https://api.imarouter.com`). `IMAROUTER_IMAGE_MODEL` pins the image model (default `gpt-image-2`). `IMAROUTER_VIDEO_MODEL` pins the video model (default `seedance-2.0-fast`). `IMAROUTER_IMAGE_TIMEOUT_MS` / `IMAROUTER_VIDEO_TIMEOUT_MS` override the per-kind poll timeouts (defaults: 3 min for images, 12 min for videos — videos get a bigger budget because six concurrent Seedance jobs can queue on imarouter's side and push wall-clock past the original 5 min limit). `IMAROUTER_POLL_INTERVAL_MS` overrides the poll cadence (default 5 s).

`process.loadEnvFile(".env")` runs at startup, so a populated `.env` next to `agent.ts` is sufficient — no need to `source` it. Requires Node 20.12+.

## Architecture

- `agent.ts` — entry point. Reads the user's input from `argv` (or stdin if argv is empty), builds the in-process MCP server via `createSdkMcpServer`, then runs a **single** `query({ prompt: <string> })` and iterates the messages until the `result` event. Output messages are dispatched by type: `system/init` → log model + session id, `assistant` → stream text to stderr and record `tool_use` blocks (keyed by `id`), `user` → record `tool_result` blocks paired with their pending `tool_use_id`, `result` → capture `result.result` (the final assistant text) and `result.total_cost_usd`. After the loop, URLs are extracted from tool-result text via regex, the manifest is written, and the video at `finalVideoUrl` is downloaded to `out/preop-<ts>.mp4`.
- `tools/imarouter.ts` — exports both `generate_image` and `generate_video`. They share `authHeader()`, the create-task + poll loop (`createTask`, `getTask`, `pollUntilDone`), and the `summarize` formatter. POST returns a `task_id`; the GET endpoint is polled every 5s until status is `succeeded` or `failed` (5-minute timeout). Image bodies are JSON `{ model, prompt, images?: [<url>], size?, aspect_ratio? }`. Video bodies are JSON `{ model, prompt, images?: [<url>], metadata?: { role_mode: "frame" }, duration?, aspect_ratio?, size? }`. Both succeed paths return `data.url`; failures surface `data.error.message`.

These tools are registered together under one in-process MCP server named `poc` and surface to the model as `mcp__poc__generate_image` and `mcp__poc__generate_video`. A remote HTTP MCP server `butterbase` is registered alongside (apps, schema, rows, auth, storage, functions, deploys, realtime), allowed via the bare `mcp__butterbase` prefix. imarouter URLs expire in ~30 days, so anything user-facing or post-demo gets persisted to Butterbase storage.

### Key non-obvious bits

- **One-shot mode is just `prompt: <string>`.** That's the SDK's intended pattern for non-interactive runs — no streaming-input async generator, no `continue: true`, no readline plumbing. The `query()` async iterator finishes on its own when the model emits `result`. If you ever need multi-turn again, switch the prompt to an `AsyncIterable<SDKUserMessage>` and add `continue: true` to subsequent `query()` calls; the streaming-input pattern is preserved in git history if needed.
- **Tool-use IDs pair `assistant` and `user` events.** The `assistant.tool_use` block carries an `id`; the corresponding `user.tool_result` block references it via `tool_use_id`. The agent uses a `Map` keyed by that id so each recorded tool call has both its input and its result, even when multiple tool calls run in a single turn.
- **URL extraction is regex over tool-result text.** Pragmatic and reliable as long as `tools/imarouter.ts` keeps returning `Image ready: <url>` / `Video ready (...): <url>`. If the tool output format changes, the regex in `agent.ts` needs to follow.
- **`allowedTools` is an allowlist, not a hint.** Listing only MCP tool IDs silently disables every built-in (Bash/Read/Write/etc.). Important because z.ai-routed runs shouldn't try to spawn `Codex` built-ins that may depend on Anthropic-only behavior.
- **`permissionMode: "bypassPermissions"`** is set so the demo runs end-to-end without prompting. Every `generate_image` and `generate_video` call costs real money per task (settled `amount_usd` is in the polled response) — be deliberate about loops that retry on failure.
- **`systemPrompt` uses the `Codex` preset with an `append`.** The preset gives the model the standard agent scaffolding; the append narrows behavior to PreOp's pipeline tools.
- **No `model` is set explicitly.** z.ai applies its own Sonnet/Opus → GLM mapping on the server side. Pinning `ANTHROPIC_MODEL=glm-4.6` overrides this but blocks automatic upgrades to newer GLM releases.

## Adding a new tool

1. Create `tools/<name>.ts`, export a `tool(...)` value (Zod schema, async handler returning `{ content: [{ type: "text", text }] }`).
2. Import it in `agent.ts`, add it to the `tools: [...]` array passed to `createSdkMcpServer`, and add `mcp__poc__<name>` to `allowedTools`.
3. If the tool mutates state or hits a paid API, the `bypassPermissions` setting still applies — make the tool itself idempotent or guard against runaway calls.

## Adding an external (stdio) MCP server

```ts
mcpServers: {
  poc: tools,
  filesystem: { command: "npx", args: ["@modelcontextprotocol/server-filesystem", "/some/path"] },
}
```

Then add the relevant `mcp__filesystem__*` tool IDs to `allowedTools`. External servers run as child processes — startup latency is non-trivial, so prefer in-process tools for hackathon demos.
