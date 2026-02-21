import type { DashboardTab } from "@baseagent/core";

export const chatDashboardTab: DashboardTab = {
  id: "chat",
  label: "Chat",
  onActivate: "initChat()",

  css: `
.chat-panel {
  position: relative;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.chat-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-header-title {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
}

.chat-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
}

.chat-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-2);
  transition: background 0.3s;
}
.chat-status-dot.connected { background: var(--green); }
.chat-status-dot.disconnected { background: var(--red); }

.chat-channel-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(79,240,224,.12);
  color: var(--cyan);
}

.chat-clear-btn {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.chat-clear-btn:hover { color: var(--text-1); border-color: var(--border-active); }
.chat-clear-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.chat-session-select {
  min-width: 220px;
  max-width: 320px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-1);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 8px;
  outline: none;
}
.chat-session-select:focus { border-color: var(--accent); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-3) transparent;
}

.chat-msg {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
  animation: fadeUp 0.2s var(--ease);
  position: relative;
}

.chat-msg-time {
  display: block;
  font-size: 9px;
  color: var(--text-2);
  margin-bottom: 4px;
  opacity: 0.7;
}

.chat-msg.user {
  align-self: flex-end;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(224,255,79,.15);
}

.chat-msg.assistant {
  align-self: flex-start;
  background: var(--bg-1);
  color: var(--text-0);
  border: 1px solid var(--border);
}

/* Lightweight markdown rendering */
.chat-msg.assistant strong { color: var(--text-0); font-weight: 700; }
.chat-msg.assistant em { font-style: italic; color: var(--text-1); }
.chat-msg.assistant code {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
}
.chat-msg.assistant pre {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 6px 0;
  overflow-x: auto;
  white-space: pre;
  font-size: 11px;
  line-height: 1.5;
}
.chat-msg.assistant pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
}

.chat-msg.tool-call {
  align-self: flex-start;
  background: rgba(79,143,255,.06);
  color: var(--text-2);
  font-size: 10px;
  padding: 5px 10px;
  border: 1px solid rgba(79,143,255,.12);
}

/* Typing indicator */
.chat-typing {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  animation: fadeUp 0.2s var(--ease);
}
.chat-typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-2);
  animation: chatTypingPulse 1.4s infinite ease-in-out;
}
.chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes chatTypingPulse {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.chat-activity-toasts {
  position: absolute;
  right: 16px;
  bottom: 74px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 360px;
  pointer-events: none;
  z-index: 7;
}

.chat-tool-toast {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-1) 88%, black);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-1);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  opacity: 1;
  transform: translateY(0);
  transition: opacity .25s ease, transform .25s ease;
}

.chat-tool-toast.fade {
  opacity: 0;
  transform: translateY(6px);
}

.chat-tool-toast-title {
  font-size: 10px;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.chat-tool-toast-detail {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.4;
}

.chat-tool-toast.running { border-color: rgba(79,143,255,.35); }
.chat-tool-toast.success { border-color: rgba(79,255,143,.35); }
.chat-tool-toast.error { border-color: rgba(255,79,106,.35); }
.chat-tool-toast.governance { border-color: rgba(255,159,67,.35); }

.chat-msg.confirmation {
  align-self: flex-start;
  background: rgba(255,159,67,.08);
  color: var(--orange);
  border: 1px solid rgba(255,159,67,.2);
}

.chat-msg.proactive {
  align-self: flex-start;
  background: rgba(160,111,255,.08);
  color: var(--violet);
  border: 1px solid rgba(160,111,255,.15);
}

.chat-msg.error {
  align-self: flex-start;
  background: rgba(255,79,106,.08);
  color: var(--red);
  border: 1px solid rgba(255,79,106,.15);
  font-size: 11px;
}

.chat-confirm-btns {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.chat-confirm-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 20px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
  letter-spacing: 0.02em;
}
.chat-confirm-btn.approve {
  background: rgba(79,255,143,.1);
  color: var(--green);
  border-color: rgba(79,255,143,.3);
}
.chat-confirm-btn.approve:hover { background: rgba(79,255,143,.22); }
.chat-confirm-btn.deny {
  background: rgba(255,79,106,.1);
  color: var(--red);
  border-color: rgba(255,79,106,.3);
}
.chat-confirm-btn.deny:hover { background: rgba(255,79,106,.22); }

.chat-input-row {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: var(--bg-0);
}

.chat-textarea {
  flex: 1;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-0);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 10px 14px;
  resize: none;
  min-height: 20px;
  max-height: 140px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.chat-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-dim);
}
.chat-textarea::placeholder { color: var(--text-2); }

.chat-send-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--bg-0);
  background: var(--accent);
  border: none;
  border-radius: var(--radius);
  padding: 10px 20px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  white-space: nowrap;
  position: relative;
}
.chat-send-btn:hover { opacity: 0.85; }
.chat-send-btn:active { transform: scale(0.97); }
.chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.chat-send-btn.sending {
  color: transparent;
}
.chat-send-btn.sending::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border: 2px solid var(--bg-0);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 40px 20px;
}

.chat-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  opacity: 0.5;
}

.chat-empty-hint {
  font-size: 10px;
  color: var(--text-2);
  opacity: 0.6;
}
.chat-empty-hint kbd {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 9px;
  font-family: var(--font-mono);
}

.chat-steps-wrap {
  width: 100%;
}

.chat-steps {
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-2);
  padding: 0;
}

.chat-steps > summary {
  list-style: none;
  cursor: pointer;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-1);
}

.chat-steps > summary::-webkit-details-marker {
  display: none;
}

.chat-steps > summary::before {
  content: '\\25B6';
  display: inline-block;
  margin-right: 6px;
  color: var(--text-2);
  transform: translateY(-1px);
}

.chat-steps[open] > summary::before {
  content: '\\25BC';
}

.chat-steps-body {
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-1);
  white-space: pre-wrap;
  max-height: 220px;
  overflow-y: auto;
}

.chat-tool-activity > summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-tool-count {
  font-size: 10px;
  color: var(--text-2);
}

.chat-tool-events {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-tool-event {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-1);
}

.chat-tool-event > summary {
  cursor: pointer;
  list-style: none;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
}

.chat-tool-event > summary::-webkit-details-marker {
  display: none;
}

.chat-tool-event-badge {
  font-size: 10px;
  letter-spacing: .04em;
  text-transform: uppercase;
  border-radius: 10px;
  padding: 2px 6px;
  border: 1px solid transparent;
}

.chat-tool-event-name {
  font-size: 11px;
  color: var(--text-1);
}

.chat-tool-event-time {
  margin-left: auto;
  color: var(--text-2);
  font-size: 10px;
}

.chat-tool-event-detail {
  border-top: 1px solid var(--border);
  padding: 8px 9px;
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.45;
  white-space: pre-wrap;
}

.chat-tool-event.running { border-color: rgba(79,143,255,.26); }
.chat-tool-event.running .chat-tool-event-badge { color: var(--blue); border-color: rgba(79,143,255,.35); background: rgba(79,143,255,.12); }
.chat-tool-event.success { border-color: rgba(79,255,143,.26); }
.chat-tool-event.success .chat-tool-event-badge { color: var(--green); border-color: rgba(79,255,143,.35); background: rgba(79,255,143,.12); }
.chat-tool-event.error { border-color: rgba(255,79,106,.26); }
.chat-tool-event.error .chat-tool-event-badge { color: var(--red); border-color: rgba(255,79,106,.35); background: rgba(255,79,106,.12); }
.chat-tool-event.governance { border-color: rgba(255,159,67,.26); }
.chat-tool-event.governance .chat-tool-event-badge { color: var(--orange); border-color: rgba(255,159,67,.35); background: rgba(255,159,67,.12); }

@media (max-width: 700px) {
  .chat-msg { max-width: 95%; }
  .chat-messages { padding: 12px 14px; }
  .chat-input-row { padding: 10px 14px; }
  .chat-session-select {
    min-width: 120px;
    max-width: 160px;
  }
}
`,

  panelHtml: `
<section class="chat-panel" id="chat-panel">
  <div class="chat-header">
    <div class="chat-header-title">Chat</div>
    <div class="chat-status">
      <span class="chat-status-dot" id="chat-status-dot"></span>
      <span id="chat-status-text">Connecting...</span>
    </div>
    <span class="chat-channel-tag">dashboard:web</span>
    <select class="chat-session-select" id="chat-session-select" title="Load a previous chat session"></select>
    <button class="chat-clear-btn" onclick="refreshChatSessions()">Refresh</button>
    <button class="chat-clear-btn" id="chat-load-btn" onclick="loadSelectedChatSession()">Load</button>
    <button class="chat-clear-btn" id="chat-resume-btn" onclick="resumeSelectedChatSession()">Resume</button>
    <button class="chat-clear-btn" onclick="clearChatMessages()">Clear</button>
  </div>
  <div class="chat-messages" id="chat-messages">
    <div class="chat-empty" id="chat-empty">
      <div class="chat-empty-icon">&#x1F4AC;</div>
      <div>Send a message to start chatting</div>
      <div class="chat-empty-hint">Press <kbd>Enter</kbd> to send &middot; <kbd>Shift+Enter</kbd> for new line</div>
    </div>
  </div>
  <div class="chat-activity-toasts" id="chat-activity-toasts"></div>
  <div class="chat-input-row">
    <textarea class="chat-textarea" id="chat-input" placeholder="Type a message..." rows="1"></textarea>
    <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMessage()">Send</button>
  </div>
</section>
`,

  js: `
var chatEventSource = null;
var chatStreamingEl = null;
var chatStreamBuf = '';
var chatSessionCache = [];
var chatCurrentSessionId = null;
var chatToolEvents = [];
var chatToolEventCounter = 0;
var chatTypingEl = null;

function chatRenderMd(text) {
  // Lightweight markdown: code blocks, inline code, bold, italic
  var s = String(text);
  // Escape HTML first
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code blocks: \`\`\`lang\\n...\\n\`\`\`
  s = s.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
    return '<pre><code>' + code + '</code></pre>';
  });
  // Inline code
  s = s.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  // Bold
  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  // Italic
  s = s.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
  return s;
}

function chatTimeLabel() {
  var d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function showTypingIndicator() {
  removeTypingIndicator();
  var container = document.getElementById('chat-messages');
  if (!container) return;
  chatTypingEl = document.createElement('div');
  chatTypingEl.className = 'chat-typing';
  chatTypingEl.id = 'chat-typing';
  chatTypingEl.innerHTML = '<div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div>';
  container.appendChild(chatTypingEl);
  scrollChat();
}

function removeTypingIndicator() {
  if (chatTypingEl && chatTypingEl.parentElement) {
    chatTypingEl.parentElement.removeChild(chatTypingEl);
  }
  chatTypingEl = null;
}

function initChat() {
  if (chatEventSource) { chatEventSource.close(); }

  resetToolActivity();
  refreshChatSessions();

  chatEventSource = new EventSource('/chat/events');

  chatEventSource.addEventListener('ping', function() {
    setChatStatus('connected', 'Connected');
  });

  chatEventSource.addEventListener('session_started', function(e) {
    var data = JSON.parse(e.data);
    chatCurrentSessionId = data.sessionId || null;
    resetToolActivity();
    showTypingIndicator();
  });

  chatEventSource.addEventListener('text_delta', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    removeTypingIndicator();
    if (!chatStreamingEl) {
      chatStreamBuf = '';
      chatStreamingEl = appendChatMsg('assistant', '', true);
    }
    chatStreamBuf += data.delta;
    // Render markdown for the streaming content
    var contentEl = chatStreamingEl.querySelector('.chat-msg-content') || chatStreamingEl;
    contentEl.innerHTML = chatRenderMd(chatStreamBuf);
    scrollChat();
  });

  chatEventSource.addEventListener('text_reset', function() {
    if (chatStreamingEl) {
      chatStreamBuf = '';
      var contentEl = chatStreamingEl.querySelector('.chat-msg-content') || chatStreamingEl;
      contentEl.innerHTML = '';
    }
  });

  chatEventSource.addEventListener('tool_call', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    removeTypingIndicator();
    var name = data && data.toolName ? String(data.toolName) : 'tool';
    pushToolActivity('running', name, 'Tool call requested.');
    showToolToast('running', 'Running ' + name, 'Tool call started');
    showTypingIndicator();
    scrollChat();
  });

  chatEventSource.addEventListener('finish', function(e) {
    var data = JSON.parse(e.data);
    var sessionId = data.sessionId || chatCurrentSessionId;
    chatStreamingEl = null;
    chatStreamBuf = '';
    removeTypingIndicator();
    enableChatInput();
    collapseToolActivity();
    if (sessionId) {
      renderChatStepsForSession(sessionId);
      chatCurrentSessionId = sessionId;
    }
  });

  chatEventSource.addEventListener('tool_result', function(e) {
    var data = JSON.parse(e.data);
    var name = data && data.toolName ? String(data.toolName) : 'tool';
    if (data && data.success === false) {
      var err = data.error ? String(data.error) : 'Unknown error';
      pushToolActivity('error', name, err);
      showToolToast('error', name + ' failed', err);
      hideEmpty();
      removeTypingIndicator();
      appendChatMsg('error', '\\u26A0 ' + name + ' failed: ' + err);
      scrollChat();
      return;
    }
    pushToolActivity('success', name, 'Completed successfully.');
    showToolToast('success', name + ' completed', 'Result available in activity log');
  });

  chatEventSource.addEventListener('error_event', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    removeTypingIndicator();
    appendChatMsg('error', data.message);
    chatStreamingEl = null;
    chatStreamBuf = '';
    enableChatInput();
    scrollChat();
  });

  chatEventSource.addEventListener('confirmation', function(e) {
    var data = JSON.parse(e.data);
    var awaitingTool = toolNameFromConfirmationPrompt(data.prompt);
    pushToolActivity('governance', awaitingTool || 'approval', 'Waiting for manual confirmation.');
    showToolToast('governance', 'Approval needed', awaitingTool ? awaitingTool : 'Review request in chat');
    hideEmpty();
    removeTypingIndicator();
    var el = appendChatMsg('confirmation', data.prompt);
    var btns = document.createElement('div');
    btns.className = 'chat-confirm-btns';
    btns.innerHTML =
      '<button class="chat-confirm-btn approve" onclick="chatConfirm(this, true)">\\u2713 Approve</button>' +
      '<button class="chat-confirm-btn deny" onclick="chatConfirm(this, false)">\\u2717 Deny</button>';
    el.appendChild(btns);
    scrollChat();
  });

  chatEventSource.addEventListener('proactive', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    removeTypingIndicator();
    appendChatMsg('proactive', data.text);
    scrollChat();
  });

  chatEventSource.onerror = function() {
    setChatStatus('disconnected', 'Disconnected');
    removeTypingIndicator();
  };

  // Wire up keyboard
  var inp = document.getElementById('chat-input');
  if (inp) {
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    inp.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });
  }
}

function refreshChatSessions(preferredId) {
  var select = document.getElementById('chat-session-select');
  var loadBtn = document.getElementById('chat-load-btn');
  var resumeBtn = document.getElementById('chat-resume-btn');
  if (!select) return;

  fetch('/api/sessions?limit=100')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var sessions = Array.isArray(data.sessions) ? data.sessions : [];
      chatSessionCache = sessions.filter(function(s) {
        return s &&
          s.channelId === 'dashboard:web' &&
          typeof s.input === 'string';
      });

      if (chatSessionCache.length === 0) {
        select.innerHTML = '<option value="">No saved sessions</option>';
        select.disabled = true;
        if (loadBtn) loadBtn.disabled = true;
        if (resumeBtn) resumeBtn.disabled = true;
        return;
      }

      select.disabled = false;
      if (loadBtn) loadBtn.disabled = false;
      if (resumeBtn) resumeBtn.disabled = false;
      select.innerHTML = chatSessionCache.map(function(s) {
        var label = formatChatSessionLabel(s);
        return '<option value="' + escapeHtml(String(s.id)) + '">' + escapeHtml(label) + '</option>';
      }).join('');

      if (preferredId) {
        select.value = preferredId;
      }
    })
    .catch(function(err) {
      appendChatMsg('error', 'Failed to load sessions: ' + err.message);
    });
}

function formatChatSessionLabel(session) {
  var id = String(session.id || '').slice(0, 8);
  var ts = session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Unknown time';
  var status = (session.status || 'unknown').toUpperCase();
  var input = String(session.input || '').replace(/\\s+/g, ' ').trim();
  if (input.length > 40) input = input.slice(0, 37) + '...';
  if (!input) input = '(empty input)';
  return '[' + id + '] [' + status + '] ' + ts + ' - ' + input;
}

function loadSelectedChatSession() {
  var select = document.getElementById('chat-session-select');
  if (!select || !select.value) return;

  var session = chatSessionCache.find(function(s) { return String(s.id) === String(select.value); });
  if (!session) {
    appendChatMsg('error', 'Selected session not found. Try refreshing.');
    return;
  }

  clearChatMessages();
  resetToolActivity();
  hideEmpty();
  appendChatMsg('tool-call', 'Loaded session ' + String(session.id).slice(0, 8));
  appendChatMsg('user', session.input || '(empty input)');
  if (typeof session.output === 'string' && session.output.length > 0) {
    appendChatMsg('assistant', session.output, true);
  } else {
    appendChatMsg('tool-call', 'Session has no final output yet (status: ' + String(session.status || 'unknown') + ')');
  }
  renderChatStepsForSession(String(session.id));
  scrollChat();
}

function resumeSelectedChatSession() {
  var select = document.getElementById('chat-session-select');
  var inp = document.getElementById('chat-input');
  if (!select || !select.value) return;

  var session = chatSessionCache.find(function(s) { return String(s.id) === String(select.value); });
  if (!session) {
    appendChatMsg('error', 'Selected session not found. Try refreshing.');
    return;
  }

  var text = inp ? inp.value.trim() : '';
  var payload = { sessionId: String(session.id) };
  if (text) {
    payload.input = text;
  }

  hideEmpty();
  resetToolActivity();
  appendChatMsg('tool-call', 'Resuming session ' + String(session.id).slice(0, 8) + '...');

  fetch('/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(function(res) {
    if (!res.ok) {
      return res.json().catch(function() { return { error: 'HTTP ' + res.status }; }).then(function(body) {
        throw new Error(body.error || ('HTTP ' + res.status));
      });
    }
    return res.json();
  }).then(function(data) {
    if (inp) {
      inp.value = '';
      inp.style.height = 'auto';
    }
    if (text) {
      appendChatMsg('user', text);
    }
    appendChatMsg('assistant', data.output || '(no output)', true);
    if (data.sessionId) {
      renderChatStepsForSession(String(data.sessionId));
      chatCurrentSessionId = String(data.sessionId);
    }
    scrollChat();
    refreshChatSessions(String(session.id));
  }).catch(function(err) {
    appendChatMsg('error', 'Resume failed: ' + err.message);
    scrollChat();
  });
}

function renderChatStepsForSession(sessionId) {
  if (!sessionId) return;

  fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/traces')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var traces = Array.isArray(data.traces) ? data.traces : [];
      var steps = traces.filter(function(t) {
        return t && t.phase !== 'session_start' && t.phase !== 'finish';
      });
      if (steps.length === 0) return;

      var lines = steps.map(function(t) {
        var iter = typeof t.iteration === 'number' ? ('iter ' + t.iteration + ' ') : '';
        var phase = String(t.phase || 'event').toUpperCase();
        var detail = traceDetail(t);
        return iter + phase + (detail ? ': ' + detail : '');
      });

      appendChatStepsBlock(sessionId, lines);
      scrollChat();
    })
    .catch(function(err) {
      appendChatMsg('error', 'Failed to load trace steps: ' + err.message);
    });
}

function traceDetail(t) {
  var d = t && t.data ? t.data : null;
  if (!d || typeof d !== 'object') return '';
  if (t.phase === 'tool_call' && d.toolName) return String(d.toolName);
  if (t.phase === 'tool_result') {
    var tool = d.toolName ? String(d.toolName) : 'tool';
    if (d.error) return tool + ' (error)';
    return tool + ' (ok)';
  }
  if (t.phase === 'governance') {
    var toolName = d.toolName ? String(d.toolName) : 'tool';
    var decision = d.decision ? String(d.decision) : 'unknown';
    return toolName + ' -> ' + decision;
  }
  if (t.phase === 'reason' && d.text) {
    var text = String(d.text).replace(/\\s+/g, ' ').trim();
    if (text.length > 90) text = text.slice(0, 87) + '...';
    return text;
  }
  if (t.phase === 'error' && d.error) return String(d.error);
  return '';
}

function appendChatStepsBlock(sessionId, lines) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var existing = document.getElementById('chat-steps-' + sessionId);
  if (existing) existing.remove();

  var div = document.createElement('div');
  div.className = 'chat-msg assistant chat-steps-wrap';
  div.id = 'chat-steps-' + sessionId;

  var title = 'Trace steps (' + lines.length + ') - session ' + String(sessionId).slice(0, 8);
  var body = safeEscape(lines.join('\\n'));
  div.innerHTML =
    '<details class="chat-steps">' +
      '<summary>' + safeEscape(title) + '</summary>' +
      '<div class="chat-steps-body">' + body + '</div>' +
    '</details>';
  container.appendChild(div);
}

function safeEscape(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(String(s));
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setChatStatus(state, label) {
  var dot = document.getElementById('chat-status-dot');
  var txt = document.getElementById('chat-status-text');
  if (dot) { dot.className = 'chat-status-dot ' + state; }
  if (txt) { txt.textContent = label; }
}

function hideEmpty() {
  var el = document.getElementById('chat-empty');
  if (el) el.style.display = 'none';
}

function appendChatMsg(cls, text, renderMarkdown) {
  var container = document.getElementById('chat-messages');
  if (!container) return null;
  var div = document.createElement('div');
  div.className = 'chat-msg ' + cls;

  // Add timestamp
  var time = document.createElement('span');
  time.className = 'chat-msg-time';
  time.textContent = chatTimeLabel();
  div.appendChild(time);

  // Content element
  var content = document.createElement('span');
  content.className = 'chat-msg-content';
  if (renderMarkdown && cls === 'assistant') {
    content.innerHTML = chatRenderMd(text);
  } else {
    content.textContent = text;
  }
  div.appendChild(content);

  container.appendChild(div);
  return div;
}

function pushToolActivity(status, toolName, detail) {
  chatToolEventCounter += 1;
  chatToolEvents.push({
    id: 'tool-evt-' + chatToolEventCounter,
    status: status,
    toolName: toolName,
    detail: detail || '',
    ts: new Date().toISOString(),
  });
  if (chatToolEvents.length > 80) {
    chatToolEvents = chatToolEvents.slice(chatToolEvents.length - 80);
  }
  renderToolActivity();
}

function renderToolActivity() {
  if (chatToolEvents.length === 0) return;
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var block = document.getElementById('chat-tool-activity');
  if (!block) {
    block = document.createElement('div');
    block.className = 'chat-msg assistant chat-steps-wrap';
    block.id = 'chat-tool-activity';
    block.innerHTML =
      '<details class="chat-steps chat-tool-activity" id="chat-tool-activity-details" open>' +
        '<summary><span>Tool activity</span><span class="chat-tool-count" id="chat-tool-count">0 events</span></summary>' +
        '<div class="chat-steps-body"><div class="chat-tool-events" id="chat-tool-events"></div></div>' +
      '</details>';
    container.appendChild(block);
  }

  var countEl = document.getElementById('chat-tool-count');
  if (countEl) countEl.textContent = chatToolEvents.length + ' event' + (chatToolEvents.length === 1 ? '' : 's');
  var listEl = document.getElementById('chat-tool-events');
  if (!listEl) return;

  listEl.innerHTML = '';
  chatToolEvents.slice().reverse().forEach(function(evt) {
    var row = document.createElement('details');
    row.className = 'chat-tool-event ' + evt.status;
    var summary = document.createElement('summary');

    var badge = document.createElement('span');
    badge.className = 'chat-tool-event-badge';
    badge.textContent = evt.status;
    summary.appendChild(badge);

    var name = document.createElement('span');
    name.className = 'chat-tool-event-name';
    name.textContent = evt.toolName;
    summary.appendChild(name);

    var time = document.createElement('span');
    time.className = 'chat-tool-event-time';
    time.textContent = formatToolEventTime(evt.ts);
    summary.appendChild(time);

    row.appendChild(summary);

    var detail = document.createElement('div');
    detail.className = 'chat-tool-event-detail';
    detail.textContent = evt.detail || 'No details';
    row.appendChild(detail);

    if (evt.status === 'error' || evt.status === 'governance') {
      row.open = true;
    }

    listEl.appendChild(row);
  });
}

function collapseToolActivity() {
  var details = document.getElementById('chat-tool-activity-details');
  if (details) details.open = false;
}

function resetToolActivity() {
  chatToolEvents = [];
  var block = document.getElementById('chat-tool-activity');
  if (block) block.remove();
  var toasts = document.getElementById('chat-activity-toasts');
  if (toasts) toasts.innerHTML = '';
}

function showToolToast(status, title, detail) {
  var host = document.getElementById('chat-activity-toasts');
  if (!host) return;
  var toast = document.createElement('div');
  toast.className = 'chat-tool-toast ' + status;

  var titleEl = document.createElement('div');
  titleEl.className = 'chat-tool-toast-title';
  titleEl.textContent = title;
  toast.appendChild(titleEl);

  if (detail) {
    var detailEl = document.createElement('div');
    detailEl.className = 'chat-tool-toast-detail';
    detailEl.textContent = detail;
    toast.appendChild(detailEl);
  }

  host.appendChild(toast);

  setTimeout(function() {
    toast.classList.add('fade');
  }, 4200);
  setTimeout(function() {
    if (toast.parentElement) toast.parentElement.removeChild(toast);
  }, 4700);
}

function formatToolEventTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function toolNameFromConfirmationPrompt(prompt) {
  var text = String(prompt || '');
  var m = text.match(/Tool\\s+"([^"]+)"/);
  return m ? m[1] : '';
}

function scrollChat() {
  var el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function enableChatInput() {
  var btn = document.getElementById('chat-send-btn');
  var inp = document.getElementById('chat-input');
  if (btn) { btn.disabled = false; btn.classList.remove('sending'); }
  if (inp) { inp.disabled = false; inp.focus(); }
}

function sendChatMessage() {
  var inp = document.getElementById('chat-input');
  var btn = document.getElementById('chat-send-btn');
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;

  hideEmpty();
  appendChatMsg('user', text);
  scrollChat();

  inp.value = '';
  inp.style.height = 'auto';
  if (btn) { btn.disabled = true; btn.classList.add('sending'); }
  inp.disabled = true;

  fetch('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text }),
  }).then(function(res) {
    if (!res.ok) {
      appendChatMsg('error', 'Send failed: HTTP ' + res.status);
      enableChatInput();
    }
  }).catch(function(err) {
    appendChatMsg('error', 'Send failed: ' + err.message);
    enableChatInput();
  });
}

function chatConfirm(btnEl, approved) {
  var btnsDiv = btnEl.parentElement;
  if (btnsDiv) btnsDiv.remove();

  var reply = approved ? 'yes' : 'no';
  appendChatMsg('user', reply);
  scrollChat();

  fetch('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: reply }),
  }).catch(function() {});
}

function clearChatMessages() {
  var el = document.getElementById('chat-messages');
  if (!el) return;
  el.innerHTML =
    '<div class="chat-empty" id="chat-empty">' +
      '<div class="chat-empty-icon">&#x1F4AC;</div>' +
      '<div>Send a message to start chatting</div>' +
      '<div class="chat-empty-hint">Press <kbd>Enter</kbd> to send &middot; <kbd>Shift+Enter</kbd> for new line</div>' +
    '</div>';
  chatStreamingEl = null;
  chatStreamBuf = '';
  removeTypingIndicator();
  resetToolActivity();
}
`,
};
