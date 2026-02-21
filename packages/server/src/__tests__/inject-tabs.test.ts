import { describe, it, expect } from "vitest";
import { injectPluginTabs } from "../dashboard/inject-tabs.js";
import type { DashboardTab } from "@baseagent/core";

const TEMPLATE = [
  "<html>",
  "<!-- __PLUGIN_TAB_BUTTONS__ -->",
  "<!-- __PLUGIN_PANELS__ -->",
  "<style>/* __PLUGIN_CSS__ */</style>",
  "<script>// __PLUGIN_JS__",
  "// __PLUGIN_KEYBOARD_SHORTCUTS__</script>",
  "</html>",
].join("\n");

const TAB: DashboardTab = {
  id: "tasks",
  label: "Tasks",
  panelHtml: '<div class="tasks-panel">content</div>',
  css: ".tasks-panel { color: green; }",
  js: "function loadTasks() {}",
  onActivate: "loadTasks()",
};

describe("injectPluginTabs", () => {
  it("clears all placeholders when no tabs provided", () => {
    const result = injectPluginTabs(TEMPLATE, []);
    expect(result).not.toContain("__PLUGIN_");
    expect(result).toContain("<html>");
  });

  it("injects tab button with correct data-tab and onclick", () => {
    const result = injectPluginTabs(TEMPLATE, [TAB]);
    expect(result).toContain('data-tab="tasks"');
    expect(result).toContain("switchTab('tasks')");
    expect(result).toContain(">Tasks<");
  });

  it("injects panel HTML", () => {
    const result = injectPluginTabs(TEMPLATE, [TAB]);
    expect(result).toContain('<div class="tasks-panel">content</div>');
  });

  it("injects CSS with auto-generated show/hide rules", () => {
    const result = injectPluginTabs(TEMPLATE, [TAB]);
    expect(result).toContain(".tasks-panel { display: none;");
    expect(result).toContain(".layout.tab-tasks .tasks-panel { display: flex; }");
    expect(result).toContain(".tasks-panel { color: green; }");
  });

  it("injects JS with onActivate registration", () => {
    const result = injectPluginTabs(TEMPLATE, [TAB]);
    expect(result).toContain("_pluginTabActivated['tasks'] = false;");
    expect(result).toContain("window['_pluginActivate_tasks']");
    expect(result).toContain("loadTasks()");
    expect(result).toContain("function loadTasks() {}");
  });

  it("injects keyboard shortcuts starting at key 6", () => {
    const result = injectPluginTabs(TEMPLATE, [TAB]);
    expect(result).toContain("e.key === '6'");
    expect(result).toContain("switchTab('tasks')");
  });

  it("handles multiple tabs", () => {
    const tab2: DashboardTab = { id: "logs", label: "Logs", panelHtml: '<div class="logs-panel">logs</div>' };
    const result = injectPluginTabs(TEMPLATE, [TAB, tab2]);
    expect(result).toContain('data-tab="tasks"');
    expect(result).toContain('data-tab="logs"');
    expect(result).toContain("e.key === '6'");
    expect(result).toContain("e.key === '7'");
  });

  it("limits keyboard shortcuts to single-digit keys (max key 9)", () => {
    const tabs = Array.from({ length: 6 }, (_, i) => ({
      id: `tab${i}`,
      label: `Tab ${i}`,
      panelHtml: `<div class="tab${i}-panel"></div>`,
    }));
    const result = injectPluginTabs(TEMPLATE, tabs);
    // Keys 6-9 = 4 shortcuts, tabs 4 and 5 exceed key 9
    expect(result).toContain("e.key === '9'");
    expect(result).not.toContain("e.key === '10'");
  });

  it("skips onActivate when not provided", () => {
    const tab: DashboardTab = { id: "simple", label: "Simple", panelHtml: '<div class="simple-panel"></div>' };
    const result = injectPluginTabs(TEMPLATE, [tab]);
    expect(result).not.toContain("_pluginTabActivated");
    expect(result).not.toContain("_pluginActivate_");
  });
});
