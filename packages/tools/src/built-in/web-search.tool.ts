import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

const parameters = z.object({
  query: z
    .string()
    .describe("The search query."),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Number of results to return (1-20). Defaults to 5."),
});

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
}

export function createWebSearchTool(): ToolDefinition<typeof parameters> {
  return {
    name: "web_search",
    description:
      "Search the web via Brave Search. Returns results with title, URL, and description.",
    parameters,
    permission: "read",
    timeoutMs: 15_000,
    execute: async (args) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return "Error: BRAVE_SEARCH_API_KEY is not set. Add it to your .env file.";
      }

      const url = new URL(BRAVE_API_URL);
      url.searchParams.set("q", args.query);
      url.searchParams.set("count", String(args.count));

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        return `Error: Brave Search API returned HTTP ${response.status}`;
      }

      const data = (await response.json()) as BraveSearchResponse;
      const results = data.web?.results ?? [];

      if (results.length === 0) {
        return `No results found for "${args.query}".`;
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
        .join("\n\n");

      return `Search results for "${args.query}":\n\n${formatted}`;
    },
  };
}
