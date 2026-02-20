import type { DashboardTab } from "@baseagent/core";

export const schedulerDashboardTab: DashboardTab = {
  id: "tasks",
  label: "Tasks",
  onActivate: "loadTasks()",

  css: `
.tasks-panel {
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}

.tasks-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.tasks-header-title {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
}

.tasks-subtitle {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
}

.tasks-reload-btn {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.tasks-reload-btn:hover { color: var(--text-1); border-color: var(--border-active); }

.tasks-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 10px;
  align-content: start;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}

.task-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 13px 15px;
  transition: border-color 0.15s;
  animation: fadeUp 0.2s var(--ease);
}
.task-card:hover { border-color: var(--border-active); }

.task-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
}

.task-card-id {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  flex-shrink: 0;
}

.task-card-desc {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-0);
  margin-bottom: 10px;
  word-break: break-word;
}

.task-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.task-meta-item {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
}

.badge-task-pending { background: var(--accent-dim); color: var(--accent); }
.badge-task-running { background: rgba(79,143,255,.1); color: var(--blue); animation: pulse 1.5s infinite; }
.badge-task-completed { background: rgba(79,255,143,.1); color: var(--green); }
.badge-task-failed { background: rgba(255,79,106,.1); color: var(--red); }

@media (max-width: 700px) {
  .tasks-grid { grid-template-columns: 1fr; padding: 12px 14px; }
}
`,

  panelHtml: `
<section class="tasks-panel" id="tasks-panel">
  <div class="tasks-header">
    <div class="tasks-header-title">Scheduled Tasks</div>
    <span class="tasks-subtitle">workspace/SCHEDULED_TASKS.json</span>
    <button class="tasks-reload-btn" onclick="loadTasks()">Reload</button>
  </div>
  <div class="tasks-grid" id="tasks-grid">
    <div class="loading" style="grid-column:1/-1"><div class="loading-spinner"></div></div>
  </div>
</section>
`,

  js: `
let tasksData = null;

async function loadTasks() {
  var el = document.getElementById('tasks-grid');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="loading-spinner"></div></div>';
  try {
    var data = await fetchJSON('/scheduler/tasks');
    tasksData = data.tasks;
    renderTasks(tasksData);
  } catch (e) {
    el.innerHTML = '<div class="empty-state-text" style="padding:20px;grid-column:1/-1">Failed to load tasks: ' + escapeHtml(e.message) + '</div>';
  }
}

function renderTasks(tasks) {
  var el = document.getElementById('tasks-grid');
  if (!el) return;
  if (!tasks || tasks.length === 0) {
    el.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-state-icon">&#x23F0;</div>' +
        '<div class="empty-state-text">' +
          'No scheduled tasks yet.<br>' +
          '<span style="color:var(--text-2)">Use the schedule_task tool to create one.</span>' +
        '</div>' +
      '</div>';
    return;
  }

  el.innerHTML = tasks.map(function(t) {
    var shortId = t.id.slice(0, 8);
    var executeTime = formatTaskTime(t.executeAt);
    var createdTime = formatTime(t.createdAt);

    return '<div class="task-card">' +
      '<div class="task-card-top">' +
        '<span class="task-card-id">' + escapeHtml(shortId) + '</span>' +
        '<span class="badge badge-task-' + t.status + '">' + t.status + '</span>' +
      '</div>' +
      '<div class="task-card-desc">' + escapeHtml(t.task) + '</div>' +
      '<div class="task-card-meta">' +
        '<span class="task-meta-item">Runs: ' + executeTime + '</span>' +
        (t.channelId ? '<span class="channel-tag ' + channelColorClass(t.channelId) + '">' + escapeHtml(t.channelId.split(':')[0]) + '</span>' : '') +
        '<span class="task-meta-item" style="margin-left:auto">Created ' + createdTime + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function formatTaskTime(iso) {
  if (!iso) return '\\u2014';
  var d = new Date(iso);
  var now = new Date();
  var diff = d - now;
  if (diff > 0 && diff < 86400000) {
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    return 'in ' + h + 'h ' + m + 'm';
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
`,
};
