import type { DashboardTab } from "@baseagent/core";

/**
 * Inject plugin-contributed dashboard tabs into the HTML template.
 *
 * Replaces well-known placeholder comments/tokens in the raw HTML with
 * tab buttons, CSS, panel HTML, JS, and keyboard shortcuts contributed
 * by plugins.
 *
 * Placeholders expected in the template:
 *  - `<!-- __PLUGIN_TAB_BUTTONS__ -->`
 *  - `<!-- __PLUGIN_PANELS__ -->`
 *  - `/* __PLUGIN_CSS__ * /`        (without space)
 *  - `// __PLUGIN_JS__`
 *  - `// __PLUGIN_KEYBOARD_SHORTCUTS__`
 */
export function injectPluginTabs(html: string, tabs: DashboardTab[]): string {
  if (tabs.length === 0) return html
    .replace("<!-- __PLUGIN_TAB_BUTTONS__ -->", "")
    .replace("<!-- __PLUGIN_PANELS__ -->", "")
    .replace("/* __PLUGIN_CSS__ */", "")
    .replace("// __PLUGIN_JS__", "")
    .replace("// __PLUGIN_KEYBOARD_SHORTCUTS__", "");

  const NEXT_KEY = 6; // Built-in tabs use 1-5

  const tabButtons = tabs.map((t) =>
    `<button class="tab-btn" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`,
  ).join("\n    ");

  const panelHtml = tabs.map((t) => t.panelHtml).join("\n");

  const css = tabs
    .map((t) => {
      // Auto-generate default-hidden + full-width + show rule, then append custom CSS
      const base = `.${t.id}-panel { display: none; grid-column: 1 / -1; }\n` +
        `.layout.tab-${t.id} .${t.id}-panel { display: flex; }`;
      return t.css ? `${base}\n${t.css}` : base;
    })
    .join("\n");

  const js = tabs.map((t) => {
    const parts: string[] = [];
    // Register the one-shot activator
    if (t.onActivate) {
      parts.push(`_pluginTabActivated['${t.id}'] = false;`);
      parts.push(`window['_pluginActivate_${t.id}'] = function() { ${t.onActivate} };`);
    }
    if (t.js) parts.push(t.js);
    return parts.join("\n");
  }).join("\n\n");

  const keyboardShortcuts = tabs
    .filter((_, i) => NEXT_KEY + i <= 9) // Only single-digit keys (5-9)
    .map((t, i) =>
      `  else if (e.key === '${NEXT_KEY + i}') switchTab('${t.id}');`,
    ).join("\n");

  return html
    .replace("<!-- __PLUGIN_TAB_BUTTONS__ -->", tabButtons)
    .replace("<!-- __PLUGIN_PANELS__ -->", panelHtml)
    .replace("/* __PLUGIN_CSS__ */", css)
    .replace("// __PLUGIN_JS__", js)
    .replace("// __PLUGIN_KEYBOARD_SHORTCUTS__", keyboardShortcuts);
}
