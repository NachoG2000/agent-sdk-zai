import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const wikipediaSummary = tool(
  "wikipedia_summary",
  "Fetch the lead-paragraph summary of a Wikipedia article by title. Useful for grounded factual lookups. No API key.",
  {
    title: z.string().describe("Article title, e.g. 'Ada Lovelace' or 'Tokyo'"),
    lang: z.string().optional().describe("Wiki language code, default 'en'"),
  },
  async ({ title, lang }) => {
    const code = lang ?? "en";
    const url = `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const res = await fetch(url, { headers: { "User-Agent": "agent-sdk-zai-poc/0.1 (hackathon)" } });
    if (res.status === 404) {
      return { content: [{ type: "text", text: `No Wikipedia article found for "${title}" (${code}).` }] };
    }
    if (!res.ok) throw new Error(`Wikipedia request failed: ${res.status}`);
    const data = (await res.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    const link = data.content_urls?.desktop?.page ?? "";
    const text = `${data.title ?? title}\n\n${data.extract ?? "(no extract)"}\n\n${link}`.trim();
    return { content: [{ type: "text", text }] };
  },
);
