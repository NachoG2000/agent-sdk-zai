# PreOp

Hackathon: pre-operative patient education tool. Input is a freeform diagnosis or procedure name; output is a personalized cinematic video that walks the patient through what is about to happen inside their body.

The orchestration is the **Claude Agent SDK** routed through z.ai's GLM. Image and video generation are routed through **imarouter.com** (one API key, `gpt-image-2` for stills + `seedance-2.0-fast` for clips). Deploy and durable storage are on **Butterbase**.

See `CLAUDE.md` for the full project constitution, pipeline, and architecture.

## Setup

```bash
npm install
cp .env.example .env
# fill in: ANTHROPIC_AUTH_TOKEN (z.ai), IMAROUTER_API_KEY,
# BUTTERBASE_API_KEY, and BUTTERBASE_APP_ID
```

## Run (one-shot)

```bash
# argument form
npm run agent -- "torn meniscus, surgery scheduled next Tuesday"

# stdin form (handy for piping pasted text)
echo "arthroscopic medial meniscectomy" | npm run agent

# override the manifest path
npm run agent -- "torn meniscus" --out runs/case-42.json
```

The script:

1. Reads input from `argv` if present, otherwise from stdin.
2. Runs a single `query()` against the Agent SDK with the PreOp pipeline tools.
3. Streams progress to **stderr** — assistant text, tool calls, and tool results — so you can watch it work.
4. On finish, writes two artifacts to `out/`:
   - `out/preop-<timestamp>.json` — manifest containing the input, full tool-call log, every image and video URL, the final video URL, cost, duration, and the model's final assistant text.
   - `out/preop-<timestamp>.mp4` — the final video, downloaded from the imarouter URL (which expires in ~30 days).
5. Prints the manifest path to **stdout** so it's easy to chain (`mpv "$(npm run agent -q -- '...')"`).

## Run the frontend-connected worker

The Butterbase-friendly web path is split in two pieces: a static Next.js frontend
and a small Node worker that runs the Claude Agent SDK.

```bash
# terminal 1, repo root
npm run api

# terminal 2
cd web
cp .env.example .env.local
npm install
npm run dev
```

The worker exposes `POST /api/preop/runs` and streams newline-delimited JSON
events while the SDK runs. The web app reads `NEXT_PUBLIC_PREOP_API_URL` and can
be statically exported for Butterbase with:

```bash
cd web
npm run build
```

## How it works

z.ai exposes an Anthropic-compatible endpoint, so the Claude Agent SDK talks to GLM with no code changes — only env-var overrides. The agent has two in-process MCP tools (`generate_image`, `generate_video`) that wrap imarouter's `/v1/images/generations` and `/v1/videos` endpoints, plus a remote MCP connection to Butterbase for storage and deploy.

See `CLAUDE.md` for the four-stage pipeline (interpret → storyboard → produce → deliver), the non-negotiable visual principles, and instructions for adding new tools.
