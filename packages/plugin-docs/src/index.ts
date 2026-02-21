import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Hono } from "hono";
import { marked } from "marked";
import type { Plugin, PluginContext, PluginCapabilities, PluginDoc } from "@baseagent/core";
import { docsDashboardTab } from "./dashboard-tab.js";

/** Excluded subdirectories when scanning docs/. */
const EXCLUDED_DIRS = new Set(["templates", "phases"]);

interface DocEntry {
  filename: string;
  title: string;
  source: "core" | "plugin";
  content: string;
}

/**
 * Derive a human-readable title from a markdown filename.
 * Reads the first `# Heading` if present, otherwise transforms the filename.
 */
function deriveTitle(filename: string, content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) return match[1].trim();
  return basename(filename, ".md")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Scan the docs/ directory for *.md files (top-level only, excluding certain subdirs).
 */
function scanCoreDocs(rootDir: string): DocEntry[] {
  const docsDir = resolve(rootDir, "docs");
  const entries: DocEntry[] = [];

  let files: string[];
  try {
    files = readdirSync(docsDir);
  } catch {
    return entries;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    if (EXCLUDED_DIRS.has(file)) continue;
    try {
      const content = readFileSync(resolve(docsDir, file), "utf-8");
      entries.push({
        filename: file,
        title: deriveTitle(file, content),
        source: "core",
        content,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Create the docs plugin.
 *
 * This plugin is loaded separately after loadPlugins() so it can receive
 * documentation contributed by other plugins.
 */
export function createDocsPlugin(pluginDocs: PluginDoc[], rootDir: string): Plugin {
  return {
    name: "docs",
    phase: "services",

    async init(_ctx: PluginContext): Promise<PluginCapabilities | null> {
      // Collect core docs from filesystem
      const coreDocs = scanCoreDocs(rootDir);

      // Merge plugin-contributed docs
      const pluginEntries: DocEntry[] = pluginDocs.map((d) => ({
        filename: d.filename,
        title: d.title,
        source: "plugin" as const,
        content: d.content,
      }));

      const allDocs = [...coreDocs, ...pluginEntries];
      const docsByFilename = new Map<string, DocEntry>();
      for (const doc of allDocs) {
        docsByFilename.set(doc.filename, doc);
      }

      // Build Hono routes
      const app = new Hono();

      app.get("/index", (c) => {
        const files = allDocs.map((d) => ({
          filename: d.filename,
          title: d.title,
          source: d.source,
        }));
        return c.json({ files });
      });

      app.get("/file/:filename", async (c) => {
        const filename = c.req.param("filename");
        const doc = docsByFilename.get(filename);
        if (!doc) {
          return c.json({ error: "Document not found" }, 404);
        }
        const html = await marked(doc.content);
        return c.json({ filename: doc.filename, title: doc.title, html });
      });

      _ctx.log("[docs] Plugin enabled — " + allDocs.length + " doc(s) indexed");

      return {
        routes: app,
        routePrefix: "/docs-plugin",
        dashboardTabs: [docsDashboardTab],
      };
    },
  };
}
