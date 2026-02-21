import type { DashboardTab } from "@baseagent/core";

export const chatDashboardTab: DashboardTab = {
  id: "chat",
  label: "Chat",
  onActivate: "initChat()",

  css: `
.chat-panel {
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
  gap: 12px;
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
.chat-clear-btn:hover { color: var(--text-1); border-color: var(--border-active); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.chat-msg.tool-call {
  align-self: flex-start;
  background: rgba(79,143,255,.06);
  color: var(--text-2);
  font-size: 10px;
  padding: 5px 10px;
  border: 1px solid rgba(79,143,255,.12);
}

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
  margin-top: 8px;
}

.chat-confirm-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
}
.chat-confirm-btn.approve {
  background: rgba(79,255,143,.1);
  color: var(--green);
  border-color: rgba(79,255,143,.3);
}
.chat-confirm-btn.approve:hover { background: rgba(79,255,143,.2); }
.chat-confirm-btn.deny {
  background: rgba(255,79,106,.1);
  color: var(--red);
  border-color: rgba(255,79,106,.3);
}
.chat-confirm-btn.deny:hover { background: rgba(255,79,106,.2); }

.chat-input-row {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-textarea {
  flex: 1;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-0);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 10px 12px;
  resize: none;
  min-height: 20px;
  max-height: 120px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s;
}
.chat-textarea:focus { border-color: var(--accent); }
.chat-textarea::placeholder { color: var(--text-2); }

.chat-send-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--bg-0);
  background: var(--accent);
  border: none;
  border-radius: var(--radius);
  padding: 10px 18px;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.chat-send-btn:hover { opacity: 0.85; }
.chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
}

@media (max-width: 700px) {
  .chat-msg { max-width: 95%; }
  .chat-messages { padding: 12px 14px; }
  .chat-input-row { padding: 10px 14px; }
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
    <button class="chat-clear-btn" onclick="clearChatMessages()">Clear</button>
  </div>
  <div class="chat-messages" id="chat-messages">
    <div class="chat-empty" id="chat-empty">
      <div style="font-size:24px;opacity:0.3">&#x1F4AC;</div>
      <div>Send a message to start chatting</div>
    </div>
  </div>
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

function initChat() {
  if (chatEventSource) { chatEventSource.close(); }

  chatEventSource = new EventSource('/chat/events');

  chatEventSource.addEventListener('ping', function() {
    setChatStatus('connected', 'Connected');
  });

  chatEventSource.addEventListener('text_delta', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    if (!chatStreamingEl) {
      chatStreamBuf = '';
      chatStreamingEl = appendChatMsg('assistant', '');
    }
    chatStreamBuf += data.delta;
    chatStreamingEl.textContent = chatStreamBuf;
    scrollChat();
  });

  chatEventSource.addEventListener('text_reset', function() {
    if (chatStreamingEl) {
      chatStreamBuf = '';
      chatStreamingEl.textContent = '';
    }
  });

  chatEventSource.addEventListener('tool_call', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    appendChatMsg('tool-call', '\\u2699 ' + data.toolName);
    scrollChat();
  });

  chatEventSource.addEventListener('finish', function() {
    chatStreamingEl = null;
    chatStreamBuf = '';
    enableChatInput();
  });

  chatEventSource.addEventListener('error_event', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    appendChatMsg('error', data.message);
    chatStreamingEl = null;
    chatStreamBuf = '';
    enableChatInput();
    scrollChat();
  });

  chatEventSource.addEventListener('confirmation', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    var el = appendChatMsg('confirmation', data.prompt);
    var btns = document.createElement('div');
    btns.className = 'chat-confirm-btns';
    btns.innerHTML =
      '<button class="chat-confirm-btn approve" onclick="chatConfirm(this, true)">Approve</button>' +
      '<button class="chat-confirm-btn deny" onclick="chatConfirm(this, false)">Deny</button>';
    el.appendChild(btns);
    scrollChat();
  });

  chatEventSource.addEventListener('proactive', function(e) {
    var data = JSON.parse(e.data);
    hideEmpty();
    appendChatMsg('proactive', data.text);
    scrollChat();
  });

  chatEventSource.onerror = function() {
    setChatStatus('disconnected', 'Disconnected');
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
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }
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

function appendChatMsg(cls, text) {
  var container = document.getElementById('chat-messages');
  if (!container) return null;
  var div = document.createElement('div');
  div.className = 'chat-msg ' + cls;
  div.textContent = text;
  container.appendChild(div);
  return div;
}

function scrollChat() {
  var el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function enableChatInput() {
  var btn = document.getElementById('chat-send-btn');
  var inp = document.getElementById('chat-input');
  if (btn) btn.disabled = false;
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
  btn.disabled = true;
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
      '<div style="font-size:24px;opacity:0.3">&#x1F4AC;</div>' +
      '<div>Send a message to start chatting</div>' +
    '</div>';
  chatStreamingEl = null;
  chatStreamBuf = '';
}
`,
};
