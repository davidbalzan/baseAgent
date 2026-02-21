import type { DashboardTab } from "@baseagent/core";

export const docsDashboardTab: DashboardTab = {
  id: "docs",
  label: "Docs",
  onActivate: "loadDocs()",

  css: `
.docs-panel {
  flex-direction: row;
  overflow: hidden;
  height: calc(100vh - var(--topbar-h));
}

.docs-sidebar {
  width: 220px;
  min-width: 180px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
  padding: 16px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}

.docs-sidebar-section {
  padding: 0 14px;
  margin-bottom: 16px;
}

.docs-sidebar-heading {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
  padding: 0 6px 8px;
}

.docs-sidebar-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 2px;
  background: none;
  border: none;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-1);
  text-align: left;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.docs-sidebar-item:hover { background: var(--bg-2); color: var(--text-0); }
.docs-sidebar-item.active { background: var(--accent-dim); color: var(--accent); }

.docs-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}

.docs-content-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* ── Markdown rendering ── */
.docs-md h1, .docs-md h2, .docs-md h3, .docs-md h4 {
  font-family: var(--font-sans);
  color: var(--text-0);
  margin-top: 1.6em;
  margin-bottom: 0.6em;
  line-height: 1.3;
}
.docs-md h1 { font-size: 1.6rem; font-weight: 600; margin-top: 0; }
.docs-md h2 { font-size: 1.25rem; font-weight: 600; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.docs-md h3 { font-size: 1.05rem; font-weight: 500; }
.docs-md h4 { font-size: 0.95rem; font-weight: 500; color: var(--text-1); }

.docs-md p { margin-bottom: 0.8em; line-height: 1.65; color: var(--text-1); }
.docs-md a { color: var(--accent); text-decoration: none; }
.docs-md a:hover { text-decoration: underline; }

.docs-md ul, .docs-md ol { margin-bottom: 0.8em; padding-left: 1.5em; color: var(--text-1); }
.docs-md li { margin-bottom: 0.3em; line-height: 1.55; }
.docs-md li > ul, .docs-md li > ol { margin-top: 0.3em; margin-bottom: 0; }

.docs-md code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--accent);
}

.docs-md pre {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 1em;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}
.docs-md pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--text-0);
  line-height: 1.5;
}

.docs-md blockquote {
  border-left: 3px solid var(--accent);
  margin: 0 0 1em;
  padding: 8px 16px;
  background: var(--accent-glow);
  border-radius: 0 var(--radius) var(--radius) 0;
  color: var(--text-1);
}

.docs-md table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  font-size: 0.9rem;
}
.docs-md th, .docs-md td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
.docs-md th {
  background: var(--bg-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-2);
}
.docs-md td { color: var(--text-1); }

.docs-md hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.5em 0;
}

.docs-md strong { color: var(--text-0); font-weight: 600; }
.docs-md em { color: var(--text-1); }

@media (max-width: 700px) {
  .docs-panel { flex-direction: column; }
  .docs-sidebar { width: 100%; min-width: unset; max-height: 160px; border-right: none; border-bottom: 1px solid var(--border); }
  .docs-content { padding: 16px; }
}
`,

  panelHtml: `
<section class="docs-panel" id="docs-panel">
  <nav class="docs-sidebar" id="docs-sidebar">
    <div class="docs-content-loading"><div class="loading-spinner"></div></div>
  </nav>
  <div class="docs-content" id="docs-content">
    <div class="docs-content-loading"><div class="loading-spinner"></div></div>
  </div>
</section>
`,

  js: `
let docsIndex = null;
let docsActiveFile = null;

async function loadDocs() {
  var sidebar = document.getElementById('docs-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '<div class="docs-content-loading"><div class="loading-spinner"></div></div>';
  try {
    var data = await fetchJSON('/docs-plugin/index');
    docsIndex = data.files;
    renderDocsSidebar(docsIndex);
    if (docsIndex.length > 0) {
      loadDoc(docsIndex[0].filename);
    }
  } catch (e) {
    sidebar.innerHTML = '<div style="padding:16px;color:var(--text-2)">Failed to load docs: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderDocsSidebar(files) {
  var sidebar = document.getElementById('docs-sidebar');
  if (!sidebar) return;

  var coreFiles = files.filter(function(f) { return f.source === 'core'; });
  var pluginFiles = files.filter(function(f) { return f.source === 'plugin'; });

  var html = '';

  if (coreFiles.length > 0) {
    html += '<div class="docs-sidebar-section">';
    html += '<div class="docs-sidebar-heading">Core</div>';
    coreFiles.forEach(function(f) {
      html += '<button class="docs-sidebar-item" data-filename="' + escapeHtml(f.filename) + '" onclick="loadDoc(\\'' + escapeHtml(f.filename) + '\\')">' + escapeHtml(f.title) + '</button>';
    });
    html += '</div>';
  }

  if (pluginFiles.length > 0) {
    html += '<div class="docs-sidebar-section">';
    html += '<div class="docs-sidebar-heading">Plugins</div>';
    pluginFiles.forEach(function(f) {
      html += '<button class="docs-sidebar-item" data-filename="' + escapeHtml(f.filename) + '" onclick="loadDoc(\\'' + escapeHtml(f.filename) + '\\')">' + escapeHtml(f.title) + '</button>';
    });
    html += '</div>';
  }

  sidebar.innerHTML = html;
}

async function loadDoc(filename) {
  docsActiveFile = filename;

  // Update sidebar active state
  var items = document.querySelectorAll('.docs-sidebar-item');
  items.forEach(function(item) {
    if (item.getAttribute('data-filename') === filename) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  var content = document.getElementById('docs-content');
  if (!content) return;
  content.innerHTML = '<div class="docs-content-loading"><div class="loading-spinner"></div></div>';

  try {
    var data = await fetchJSON('/docs-plugin/file/' + encodeURIComponent(filename));
    content.innerHTML = '<div class="docs-md">' + data.html + '</div>';
  } catch (e) {
    content.innerHTML = '<div style="padding:20px;color:var(--text-2)">Failed to load document: ' + escapeHtml(e.message) + '</div>';
  }
}
`,
};
