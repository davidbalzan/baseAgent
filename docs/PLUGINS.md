# Plugin Development Guide

How to build plugins for baseAgent. Plugins are the primary extension mechanism — they can register agent tools, channel adapters, HTTP routes, and dashboard tabs.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Plugin Interface](#2-plugin-interface)
3. [Lifecycle](#3-lifecycle)
4. [Phases](#4-phases)
5. [PluginContext](#5-plugincontext)
6. [PluginCapabilities](#6-plugincapabilities)
7. [Creating a Plugin Package](#7-creating-a-plugin-package)
8. [Registering Tools](#8-registering-tools)
9. [Registering Channel Adapters](#9-registering-channel-adapters)
10. [Providing HTTP Routes](#10-providing-http-routes)
11. [Adding Dashboard Tabs](#11-adding-dashboard-tabs)
12. [Wiring Into the Server](#12-wiring-into-the-server)
13. [Error Handling](#13-error-handling)
14. [Existing Plugins](#14-existing-plugins)

---

## 1. Overview

A plugin is a TypeScript module that implements the `Plugin` interface from `@baseagent/core`. Plugins are loaded at server startup, sorted by phase, and each is given a `PluginContext` to interact with the system.

Plugins can contribute:

| Capability | How | Example |
|-----------|-----|---------|
| Agent tools | Return `tools` from `init()` | `schedule_task`, `list_tasks` |
| Channel adapters | Register in `afterInit()` | Telegram, Discord, Slack |
| HTTP routes | Return `routes` from `init()` | `GET /scheduler/tasks` |
| Dashboard tabs | Return `dashboardTabs` from `init()` | Tasks tab |

Plugins live in `packages/plugin-<name>/` and follow the monorepo conventions (pnpm workspaces, shared tsconfig, `@baseagent/plugin-<name>` package name).

---

## 2. Plugin Interface

```typescript
import type { Plugin } from "@baseagent/core";

interface Plugin {
  readonly name: string;
  readonly phase: PluginPhase;
  init(ctx: PluginContext): Promise<PluginCapabilities | null>;
  afterInit?(ctx: PluginAfterInitContext): Promise<void>;
  shutdown?(): Promise<void>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique identifier (used in logs, route prefixes) |
| `phase` | `PluginPhase` | Loading order — see [Phases](#4-phases) |
| `init()` | `async` | Called during startup. Return capabilities or `null` to disable |
| `afterInit()` | `async` (optional) | Called after all plugins init and `handleMessage` is ready |
| `shutdown()` | `async` (optional) | Called during graceful server shutdown (reverse order) |

---

## 3. Lifecycle

```
Server startup
  │
  ├─ resolvePlugins()     ← Determine which plugins to load from config
  ├─ loadPlugins()        ← Sort by phase, call init() on each
  │   ├─ phase: tools     ← Built-in tools plugin
  │   ├─ phase: adapters  ← Telegram, Discord, Slack
  │   ├─ phase: routes    ← Webhook
  │   └─ phase: services  ← Heartbeat, Scheduler
  │
  ├─ Mount plugin routes on Hono app
  ├─ Inject dashboard tabs into HTML template
  ├─ Build handleMessage / queuedHandleMessage
  │
  ├─ afterInit()          ← Called on all enabled plugins
  │   └─ Adapters register themselves and call start()
  │
  └─ Server listening
       │
       ... (runtime) ...
       │
  Server shutdown
  │
  └─ shutdown()           ← Called in reverse order on all enabled plugins
```

**Key rule:** `init()` must not depend on `handleMessage` — it doesn't exist yet. Use `afterInit()` for anything that needs to send/receive messages (like starting an adapter).

---

## 4. Phases

Phases determine loading order. Plugins within the same phase load in array order.

| Phase | Order | Use For |
|-------|:-----:|---------|
| `tools` | 1 | Tool-only plugins (no dependencies on adapters or routes) |
| `adapters` | 2 | Channel adapters (Telegram, Discord, Slack) |
| `routes` | 3 | HTTP route providers (webhook) |
| `services` | 4 | Background services that may depend on everything above |

Choose the earliest phase that satisfies your dependencies:
- Need nothing? Use `tools`.
- Need to register an adapter? Use `adapters`.
- Provide HTTP routes? Use `routes`.
- Need access to adapters + routes + handleMessage? Use `services`.

---

## 5. PluginContext

Provided to every plugin during `init()`:

```typescript
interface PluginContext {
  readonly config: AppConfig;          // Parsed config/default.yaml
  readonly workspacePath: string;      // Absolute path to workspace/
  readonly rootDir: string;            // Absolute path to repo root
  readonly registerTool: (tool) => void;
  readonly unregisterTool: (name) => void;
  readonly getAdapter: (prefix) => ChannelAdapterLike | undefined;
  readonly getAdapters: () => ChannelAdapterLike[];
  readonly log: (message) => void;     // Namespaced logger
  readonly warn: (message) => void;
}
```

### PluginAfterInitContext

Extended context available in `afterInit()`, adds:

```typescript
interface PluginAfterInitContext extends PluginContext {
  handleMessage: HandleMessageFnLike;        // Run an agent session
  queuedHandleMessage: HandleMessageFnLike;  // Queue-safe version (prevents interleaving)
  registerAdapter: (adapter) => void;        // Register a new adapter
}
```

Use `queuedHandleMessage` for adapters — it ensures only one session runs per channel at a time.

---

## 6. PluginCapabilities

Returned from `init()`. All fields are optional — return only what your plugin provides.

```typescript
interface PluginCapabilities {
  tools?: ToolDefinition[];          // Agent tools to register
  adapter?: ChannelAdapterLike;      // A channel adapter
  routes?: Hono;                     // Hono sub-app for HTTP routes
  routePrefix?: string;              // Mount point (default: /<plugin-name>)
  dashboardTabs?: DashboardTab[];    // Dashboard UI tabs
}
```

Return `null` from `init()` to disable the plugin entirely (e.g., when config is missing).

---

## 7. Creating a Plugin Package

### Directory structure

```
packages/plugin-myplugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### package.json

```json
{
  "name": "@baseagent/plugin-myplugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@baseagent/core": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Add `hono` to dependencies if you provide routes or dashboard tabs that need their own API.

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### Setup commands

```bash
# Create directory
mkdir -p packages/plugin-myplugin/src

# After creating package.json and tsconfig.json:
pnpm install

# Add the dependency to the server package
pnpm --filter @baseagent/server add @baseagent/plugin-myplugin@workspace:*
```

### Minimal plugin

```typescript
// packages/plugin-myplugin/src/index.ts
import type { Plugin, PluginContext, PluginCapabilities } from "@baseagent/core";

export function createMyPlugin(): Plugin {
  return {
    name: "myplugin",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      ctx.log("[myplugin] Plugin enabled");
      return {};
    },
  };
}
```

---

## 8. Registering Tools

Return `tools` from `init()`. Each tool follows the `ToolDefinition` schema with a Zod parameter schema.

```typescript
import { z } from "zod";
import type { Plugin, PluginContext, PluginCapabilities, ToolDefinition } from "@baseagent/core";

function createGreetTool(): ToolDefinition {
  return {
    name: "greet",
    description: "Greet someone by name",
    permission: "read",
    parameters: z.object({
      name: z.string().describe("Name of the person to greet"),
    }),
    async execute(args) {
      return `Hello, ${args.name}!`;
    },
  };
}

export function createMyPlugin(): Plugin {
  return {
    name: "myplugin",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      return {
        tools: [createGreetTool()],
      };
    },
  };
}
```

### Tool permission levels

| Permission | Governance policy applied | Use for |
|-----------|---------------------------|---------|
| `read` | Usually `auto-allow` | Read-only operations, lookups |
| `write` | Usually `confirm` | Data mutations, file writes |
| `exec` | Usually `confirm` or `deny` | Shell commands, external actions |

### Tool groups

Assign a `group` to participate in dynamic tool filtering (tools not relevant to the current input are suppressed to save tokens):

```typescript
{
  name: "greet",
  group: "social",
  // ...
}
```

Tools without a `group` are always included.

---

## 9. Registering Channel Adapters

Adapters need `handleMessage` which isn't available during `init()`. Use the two-phase pattern:

1. **`init()`** — check config, return empty capabilities (or `null` to disable)
2. **`afterInit()`** — create the adapter, register it, start it

```typescript
import type {
  Plugin, PluginContext, PluginCapabilities, PluginAfterInitContext,
} from "@baseagent/core";

export function createMyAdapterPlugin(): Plugin {
  let adapter: MyAdapter | undefined;

  return {
    name: "myadapter",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.myadapter;
      if (!config?.enabled || !config.token) {
        return null; // Disabled — no config
      }
      return {};
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.myadapter;
      if (!config?.enabled || !config.token) return;

      adapter = new MyAdapter(config.token, ctx.queuedHandleMessage);
      ctx.registerAdapter(adapter);
      await adapter.start();
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}
```

### ChannelAdapterLike interface

Your adapter must implement:

```typescript
interface ChannelAdapterLike {
  readonly name: string;                    // Prefix for channelId (e.g. "telegram")
  start(): Promise<void>;                   // Connect and begin receiving messages
  stop(): Promise<void>;                    // Graceful disconnect
  sendMessage?(channelId, text): Promise<void>;              // Optional: send proactive messages
  requestConfirmation?(channelId, prompt, timeoutMs): Promise<{ approved; reason? }>;  // Optional: governance confirmations
}
```

The `name` property is used as the channel prefix. When the adapter receives a message, it should call `handleMessage` with a channel ID in the format `<name>:<platformId>` (e.g. `telegram:12345`).

---

## 10. Providing HTTP Routes

Return a Hono sub-app from `init()`. It will be mounted at `routePrefix` (defaults to `/<plugin-name>`).

```typescript
import { Hono } from "hono";
import type { Plugin, PluginContext, PluginCapabilities } from "@baseagent/core";

export function createMyPlugin(): Plugin {
  return {
    name: "myplugin",
    phase: "routes",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const app = new Hono();

      app.get("/status", (c) => c.json({ ok: true }));
      app.post("/action", async (c) => {
        const body = await c.req.json();
        return c.json({ received: body });
      });

      return {
        routes: app,
        routePrefix: "/myplugin",  // Mounted at /myplugin/status, /myplugin/action
      };
    },
  };
}
```

If `routePrefix` is omitted, the plugin name is used: `/<name>`.

---

## 11. Adding Dashboard Tabs

Plugins can contribute tabs to the dashboard UI. Tabs are only visible when the plugin is loaded.

### DashboardTab interface

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `id` | `string` | Yes | Unique key — used in CSS class names and tab switching |
| `label` | `string` | Yes | Display label in the nav bar |
| `panelHtml` | `string` | Yes | HTML markup — root element **must** use class `{id}-panel` |
| `css` | `string` | No | Additional CSS rules injected into the dashboard `<style>` |
| `js` | `string` | No | JS code block injected into the dashboard `<script>` |
| `onActivate` | `string` | No | JS expression called once on first tab activation (lazy loading) |

### Convention

The `panelHtml` root element **must** have the CSS class `{id}-panel`. The server auto-generates show/hide rules:

```css
/* Auto-generated */
.myplugin-panel { display: none; grid-column: 1 / -1; }
.layout.tab-myplugin .myplugin-panel { display: flex; }
```

### Host page helpers

The dashboard provides these global functions your JS can use:

| Function | Description |
|----------|-------------|
| `fetchJSON(url)` | Fetch JSON with error handling |
| `escapeHtml(str)` | HTML-escape a string |
| `formatTime(iso)` | Format ISO timestamp for display |
| `channelColorClass(channelId)` | CSS class for channel badge colour |
| `switchTab(tabId)` | Programmatic tab switching |

### Example

Define the tab in a separate file for clarity:

```typescript
// packages/plugin-myplugin/src/dashboard-tab.ts
import type { DashboardTab } from "@baseagent/core";

export const myDashboardTab: DashboardTab = {
  id: "myplugin",
  label: "My Plugin",
  onActivate: "loadMyPluginData()",

  css: `
.myplugin-panel {
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
}
.myplugin-title {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
}
`,

  panelHtml: `
<section class="myplugin-panel" id="myplugin-panel">
  <div class="myplugin-title">My Plugin Dashboard</div>
  <div id="myplugin-content">
    <div class="loading"><div class="loading-spinner"></div></div>
  </div>
</section>
`,

  js: `
async function loadMyPluginData() {
  var el = document.getElementById('myplugin-content');
  if (!el) return;
  try {
    var data = await fetchJSON('/myplugin/data');
    el.innerHTML = '<pre>' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
  } catch (e) {
    el.innerHTML = '<div class="empty-state-text">Failed: ' + escapeHtml(e.message) + '</div>';
  }
}
`,
};
```

Then return it from `init()`:

```typescript
// packages/plugin-myplugin/src/index.ts
import { Hono } from "hono";
import type { Plugin, PluginContext, PluginCapabilities } from "@baseagent/core";
import { myDashboardTab } from "./dashboard-tab.js";

export function createMyPlugin(): Plugin {
  return {
    name: "myplugin",
    phase: "services",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const app = new Hono();
      app.get("/data", (c) => c.json({ items: ["a", "b", "c"] }));

      return {
        routes: app,
        routePrefix: "/myplugin",
        dashboardTabs: [myDashboardTab],
      };
    },
  };
}
```

### Dashboard tab tips

- DOM lookups should be lazy (inside functions, not at top level) — the panel HTML may not exist when the script first runs
- Use `var` instead of `const`/`let` for top-level declarations to avoid redeclaration errors if the script is somehow evaluated twice
- Prefix all function/variable names with your plugin name to avoid collisions with other plugin scripts
- Use `onActivate` for data loading — avoids fetching data for tabs the user may never click
- Keyboard shortcuts `5`–`9` are auto-assigned to plugin tabs in registration order (max 5 shortcutted tabs)

See [ADR-008](DECISIONS.md#adr-008-plugin-dashboard-extension-system) for the architectural decision.

---

## 12. Wiring Into the Server

After creating your plugin package, register it in `packages/server/src/plugins/resolve-plugins.ts`:

```typescript
// In resolvePlugins():

// Conditionally loaded (config-gated)
if (config.myFeature?.enabled) {
  const { createMyPlugin } = await import("@baseagent/plugin-myplugin");
  plugins.push(createMyPlugin());
}

// Or always loaded
{
  const { createMyPlugin } = await import("@baseagent/plugin-myplugin");
  plugins.push(createMyPlugin());
}
```

Plugins are dynamically imported — unused platform SDKs are never loaded.

### Don't forget

1. Add the workspace dependency to the server:
   ```bash
   pnpm --filter @baseagent/server add @baseagent/plugin-myplugin@workspace:*
   ```
2. Run `pnpm install` to link the workspace package
3. Verify with `pnpm --filter @baseagent/server typecheck`

---

## 13. Error Handling

- **`init()` failures are isolated.** If a plugin throws during `init()`, it is logged and skipped — other plugins continue loading.
- **`afterInit()` failures are isolated.** Same behaviour — logged and skipped.
- **`shutdown()` failures are logged** but don't prevent other plugins from shutting down.
- **Return `null`** from `init()` to cleanly disable your plugin (e.g., missing config). This is not an error — it's silent opt-out.

```typescript
async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
  if (!ctx.config.myFeature?.enabled) {
    return null;  // Disabled — no log noise
  }
  // ...
}
```

---

## 14. Existing Plugins

Reference implementations to learn from:

| Plugin | Package | Phase | Capabilities |
|--------|---------|-------|-------------|
| Telegram | `@baseagent/plugin-telegram` | `adapters` | Channel adapter |
| Discord | `@baseagent/plugin-discord` | `adapters` | Channel adapter |
| Slack | `@baseagent/plugin-slack` | `adapters` | Channel adapter |
| Webhook | `@baseagent/plugin-webhook` | `routes` | Signals webhook route |
| Heartbeat | `@baseagent/plugin-heartbeat` | `services` | Signals heartbeat scheduler |
| Scheduler | `@baseagent/plugin-scheduler` | `services` | Tools + routes + dashboard tab |

The **scheduler plugin** is the most complete example — it demonstrates tools, HTTP routes, and a dashboard tab all in one plugin. Start there if you're building something similar.

---

## Further Reading

- [CAPABILITIES.md](CAPABILITIES.md) — Full capabilities reference
- [DECISIONS.md](DECISIONS.md) — Architectural decisions (ADR-008 covers the dashboard extension system)
- `packages/core/src/plugin.ts` — Type definitions
- `packages/server/src/plugins/plugin-loader.ts` — Loading and lifecycle logic
- `packages/server/src/plugins/resolve-plugins.ts` — Plugin registration
