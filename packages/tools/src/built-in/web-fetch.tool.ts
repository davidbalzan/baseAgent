import { z } from "zod";
import TurndownService from "turndown";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  url: z
    .string()
    .url()
    .describe("The URL to fetch."),
  maxLength: z
    .number()
    .int()
    .min(100)
    .optional()
    .default(20_000)
    .describe("Maximum character length of the returned content. Defaults to 20000."),
});

const FETCH_TIMEOUT_MS = 15_000;

/** Strip noise elements from raw HTML before conversion. */
function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
}

export function createWebFetchTool(): ToolDefinition<typeof parameters> {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  return {
    name: "web_fetch",
    description:
      "Fetch a URL and return its content. HTML pages are converted to Markdown. JSON is prettified. Other text is returned raw.",
    parameters,
    timeoutMs: 30_000,
    maxOutputChars: 50_000,
    execute: async (args) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(args.url, {
          signal: ac.signal,
          headers: {
            "User-Agent": "baseAgent/0.1 (web_fetch tool)",
            Accept: "text/html, application/json, text/plain, */*",
          },
        });

        if (!response.ok) {
          return `Error: HTTP ${response.status} ${response.statusText}`;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const raw = await response.text();

        let output: string;

        if (contentType.includes("application/json")) {
          try {
            output = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            output = raw;
          }
        } else if (contentType.includes("text/html")) {
          const cleaned = stripNoise(raw);
          output = turndown.turndown(cleaned);
        } else {
          output = raw;
        }

        if (output.length > args.maxLength) {
          output = output.slice(0, args.maxLength) + "\n\n[...truncated]";
        }

        return `[${args.url}]\n${output}`;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
