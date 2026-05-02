# agent-sdk-zai

Hackathon PoC: drive z.ai's GLM models with the **Claude Agent SDK** as the harness, plus two no-auth custom tools (Open-Meteo weather, Wikipedia summary).

## Setup

```bash
npm install
cp .env.example .env
# edit .env, paste your z.ai key into ANTHROPIC_AUTH_TOKEN
```

## Run

```bash
npm run agent
```

That drops you into an interactive REPL — type messages at the `you>` prompt, watch tool calls and replies stream back, and the model keeps the full conversation history across turns. Type `/exit` (or Ctrl+D) to quit. Each line you send shows a `[turn cost $X.XXXX]` footer.

## How it works

z.ai exposes an Anthropic-compatible endpoint. Pointing `ANTHROPIC_BASE_URL` at it and setting `ANTHROPIC_AUTH_TOKEN` to a z.ai key is enough — the Claude Agent SDK (which spawns Claude Code under the hood) talks to z.ai instead of Anthropic, with no code changes.

See `CLAUDE.md` for architecture and how to add tools.
