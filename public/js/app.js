// MongoDB Dashboard - Client-side JavaScript

// ─── CodeMirror Editor Manager ──────────────────────────────────────────────

const cmEditors = {};

function createJsonEditor(elementId, options = {}) {
  const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
  if (!el || !window.CodeMirror) return null;

  // Destroy existing instance if any
  const existingKey = typeof elementId === 'string' ? elementId : el.id;
  if (existingKey && cmEditors[existingKey]) {
    cmEditors[existingKey].toTextArea();
    delete cmEditors[existingKey];
  }

  const cm = CodeMirror.fromTextArea(el, {
    mode: { name: 'javascript', json: true },
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true,
    styleActiveLine: true,
    readOnly: options.readOnly || false,
    placeholder: options.placeholder || '',
    viewportMargin: Infinity,
    extraKeys: {
      'Tab': (cm) => cm.execCommand('indentMore'),
      'Shift-Tab': (cm) => cm.execCommand('indentLess'),
    },
    ...options,
  });

  if (existingKey) {
    cmEditors[existingKey] = cm;
  }

  return cm;
}

function getEditor(id) {
  return cmEditors[id] || null;
}

function setEditorValue(id, value) {
  const cm = cmEditors[id];
  if (cm) {
    cm.setValue(value || '');
    setTimeout(() => cm.refresh(), 1);
  } else {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  }
}

function getEditorValue(id) {
  const cm = cmEditors[id];
  if (cm) return cm.getValue();
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function focusEditor(id) {
  const cm = cmEditors[id];
  if (cm) {
    setTimeout(() => { cm.refresh(); cm.focus(); }, 10);
  } else {
    document.getElementById(id)?.focus();
  }
}

function refreshEditor(id) {
  const cm = cmEditors[id];
  if (cm) setTimeout(() => cm.refresh(), 10);
}

// ─── Toast Notifications ─────────────────────────────────────────────────────

const TOAST_ICONS = {
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.classList.add('toast-removing'); setTimeout(() => this.parentElement.remove(), 200)">&times;</button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('toast-removing');
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  return toast;
}

// Storage keys
const STORAGE_KEY = 'mongodb_dashboard_connections';
const ACTIVE_CONNECTION_KEY = 'mongodb_dashboard_active_connection';
const THEME_KEY = 'mongodb_dashboard_theme';

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatCount(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return n.toString();
}

function maskConnectionString(str) {
  try {
    const url = new URL(str);
    if (url.password) {
      url.password = '****';
    }
    return url.host || str.substring(0, 30) + '...';
  } catch {
    return str.substring(0, 30) + '...';
  }
}

const CONNECTION_COLORS = ['#388bfd', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#ff7b72', '#79c0ff', '#8b949e'];

function getConnections() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    // Migrate plain strings to objects
    return raw.map(c => typeof c === 'string' ? { uri: c, name: '', color: '' } : c);
  } catch {
    return [];
  }
}

function saveConnection(connectionString, name, color) {
  const connections = getConnections().filter(c => c.uri !== connectionString);
  connections.unshift({ uri: connectionString, name: name || '', color: color || '' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections.slice(0, 10)));
}

function updateConnectionMeta(connectionString, name, color) {
  const connections = getConnections();
  const conn = connections.find(c => c.uri === connectionString);
  if (conn) {
    if (name !== undefined) conn.name = name;
    if (color !== undefined) conn.color = color;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  }
}

function removeConnection(connectionString) {
  const connections = getConnections().filter(c => c.uri !== connectionString);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

function getActiveConnection() {
  try {
    return localStorage.getItem(ACTIVE_CONNECTION_KEY);
  } catch {
    return null;
  }
}

function setActiveConnection(connectionString) {
  try {
    if (connectionString) {
      localStorage.setItem(ACTIVE_CONNECTION_KEY, connectionString);
    } else {
      localStorage.removeItem(ACTIVE_CONNECTION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function checkConnectionStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    return data;
  } catch {
    return { connected: false };
  }
}

async function autoReconnect() {
  const activeConnection = getActiveConnection();
  if (!activeConnection) {
    return false;
  }

  try {
    const status = await checkConnectionStatus();
    if (status.connected) {
      // Already connected, verify it's the same connection
      if (status.connectionString === activeConnection) {
        return true;
      }
    }

    // Try to reconnect
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: activeConnection })
    });

    const data = await res.json();
    return res.ok && data.success;
  } catch {
    return false;
  }
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    const tag = document.activeElement?.tagName;
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.closest('.CodeMirror');

    // Escape — close any open modal
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal[style*="display: flex"], .modal[style*="display:flex"]');
      if (openModal) {
        openModal.style.display = 'none';
        e.preventDefault();
        return;
      }
      // Close shortcuts modal
      const shortcutsModal = document.getElementById('shortcutsModal');
      if (shortcutsModal && shortcutsModal.style.display !== 'none') {
        shortcutsModal.style.display = 'none';
        e.preventDefault();
        return;
      }
    }

    // Don't capture shortcuts when typing in inputs (except specific combos)
    if (isEditing && !(isMod && (e.key === 'Enter' || e.key === '/' || e.key === 'k'))) return;

    // Cmd/Ctrl + K — focus search input
    if (isMod && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('searchInput');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      return;
    }

    // Cmd/Ctrl + Enter — run query
    if (isMod && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('queryRunBtn')?.click();
      return;
    }

    // Cmd/Ctrl + Shift + N — new document
    if (isMod && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      document.getElementById('addDocBtn')?.click();
      return;
    }

    // Cmd/Ctrl + / — toggle shell panel
    if (isMod && e.key === '/') {
      e.preventDefault();
      const shellPanel = document.getElementById('shellPanel');
      const shellOpenBtn = document.getElementById('shellOpenBtn');
      if (shellPanel?.classList.contains('shell-panel-closed')) {
        shellOpenBtn?.click();
      } else {
        document.getElementById('shellToggleBtn')?.click();
      }
      return;
    }

    // ? — show shortcuts help (when not editing)
    if (e.key === '?' && !isEditing) {
      e.preventDefault();
      toggleShortcutsModal();
      return;
    }

    // R — refresh (when not editing)
    if (e.key === 'r' && !isEditing && !isMod) {
      e.preventDefault();
      document.getElementById('refreshBtn')?.click();
      return;
    }

    // F — focus filter (when not editing)
    if (e.key === 'f' && !isEditing && !isMod) {
      e.preventDefault();
      const filterEl = document.getElementById('queryFilter');
      if (filterEl) filterEl.focus();
      return;
    }

    // 1-5 — switch tabs (when not editing)
    if (!isEditing && e.key >= '1' && e.key <= '5') {
      const tabNames = ['documents', 'indexes', 'schema', 'aggregation', 'validation'];
      const idx = parseInt(e.key) - 1;
      if (idx < tabNames.length) {
        const tab = document.querySelector(`.collection-tab[data-tab="${tabNames[idx]}"]`);
        if (tab) { e.preventDefault(); tab.click(); }
      }
    }
  });
}

function toggleShortcutsModal() {
  let modal = document.getElementById('shortcutsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="document.getElementById('shortcutsModal').style.display='none'"></div>
      <div class="modal-content modal-sm">
        <div class="modal-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="modal-close" onclick="document.getElementById('shortcutsModal').style.display='none'">&times;</button>
        </div>
        <div class="modal-body shortcuts-body">
          <div class="shortcut-group">
            <h4>General</h4>
            <div class="shortcut-row"><kbd>?</kbd><span>Show shortcuts</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>Close modal / panel</span></div>
            <div class="shortcut-row"><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K</kbd><span>Focus search</span></div>
            <div class="shortcut-row"><kbd>R</kbd><span>Refresh documents</span></div>
          </div>
          <div class="shortcut-group">
            <h4>Documents</h4>
            <div class="shortcut-row"><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+⏎</kbd><span>Run query</span></div>
            <div class="shortcut-row"><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+⇧+N</kbd><span>New document</span></div>
            <div class="shortcut-row"><kbd>F</kbd><span>Focus filter bar</span></div>
          </div>
          <div class="shortcut-group">
            <h4>Navigation</h4>
            <div class="shortcut-row"><kbd>1</kbd>–<kbd>5</kbd><span>Switch tabs</span></div>
            <div class="shortcut-row"><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+/</kbd><span>Toggle shell</span></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

// Initialize shortcuts on page load
document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);

// ─── Open Tabs Bar ───────────────────────────────────────────────────────────

const OPEN_TABS_KEY = 'mongodb_dashboard_open_tabs';
const MAX_OPEN_TABS = 10;

function getOpenTabs() {
  try { return JSON.parse(localStorage.getItem(OPEN_TABS_KEY) || '[]'); }
  catch { return []; }
}

function saveOpenTabs(tabs) {
  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
}

function addOpenTab(db, collection) {
  const tabs = getOpenTabs();
  const id = `${db}/${collection}`;
  const existing = tabs.findIndex(t => t.id === id);
  if (existing !== -1) {
    // move to front
    tabs.unshift(tabs.splice(existing, 1)[0]);
  } else {
    tabs.unshift({ id, db, collection });
    if (tabs.length > MAX_OPEN_TABS) tabs.pop();
  }
  saveOpenTabs(tabs);
}

function removeOpenTab(id) {
  const tabs = getOpenTabs().filter(t => t.id !== id);
  saveOpenTabs(tabs);
}

function initOpenTabsBar(currentDb, currentCollection) {
  const bar = document.getElementById('openTabsBar');
  if (!bar) return;

  // Register current tab
  if (currentDb && currentCollection) addOpenTab(currentDb, currentCollection);

  renderOpenTabsBar(currentDb, currentCollection);
}

function renderOpenTabsBar(currentDb, currentCollection) {
  const bar = document.getElementById('openTabsBar');
  if (!bar) return;

  const tabs = getOpenTabs();
  if (tabs.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  const currentId = currentDb && currentCollection ? `${currentDb}/${currentCollection}` : null;

  bar.innerHTML = tabs.map(tab => `
    <div class="open-tab ${tab.id === currentId ? 'open-tab-active' : ''}">
      <a href="/browse/${encodeURIComponent(tab.db)}/${encodeURIComponent(tab.collection)}" class="open-tab-link">
        <span class="open-tab-db">${escapeHtml(tab.db)}</span>
        <span class="open-tab-sep">/</span>
        <span class="open-tab-col">${escapeHtml(tab.collection)}</span>
      </a>
      <button class="open-tab-close" data-id="${escapeHtml(tab.id)}" title="Close tab">×</button>
    </div>
  `).join('');

  bar.querySelectorAll('.open-tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      removeOpenTab(id);
      // If closing current tab, navigate to databases
      if (id === currentId) {
        window.location.href = '/databases';
      } else {
        renderOpenTabsBar(currentDb, currentCollection);
      }
    });
  });
}

// ─── Shell Panel ─────────────────────────────────────────────────────────────

function initShellPanel(dbName) {
  const panel = document.getElementById('shellPanel');
  const openBtn = document.getElementById('shellOpenBtn');
  const toggleBtn = document.getElementById('shellToggleBtn');
  const clearBtn = document.getElementById('shellClearBtn');
  const input = document.getElementById('shellInput');
  const runBtn = document.getElementById('shellRunBtn');
  const output = document.getElementById('shellOutput');
  const dbLabel = document.getElementById('shellDbLabel');
  if (!panel || !input) return;

  let shellDb = dbName;
  let history = [];
  let historyIdx = -1;

  if (dbLabel) dbLabel.textContent = `[${shellDb}]`;

  const open = () => {
    panel.classList.remove('shell-panel-closed');
    openBtn?.classList.add('hidden');
    input.focus();
  };

  const close = () => {
    panel.classList.add('shell-panel-closed');
    openBtn?.classList.remove('hidden');
  };

  openBtn?.addEventListener('click', open);
  toggleBtn?.addEventListener('click', close);
  clearBtn?.addEventListener('click', () => { if (output) output.innerHTML = ''; });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { runShellCommand(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx < history.length - 1) { historyIdx++; input.value = history[historyIdx]; }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) { historyIdx--; input.value = history[historyIdx]; }
      else { historyIdx = -1; input.value = ''; }
    }
  });

  runBtn?.addEventListener('click', runShellCommand);

  function appendEntry(cmd, result, type, isError = false) {
    const entry = document.createElement('div');
    entry.className = 'shell-entry';

    const cmdLine = document.createElement('div');
    cmdLine.className = 'shell-cmd-line';
    cmdLine.innerHTML = `<span class="shell-cmd-prompt">${escapeHtml(shellDb)}> </span><span>${escapeHtml(cmd)}</span>`;
    entry.appendChild(cmdLine);

    const resultEl = document.createElement('div');
    resultEl.className = 'shell-result';

    if (isError) {
      resultEl.innerHTML = `<span class="shell-result-error">${escapeHtml(String(result))}</span>`;
    } else if (type === 'text') {
      resultEl.innerHTML = `<span class="shell-result-text">${escapeHtml(String(result))}</span>`;
    } else {
      const pre = document.createElement('pre');
      pre.className = 'shell-result-json';
      pre.style.cssText = 'margin:0;white-space:pre-wrap;color:#e6edf3;font-size:12px';
      pre.textContent = JSON.stringify(result, null, 2);
      resultEl.appendChild(pre);
    }

    entry.appendChild(resultEl);
    output.appendChild(entry);
    output.scrollTop = output.scrollHeight;
  }

  async function runShellCommand() {
    const cmd = input.value.trim();
    if (!cmd) return;

    history.unshift(cmd);
    historyIdx = -1;
    input.value = '';

    try {
      const res = await fetch('/api/shell/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, db: shellDb }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendEntry(cmd, data.error || 'Unknown error', 'error', true);
        return;
      }

      if (data.switchDb) {
        shellDb = data.switchDb;
        if (dbLabel) dbLabel.textContent = `[${shellDb}]`;
      }

      appendEntry(cmd, data.result, data.type || 'json');
    } catch (err) {
      appendEntry(cmd, err.message, 'error', true);
    }
  }
}

// ─── Connection Builder ───────────────────────────────────────────────────────

function initConnectionBuilder(uriInput) {
  // Tab switching
  document.querySelectorAll('.conn-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.conn-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      document.getElementById('conn-uri-mode').style.display = mode === 'uri' ? 'block' : 'none';
      document.getElementById('conn-builder-mode').style.display = mode === 'builder' ? 'block' : 'none';

      if (mode === 'builder') rebuildUri();
    });
  });

  // Auth type toggle
  document.getElementById('cbAuthType')?.addEventListener('change', (e) => {
    const fields = document.getElementById('cbAuthFields');
    if (fields) fields.style.display = e.target.value === 'password' ? 'block' : 'none';
    rebuildUri();
  });

  // Scheme toggle (SRV hides port)
  document.querySelectorAll('[name="cbScheme"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isSrv = document.querySelector('[name="cbScheme"]:checked')?.value === 'mongodb+srv://';
      const portGroup = document.getElementById('cbPortGroup');
      if (portGroup) portGroup.style.display = isSrv ? 'none' : 'block';
      rebuildUri();
    });
  });

  // All builder inputs trigger URI rebuild
  ['cbHost', 'cbPort', 'cbUsername', 'cbPassword', 'cbAuthDb', 'cbReplicaSet', 'cbTLS'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', rebuildUri);
    if (el && el.type === 'checkbox') el.addEventListener('change', rebuildUri);
  });
}

function rebuildUri() {
  const scheme = document.querySelector('[name="cbScheme"]:checked')?.value || 'mongodb://';
  const host = document.getElementById('cbHost')?.value.trim() || 'localhost';
  const port = document.getElementById('cbPort')?.value.trim() || '27017';
  const authType = document.getElementById('cbAuthType')?.value || 'none';
  const username = document.getElementById('cbUsername')?.value.trim() || '';
  const password = document.getElementById('cbPassword')?.value || '';
  const authDb = document.getElementById('cbAuthDb')?.value.trim() || 'admin';
  const replicaSet = document.getElementById('cbReplicaSet')?.value.trim() || '';
  const tls = document.getElementById('cbTLS')?.checked || false;
  const isSrv = scheme === 'mongodb+srv://';

  let uri = scheme;

  if (authType === 'password' && username) {
    uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }

  uri += host;
  if (!isSrv) uri += `:${port}`;
  uri += '/';
  if (authType === 'password' && authDb) uri += authDb;

  const params = [];
  if (replicaSet) params.push(`replicaSet=${encodeURIComponent(replicaSet)}`);
  if (tls) params.push('tls=true');
  if (params.length > 0) uri += '?' + params.join('&');

  const genEl = document.getElementById('cbGeneratedUri');
  if (genEl) genEl.value = uri;
}

// Connect Page
async function initConnectPage() {
  const form = document.getElementById('connectForm');
  const input = document.getElementById('connectionString');
  const errorEl = document.getElementById('connectError');
  const recentEl = document.getElementById('recentConnections');
  const recentList = document.getElementById('recentList');
  const connectBtn = document.getElementById('connectBtn');
  const connectContent = document.getElementById('connectContent');
  const reconnectLoading = document.getElementById('reconnectLoading');

  // Hide form initially, show loading if we have a saved connection
  const activeConnection = getActiveConnection();
  if (activeConnection) {
    connectContent.style.display = 'none';
    reconnectLoading.style.display = 'flex';
  }

  // Check if we should auto-reconnect
  const status = await checkConnectionStatus();
  if (!status.connected && activeConnection) {
    const reconnected = await autoReconnect();
    if (reconnected) {
      // Successfully reconnected, check for saved return URL
      const returnUrl = sessionStorage.getItem('mongodb_dashboard_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('mongodb_dashboard_return_url');
        window.location.href = returnUrl;
      } else {
        window.location.href = '/databases';
      }
      return;
    }
  } else if (status.connected) {
    // Already connected, check for saved return URL
    const returnUrl = sessionStorage.getItem('mongodb_dashboard_return_url');
    if (returnUrl) {
      sessionStorage.removeItem('mongodb_dashboard_return_url');
      window.location.href = returnUrl;
    } else {
      window.location.href = '/databases';
    }
    return;
  }

  // Reconnection failed or no saved connection - show the form
  reconnectLoading.style.display = 'none';
  connectContent.style.display = 'block';

  // Show recent connections (bookmarks)
  function renderBookmarks() {
    const connections = getConnections();
    if (connections.length === 0) { recentEl.style.display = 'none'; return; }
    recentEl.style.display = 'block';
    recentList.innerHTML = connections.map(conn => `
      <li data-conn="${encodeURIComponent(conn.uri)}">
        ${conn.color ? `<span class="conn-color-dot" style="background:${conn.color}"></span>` : ''}
        <div class="conn-info">
          ${conn.name ? `<span class="conn-name">${escapeHtml(conn.name)}</span>` : ''}
          <span class="recent-host">${maskConnectionString(conn.uri)}</span>
        </div>
        <span class="conn-label-btn" data-label="${encodeURIComponent(conn.uri)}" title="Edit label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </span>
        <span class="recent-remove" data-remove="${encodeURIComponent(conn.uri)}">×</span>
      </li>
    `).join('');
  }
  renderBookmarks();

  recentList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.recent-remove');
    if (removeBtn) {
      e.stopPropagation();
      const conn = decodeURIComponent(removeBtn.dataset.remove);
      removeConnection(conn);
      renderBookmarks();
      return;
    }

    const labelBtn = e.target.closest('.conn-label-btn');
    if (labelBtn) {
      e.stopPropagation();
      const uri = decodeURIComponent(labelBtn.dataset.label);
      const conns = getConnections();
      const existing = conns.find(c => c.uri === uri);
      const name = prompt('Connection name:', existing?.name || '');
      if (name === null) return;
      // Show color picker
      const color = prompt('Color (hex or pick from: blue, green, yellow, red, purple):', existing?.color || '');
      const colorMap = { blue: '#388bfd', green: '#3fb950', yellow: '#d29922', red: '#f85149', purple: '#bc8cff' };
      const resolvedColor = colorMap[color?.toLowerCase()] || color || '';
      updateConnectionMeta(uri, name, resolvedColor);
      renderBookmarks();
      return;
    }

    const li = e.target.closest('li');
    if (li) {
      input.value = decodeURIComponent(li.dataset.conn);
      form.dispatchEvent(new Event('submit'));
    }
  });

  // ── Connection Builder ──────────────────────────────────────────────────
  initConnectionBuilder(input);

  // Handle form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // If builder mode is active, use generated URI
    const builderMode = document.getElementById('conn-builder-mode');
    if (builderMode && builderMode.style.display !== 'none') {
      const gen = document.getElementById('cbGeneratedUri')?.value;
      if (gen) input.value = gen;
    }
    
    const connectionString = input.value.trim();
    if (!connectionString) return;

    // Show loading state
    connectBtn.disabled = true;
    connectBtn.querySelector('.btn-text').style.display = 'none';
    connectBtn.querySelector('.btn-loading').style.display = 'inline-flex';
    errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Connection failed');
      }

      // Save to recent connections
      saveConnection(connectionString);
      
      // Save as active connection
      setActiveConnection(connectionString);

      // Check for saved return URL, otherwise redirect to databases
      const returnUrl = sessionStorage.getItem('mongodb_dashboard_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('mongodb_dashboard_return_url');
        window.location.href = returnUrl;
      } else {
        window.location.href = '/databases';
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      connectBtn.disabled = false;
      connectBtn.querySelector('.btn-text').style.display = 'inline';
      connectBtn.querySelector('.btn-loading').style.display = 'none';
    }
  });
}

// Browser Page
let currentCursor = null;
let currentNextSkip = null;
let allDocuments = [];
let tableFields = [];
let allAvailableFields = [];
let currentSearchTerm = '';
let currentDbName = '';
let currentCollectionName = '';
let arrayFilters = {}; // Store filters for array columns: { fieldName: { type: 'empty' | 'gte', value: number } }
let currentViewMode = localStorage.getItem('mongodb_dashboard_view_mode') || 'table';

// MQL Query Bar state
let currentFilter = '';
let currentProjection = '';
let currentSort = '';
let currentLimit = 50;
let currentSkip = 0;
let queryOptionsOpen = false;

// Sync filter state to URL query parameters
function updateUrlParams() {
  const url = new URL(window.location);
  
  if (currentSearchTerm) {
    url.searchParams.set('search', currentSearchTerm);
  } else {
    url.searchParams.delete('search');
  }
  
  if (Object.keys(arrayFilters).length > 0) {
    url.searchParams.set('arrayFilters', JSON.stringify(arrayFilters));
  } else {
    url.searchParams.delete('arrayFilters');
  }

  if (currentFilter) {
    url.searchParams.set('qFilter', currentFilter);
  } else {
    url.searchParams.delete('qFilter');
  }

  if (currentProjection) {
    url.searchParams.set('qProjection', currentProjection);
  } else {
    url.searchParams.delete('qProjection');
  }

  if (currentSort) {
    url.searchParams.set('qSort', currentSort);
  } else {
    url.searchParams.delete('qSort');
  }
  
  window.history.replaceState({}, '', url);
}

async function initBrowser(dbName, collectionName) {
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  tableFields = [];
  allAvailableFields = [];
  currentDbName = dbName;
  currentCollectionName = collectionName;
  
  // Restore state from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  currentSearchTerm = urlParams.get('search') || '';
  currentFilter = urlParams.get('qFilter') || '';
  currentProjection = urlParams.get('qProjection') || '';
  currentSort = urlParams.get('qSort') || '';
  
  try {
    const arrayFiltersParam = urlParams.get('arrayFilters');
    arrayFilters = arrayFiltersParam ? JSON.parse(arrayFiltersParam) : {};
  } catch (e) {
    arrayFilters = {};
  }

  // Restore query bar inputs from URL
  const queryFilterEl = document.getElementById('queryFilter');
  const queryProjectionEl = document.getElementById('queryProjection');
  const querySortEl = document.getElementById('querySort');
  const queryLimitEl = document.getElementById('queryLimit');
  const querySkipEl = document.getElementById('querySkip');

  if (queryFilterEl && currentFilter) queryFilterEl.value = currentFilter;
  if (queryProjectionEl && currentProjection) queryProjectionEl.value = currentProjection;
  if (querySortEl && currentSort) querySortEl.value = currentSort;

  // Wire up query bar buttons
  const queryRunBtn = document.getElementById('queryRunBtn');
  const queryResetBtn = document.getElementById('queryResetBtn');
  const queryOptionsToggle = document.getElementById('queryOptionsToggle');
  const queryBarOptions = document.getElementById('queryBarOptions');
  const savedQueriesBtn = document.getElementById('savedQueriesBtn');
  const savedQueriesDropdown = document.getElementById('savedQueriesDropdown');
  const saveQueryBtn = document.getElementById('saveQueryBtn');

  if (queryOptionsToggle && queryBarOptions) {
    queryOptionsToggle.addEventListener('click', () => {
      queryOptionsOpen = !queryOptionsOpen;
      queryBarOptions.style.display = queryOptionsOpen ? 'flex' : 'none';
      queryOptionsToggle.classList.toggle('open', queryOptionsOpen);
    });
  }

  if (queryRunBtn) {
    queryRunBtn.addEventListener('click', () => runQuery(dbName, collectionName));
  }

  // Run on Enter in any query input
  [queryFilterEl, queryProjectionEl, querySortEl].forEach(el => {
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runQuery(dbName, collectionName);
    });
  });

  if (queryResetBtn) {
    queryResetBtn.addEventListener('click', () => {
      currentFilter = '';
      currentProjection = '';
      currentSort = '';
      currentLimit = 50;
      currentSkip = 0;
      if (queryFilterEl) queryFilterEl.value = '';
      if (queryProjectionEl) queryProjectionEl.value = '';
      if (querySortEl) querySortEl.value = '';
      if (queryLimitEl) queryLimitEl.value = '50';
      if (querySkipEl) querySkipEl.value = '0';
      updateUrlParams();
      currentCursor = null;
      currentNextSkip = null;
      allDocuments = [];
      loadDocuments(dbName, collectionName);
    });
  }

  if (savedQueriesBtn && savedQueriesDropdown) {
    savedQueriesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = savedQueriesDropdown.style.display !== 'none';
      savedQueriesDropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderSavedQueriesDropdown(dbName, collectionName, savedQueriesDropdown);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#savedQueriesBtn') && !e.target.closest('#savedQueriesDropdown')) {
        savedQueriesDropdown.style.display = 'none';
      }
    });
  }

  if (saveQueryBtn) {
    saveQueryBtn.addEventListener('click', () => {
      const filter = queryFilterEl?.value.trim() || '';
      const projection = queryProjectionEl?.value.trim() || '';
      const sort = querySortEl?.value.trim() || '';
      if (!filter && !projection && !sort) {
        showToast('Enter at least a filter, projection, or sort to save.', 'warning');
        return;
      }
      const name = prompt('Name for this saved query:');
      if (!name) return;
      saveQuery(dbName, collectionName, { name, filter, projection, sort,
        limit: parseInt(queryLimitEl?.value) || 50,
        skip: parseInt(querySkipEl?.value) || 0 });
    });
  }

  // Search input
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  let searchTimeout = null;

  // Restore search input value from URL
  if (searchInput && currentSearchTerm) {
    searchInput.value = currentSearchTerm;
    if (clearSearchBtn) {
      clearSearchBtn.style.display = 'flex';
    }
  }

  // Check connection status before loading documents
  const tableBody = document.getElementById('tableBody');
  try {
    const status = await checkConnectionStatus();
    if (!status.connected) {
      // Show reconnecting message instead of error
      if (tableBody) {
        tableBody.innerHTML = '<tr class="loading-row"><td colspan="100"><div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;"><div class="loading-spinner"></div><span style="color: var(--text-secondary);">Reconnecting...</span></div></td></tr>';
      }
      // Try to reconnect
      const reconnected = await autoReconnect();
      if (reconnected) {
        // Successfully reconnected, reload to get fresh data
        window.location.reload();
        return;
      } else {
        // Failed to reconnect, show error and redirect
        if (tableBody) {
          tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; padding: 40px; color: var(--danger);">Connection failed. Redirecting...</td></tr>';
        }
        const currentUrl = window.location.pathname + window.location.search;
        sessionStorage.setItem('mongodb_dashboard_return_url', currentUrl);
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
        return;
      }
    }
  } catch (err) {
    // On error checking status, try to reconnect anyway
    if (tableBody) {
      tableBody.innerHTML = '<tr class="loading-row"><td colspan="100"><div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;"><div class="loading-spinner"></div><span style="color: var(--text-secondary);">Reconnecting...</span></div></td></tr>';
    }
    const reconnected = await autoReconnect();
    if (reconnected) {
      window.location.reload();
      return;
    } else {
      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; padding: 40px; color: var(--danger);">Connection failed. Redirecting...</td></tr>';
      }
      const currentUrl = window.location.pathname + window.location.search;
      sessionStorage.setItem('mongodb_dashboard_return_url', currentUrl);
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
      return;
    }
  }

  // Connection is good, proceed with loading documents
  loadDocuments(dbName, collectionName);

  if (searchInput) {
    // Handle search input with debounce
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.trim();
      currentSearchTerm = searchTerm;
      
      // Show/hide clear button
      clearSearchBtn.style.display = searchTerm ? 'flex' : 'none';
      
      // Clear existing timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // Debounce search - wait 300ms after user stops typing
      searchTimeout = setTimeout(() => {
        updateUrlParams();
        currentCursor = null;
        currentNextSkip = null;
        allDocuments = [];
        loadDocuments(dbName, collectionName);
      }, 300);
    });

    // Handle Enter key for immediate search
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        updateUrlParams();
        currentCursor = null;
        currentNextSkip = null;
        allDocuments = [];
        loadDocuments(dbName, collectionName);
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchTerm = '';
      clearSearchBtn.style.display = 'none';
      updateUrlParams();
      currentCursor = null;
      currentNextSkip = null;
      allDocuments = [];
      loadDocuments(dbName, collectionName);
    });
  }
  
  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    currentCursor = null;
    currentNextSkip = null;
    allDocuments = [];
    loadDocuments(dbName, collectionName);
  });

  // Add document button
  document.getElementById('addDocBtn')?.addEventListener('click', () => {
    openDocModal(dbName, collectionName, null);
  });

  // Columns button
  document.getElementById('columnsBtn')?.addEventListener('click', () => {
    openColumnsModal(dbName, collectionName);
  });

  // Load more button — handles both cursor and offset pagination modes
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
    if (currentNextSkip !== null) {
      loadDocuments(dbName, collectionName, null, currentNextSkip);
    } else {
      loadDocuments(dbName, collectionName, currentCursor);
    }
  });

  // Modal handlers
  setupModalHandlers();
  setupColumnsModalHandlers();
  setupViewModalHandlers();
  initOpenTabsBar(dbName, collectionName);
  initImportExport(dbName, collectionName);
  initExplainPlan(dbName, collectionName);
  initCollectionTabs(dbName, collectionName);
  initIndexesPanel(dbName, collectionName);
  initSchemaPanel(dbName, collectionName);
  initAggregationPanel(dbName, collectionName);
  initValidationPanel(dbName, collectionName);
  initStatsPanel(dbName, collectionName);
  initViewModeToggle(dbName, collectionName);
  initShellPanel(dbName);
}

function runQuery(dbName, collectionName) {
  const queryFilterEl = document.getElementById('queryFilter');
  const queryProjectionEl = document.getElementById('queryProjection');
  const querySortEl = document.getElementById('querySort');
  const queryLimitEl = document.getElementById('queryLimit');
  const querySkipEl = document.getElementById('querySkip');

  currentFilter = queryFilterEl?.value.trim() || '';
  currentProjection = queryProjectionEl?.value.trim() || '';
  currentSort = querySortEl?.value.trim() || '';
  currentLimit = Math.min(Math.max(parseInt(queryLimitEl?.value) || 50, 1), 1000);
  currentSkip = Math.max(parseInt(querySkipEl?.value) || 0, 0);

  // Auto-record in query history if there's a meaningful query
  if (currentFilter || currentSort || currentProjection) {
    addToQueryHistory(dbName, collectionName, {
      filter: currentFilter,
      projection: currentProjection,
      sort: currentSort,
      limit: currentLimit,
      skip: currentSkip,
    });
  }

  updateUrlParams();
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  loadDocuments(dbName, collectionName);
}

async function loadDocuments(dbName, collectionName, cursor = null, nextSkip = null) {
  const tableBody = document.getElementById('tableBody');
  const tableHeader = document.getElementById('tableHeader');
  const pagination = document.getElementById('pagination');
  const docCount = document.getElementById('docCount');

  if (!cursor && nextSkip === null) {
    tableBody.innerHTML = '<tr class="loading-row"><td colspan="100"><div class="loading-spinner"></div></td></tr>';
    allDocuments = [];
    allAvailableFields = [];
  }

  try {
    const limit = currentLimit || 50;
    let url = `/api/${dbName}/${collectionName}?limit=${limit}`;

    // Cursor-based or offset-based pagination
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    } else if (nextSkip !== null) {
      url += `&skip=${nextSkip}`;
    } else if (currentSkip > 0) {
      url += `&skip=${currentSkip}`;
    }

    if (currentSearchTerm) url += `&search=${encodeURIComponent(currentSearchTerm)}`;
    if (currentFilter) url += `&filter=${encodeURIComponent(currentFilter)}`;
    if (currentProjection) url += `&projection=${encodeURIComponent(currentProjection)}`;
    if (currentSort) url += `&sort=${encodeURIComponent(currentSort)}`;
    
    if (Object.keys(arrayFilters).length > 0) {
      url += `&arrayFilters=${encodeURIComponent(JSON.stringify(arrayFilters))}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    const { documents, nextCursor, nextSkip: responseNextSkip, hasMore, totalCount } = data;
    
    currentCursor = nextCursor;
    currentNextSkip = responseNextSkip ?? null;
    allDocuments = allDocuments.concat(documents);

    // Update count
    const hasActiveQuery = currentSearchTerm || currentFilter;
    if (hasActiveQuery) {
      docCount.textContent = `${formatCount(allDocuments.length)}${hasMore ? '+' : ''} of ${formatCount(totalCount)} documents`;
    } else {
      docCount.textContent = `${formatCount(totalCount)} documents`;
    }

    // Determine table fields from documents
    if (documents.length > 0) {
      // Extract all available fields from all loaded documents (accumulate)
      const newFields = extractAllFields(documents);
      allAvailableFields = Array.from(new Set([...allAvailableFields, ...newFields])).sort();
      
      // Only reset table fields if this is a new load (not pagination)
      if (!cursor && nextSkip === null) {
        // Check for saved column visibility preferences
        const savedVisibility = getColumnVisibility(dbName, collectionName);
        
        if (savedVisibility && savedVisibility.length > 0) {
          // Use saved preferences, but ensure all saved fields still exist
          tableFields = savedVisibility.filter(field => allAvailableFields.includes(field));
          // If no saved fields exist anymore, fall back to default
          if (tableFields.length === 0) {
            tableFields = extractFields(documents[0]);
            saveColumnVisibility(dbName, collectionName, tableFields);
          }
        } else {
          // No saved preferences, use default (first 5 priority fields)
          tableFields = extractFields(documents[0]);
          // Save default as initial preference
          saveColumnVisibility(dbName, collectionName, tableFields);
        }
        
        renderTableHeader();
      }
    }

    // Render documents
    if (!cursor && nextSkip === null) {
      tableBody.innerHTML = '';
    }

    documents.forEach(doc => {
      const row = createDocumentRow(doc, dbName, collectionName);
      tableBody.appendChild(row);
    });

    // Render alternative views
    renderCurrentView(dbName, collectionName);

    // Ensure table header is rendered
    if (tableFields.length > 0 && tableHeader.innerHTML.trim() === '') {
      renderTableHeader();
    }

    // Pagination
    if (hasMore) {
      pagination.style.display = 'flex';
      document.getElementById('loadMoreBtn').style.display = 'block';
      const hasActiveQuery = currentSearchTerm || currentFilter;
      if (hasActiveQuery) {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ${formatCount(totalCount)} results`;
      } else {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ~${formatCount(totalCount)}`;
      }
    } else {
      pagination.style.display = allDocuments.length > 0 ? 'flex' : 'none';
      document.getElementById('loadMoreBtn').style.display = 'none';
      const hasActiveQuery = currentSearchTerm || currentFilter;
      if (hasActiveQuery) {
        document.getElementById('paginationInfo').textContent = `Showing all ${allDocuments.length} result${allDocuments.length !== 1 ? 's' : ''}`;
      } else {
        document.getElementById('paginationInfo').textContent = `Showing all ${allDocuments.length} documents`;
      }
    }

    if (documents.length === 0 && !cursor) {
      tableBody.innerHTML = '<tr><td colspan="100" style="text-align: center; padding: 40px; color: var(--text-muted);">No documents found</td></tr>';
    }
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="100" style="text-align: center; padding: 40px; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

function extractFields(doc, maxFields = 5) {
  const fields = Object.keys(doc);
  const priorityFields = ['_id', 'name', 'title', 'email', 'username', 'createdAt', 'updatedAt', 'created_at', 'updated_at'];
  
  const sorted = fields.sort((a, b) => {
    const aIdx = priorityFields.indexOf(a);
    const bIdx = priorityFields.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  });
  
  return sorted.slice(0, maxFields);
}

function extractAllFields(docs) {
  const fieldSet = new Set();
  docs.forEach(doc => {
    Object.keys(doc).forEach(key => {
      if (key !== 'Extra Fields' && key !== 'Actions') {
        fieldSet.add(key);
      }
    });
  });
  return Array.from(fieldSet).sort();
}

function getColumnVisibilityKey(dbName, collectionName) {
  return `mongodb_dashboard_columns_${dbName}_${collectionName}`;
}

function getColumnVisibility(dbName, collectionName) {
  try {
    const key = getColumnVisibilityKey(dbName, collectionName);
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveColumnVisibility(dbName, collectionName, visibleFields) {
  try {
    const key = getColumnVisibilityKey(dbName, collectionName);
    localStorage.setItem(key, JSON.stringify(visibleFields));
  } catch {
    // Ignore storage errors
  }
}

function renderTableHeader() {
  const tableHeader = document.getElementById('tableHeader');
  if (!tableHeader) return;
  
  const headerCells = tableFields.map(field => {
    const isArray = isArrayField(field);
    const hasFilter = arrayFilters[field] !== undefined;
    const fieldId = sanitizeId(field);
    
    return `
      <th>
        <div class="column-header-content">
          <span>${escapeHtml(field)}</span>
          ${isArray ? `
            <button class="filter-icon ${hasFilter ? 'active' : ''}" data-field="${escapeHtml(field)}" data-field-id="${fieldId}" title="Filter array">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
              </svg>
            </button>
            <div class="filter-dropdown" id="filter-dropdown-${fieldId}" style="display: none;">
              <div class="filter-dropdown-content">
                <div class="filter-option">
                  <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="filter-type-${fieldId}" value="empty" ${hasFilter && arrayFilters[field].type === 'empty' ? 'checked' : ''}>
                    <span>Empty arrays (no elements)</span>
                  </label>
                </div>
                <div class="filter-option">
                  <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 6px;">
                    <input type="radio" name="filter-type-${fieldId}" value="gte" ${hasFilter && arrayFilters[field].type === 'gte' ? 'checked' : ''}>
                    <span>Greater than or equal to:</span>
                  </label>
                  <input type="number" min="0" id="filter-value-${fieldId}" value="${hasFilter && arrayFilters[field].type === 'gte' ? arrayFilters[field].value : '0'}" placeholder="0" style="margin-left: 24px;" ${hasFilter && arrayFilters[field].type === 'gte' ? '' : 'disabled'}>
                </div>
                <div class="filter-actions">
                  <button class="btn btn-sm btn-ghost" data-action="apply" data-field="${escapeHtml(field)}" data-field-id="${fieldId}">Apply</button>
                  <button class="btn btn-sm btn-ghost" data-action="clear" data-field="${escapeHtml(field)}" data-field-id="${fieldId}">Clear</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </th>
    `;
  }).join('');
  
  tableHeader.innerHTML = headerCells + '<th>Extra Fields</th><th>Actions</th>';
  
  // Attach click handlers for filter icons using event delegation
  tableHeader.addEventListener('click', (e) => {
    const filterIcon = e.target.closest('.filter-icon');
    if (!filterIcon) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const fieldId = filterIcon.dataset.fieldId;
    const field = filterIcon.dataset.field;
    const dropdown = document.getElementById(`filter-dropdown-${fieldId}`);
    
    if (!dropdown) {
      console.error('Dropdown not found for field:', field);
      return;
    }
    
    // Close all other dropdowns
    document.querySelectorAll('.filter-dropdown').forEach(dd => {
      if (dd !== dropdown) {
        dd.classList.remove('show');
        dd.style.display = 'none';
      }
    });
    
    // Toggle current dropdown
    const isShowing = dropdown.classList.contains('show');
    if (isShowing) {
      dropdown.classList.remove('show');
      dropdown.style.display = 'none';
    } else {
      // Calculate position relative to the icon
      const iconRect = filterIcon.getBoundingClientRect();
      const headerRect = tableHeader.getBoundingClientRect();
      
      dropdown.style.top = `${iconRect.bottom + window.scrollY + 4}px`;
      dropdown.style.left = `${iconRect.left + window.scrollX}px`;
      
      dropdown.classList.add('show');
      dropdown.style.display = 'block';
    }
    
    // Update number input disabled state based on selected radio
    const numberInput = document.getElementById(`filter-value-${fieldId}`);
    const radioButtons = dropdown.querySelectorAll(`input[name="filter-type-${fieldId}"]`);
    const updateInputState = () => {
      const selectedType = dropdown.querySelector(`input[name="filter-type-${fieldId}"]:checked`)?.value;
      if (numberInput) {
        numberInput.disabled = selectedType !== 'gte';
      }
    };
    
    updateInputState();
    radioButtons.forEach(radio => {
      radio.addEventListener('change', updateInputState);
    });
  });
  
  // Attach click handlers for Apply/Clear buttons using event delegation
  tableHeader.addEventListener('click', (e) => {
    const applyBtn = e.target.closest('[data-action="apply"]');
    const clearBtn = e.target.closest('[data-action="clear"]');
    
    if (applyBtn) {
      e.stopPropagation();
      e.preventDefault();
      const field = applyBtn.dataset.field;
      applyArrayFilter(field);
      return;
    }
    
    if (clearBtn) {
      e.stopPropagation();
      e.preventDefault();
      const field = clearBtn.dataset.field;
      clearArrayFilter(field);
      return;
    }
  });
  
  // Close dropdowns when clicking outside (only attach once globally)
  if (!window.arrayFilterClickHandlerAttached) {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.filter-icon') && !e.target.closest('.filter-dropdown') && !e.target.closest('[data-action]')) {
        document.querySelectorAll('.filter-dropdown').forEach(dd => {
          dd.classList.remove('show');
          dd.style.display = 'none';
        });
      }
    });
    window.arrayFilterClickHandlerAttached = true;
  }
}

function isArrayField(fieldName) {
  // Check if field is an array by looking at sample documents
  if (allDocuments.length === 0) return false;
  
  // Check first few documents to see if this field is consistently an array
  let arrayCount = 0;
  let checkedCount = 0;
  
  for (let i = 0; i < Math.min(10, allDocuments.length); i++) {
    const value = allDocuments[i][fieldName];
    if (value !== null && value !== undefined) {
      checkedCount++;
      if (Array.isArray(value)) {
        arrayCount++;
      }
    }
  }
  
  // If most non-null values are arrays, consider it an array field
  return checkedCount > 0 && arrayCount / checkedCount >= 0.5;
}

function createDocumentRow(doc, dbName, collectionName) {
  const tr = document.createElement('tr');
  const docId = doc._id?.$oid || doc._id;

  tableFields.forEach(field => {
    const td = document.createElement('td');
    td.innerHTML = formatCellValue(doc[field], field);

    // Enable inline editing for non-_id simple fields
    if (field !== '_id' && docId) {
      td.classList.add('cell-editable');
      td.addEventListener('dblclick', () => {
        startInlineEdit(td, doc, field, dbName, collectionName, docId);
      });
    }
    tr.appendChild(td);
  });

  // Calculate extra fields count
  const totalFields = Object.keys(doc).length;
  const displayedFields = tableFields.length;
  const extraFieldsCount = Math.max(0, totalFields - displayedFields);
  
  // Extra Fields column
  const extraFieldsTd = document.createElement('td');
  extraFieldsTd.className = 'cell-extra-fields';
  if (extraFieldsCount > 0) {
    extraFieldsTd.innerHTML = `<span class="extra-fields-badge">+${extraFieldsCount}</span>`;
  } else {
    extraFieldsTd.innerHTML = '<span class="cell-muted">—</span>';
  }
  tr.appendChild(extraFieldsTd);

  // Actions column
  const actionsTd = document.createElement('td');
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'cell-actions';
  
  // View button
  const viewBtn = document.createElement('button');
  viewBtn.className = 'action-btn view';
  viewBtn.title = 'View';
  viewBtn.onclick = () => { openViewModal(dbName, collectionName, docId); };
  viewBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  `;
  actionsDiv.appendChild(viewBtn);
  
  // Edit button - set data attribute using JavaScript to avoid HTML escaping issues
  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit';
  editBtn.title = 'Edit';
  editBtn.dataset.doc = JSON.stringify(doc); // Browser handles escaping automatically
  editBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  `;
  editBtn.addEventListener('click', (e) => {
    const doc = JSON.parse(e.currentTarget.dataset.doc);
    openDocModal(dbName, collectionName, doc);
  });
  actionsDiv.appendChild(editBtn);

  // Duplicate button
  const dupBtn = document.createElement('button');
  dupBtn.className = 'action-btn duplicate';
  dupBtn.title = 'Duplicate';
  dupBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
    </svg>
  `;
  dupBtn.addEventListener('click', async () => {
    await duplicateDocument(doc, dbName, collectionName);
  });
  actionsDiv.appendChild(dupBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'action-btn delete';
  deleteBtn.title = 'Delete';
  deleteBtn.dataset.id = docId;
  deleteBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  `;
  deleteBtn.addEventListener('click', (e) => {
    openDeleteModal(dbName, collectionName, e.currentTarget.dataset.id);
  });
  actionsDiv.appendChild(deleteBtn);
  
  actionsTd.appendChild(actionsDiv);
  tr.appendChild(actionsTd);
  return tr;
}

// ─── Duplicate Document ──────────────────────────────────────────────────────

async function duplicateDocument(doc, dbName, collectionName) {
  try {
    // Clone document and remove _id so MongoDB generates a new one
    const clone = JSON.parse(JSON.stringify(doc));
    delete clone._id;

    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clone),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Document duplicated successfully', 'success', 2500);

    // Reload documents to show the new one
    currentCursor = null;
    currentNextSkip = null;
    allDocuments = [];
    loadDocuments(dbName, collectionName);
  } catch (err) {
    showToast('Duplicate failed: ' + err.message, 'error');
  }
}

// ─── View Mode Switching ─────────────────────────────────────────────────────

function initViewModeToggle(dbName, collectionName) {
  const toggle = document.getElementById('viewModeToggle');
  if (!toggle) return;

  // Set initial state
  toggle.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentViewMode);
    btn.addEventListener('click', () => {
      currentViewMode = btn.dataset.view;
      localStorage.setItem('mongodb_dashboard_view_mode', currentViewMode);
      toggle.querySelectorAll('.view-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderCurrentView(dbName, collectionName);
    });
  });
}

function renderCurrentView(dbName, collectionName) {
  const tableContainer = document.getElementById('tableViewContainer');
  const listContainer = document.getElementById('listViewContainer');
  const jsonContainer = document.getElementById('jsonViewContainer');
  if (!tableContainer) return;

  tableContainer.style.display = currentViewMode === 'table' ? '' : 'none';
  listContainer.style.display = currentViewMode === 'list' ? '' : 'none';
  jsonContainer.style.display = currentViewMode === 'json' ? '' : 'none';

  if (currentViewMode === 'list') {
    renderListView(dbName, collectionName);
  } else if (currentViewMode === 'json') {
    renderJsonView();
  }
}

function renderListView(dbName, collectionName) {
  const body = document.getElementById('listViewBody');
  if (!body) return;

  if (allDocuments.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No documents found</div>';
    return;
  }

  body.innerHTML = allDocuments.map((doc, idx) => {
    const docId = doc._id?.$oid || doc._id || idx;
    const fields = Object.entries(doc);
    return `
      <div class="list-view-card" data-idx="${idx}">
        <div class="list-view-card-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span class="list-view-card-id">${escapeHtml(String(docId))}</span>
          <div class="list-view-card-actions">
            <button class="action-btn edit" title="Edit" onclick="event.stopPropagation(); openDocModal('${escapeHtml(dbName)}','${escapeHtml(collectionName)}', allDocuments[${idx}])">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="action-btn delete" title="Delete" onclick="event.stopPropagation(); openDeleteModal('${escapeHtml(dbName)}','${escapeHtml(collectionName)}','${escapeHtml(String(docId))}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
            <span class="list-view-card-toggle">&#9660;</span>
          </div>
        </div>
        <div class="list-view-card-body">
          ${fields.map(([key, val]) => renderListField(key, val)).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderListField(key, value, depth = 0) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !value.$oid && !value.$date && !value.$numberDecimal) {
    const entries = Object.entries(value);
    return `
      <div class="list-view-field">
        <span class="list-view-field-key">${escapeHtml(key)}</span>
        <span class="list-view-field-value">{${entries.length} fields}</span>
      </div>
      <div class="list-view-nested">
        ${entries.map(([k, v]) => renderListField(k, v, depth + 1)).join('')}
      </div>`;
  }
  return `
    <div class="list-view-field">
      <span class="list-view-field-key">${escapeHtml(key)}</span>
      <span class="list-view-field-value">${formatListValue(value)}</span>
    </div>`;
}

function formatListValue(value) {
  if (value === null || value === undefined) return '<span class="cell-null">null</span>';
  if (value.$oid) return `<span class="cell-id">ObjectId("${value.$oid}")</span>`;
  if (value.$date) return `<span class="cell-string">${new Date(value.$date).toISOString()}</span>`;
  if (value.$numberDecimal) return `<span class="cell-number">${value.$numberDecimal}</span>`;
  if (typeof value === 'string') return `<span class="cell-string">"${escapeHtml(value)}"</span>`;
  if (typeof value === 'number') return `<span class="cell-number">${value}</span>`;
  if (typeof value === 'boolean') return `<span class="cell-boolean">${value}</span>`;
  if (Array.isArray(value)) return `<span class="cell-string">[${value.length} elements]</span>`;
  return `<span>${escapeHtml(JSON.stringify(value))}</span>`;
}

function renderJsonView() {
  const body = document.getElementById('jsonViewBody');
  if (!body) return;

  if (allDocuments.length === 0) {
    body.textContent = '[]';
    return;
  }

  // Use renderJsonTree for syntax-colored JSON
  body.innerHTML = renderJsonTree(allDocuments, 0);
}

// ─── Inline Field Editing ────────────────────────────────────────────────────

function startInlineEdit(td, doc, field, dbName, collectionName, docId) {
  if (td.querySelector('.inline-edit-input')) return; // Already editing

  const currentValue = doc[field];
  const originalHtml = td.innerHTML;
  const isComplex = currentValue !== null && typeof currentValue === 'object';

  // Create edit input
  const input = document.createElement(isComplex ? 'textarea' : 'input');
  input.className = 'inline-edit-input';

  if (isComplex) {
    input.value = JSON.stringify(currentValue, null, 2);
    input.rows = 4;
  } else if (typeof currentValue === 'boolean') {
    // Boolean toggle
    const select = document.createElement('select');
    select.className = 'inline-edit-input';
    select.innerHTML = `<option value="true" ${currentValue ? 'selected' : ''}>true</option><option value="false" ${!currentValue ? 'selected' : ''}>false</option>`;
    td.innerHTML = '';
    td.appendChild(select);
    select.focus();

    const save = async () => {
      const newVal = select.value === 'true';
      if (newVal !== currentValue) {
        await saveInlineEdit(td, doc, field, newVal, dbName, collectionName, docId, originalHtml);
      } else {
        td.innerHTML = originalHtml;
      }
    };
    select.addEventListener('change', save);
    select.addEventListener('blur', save);
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { td.innerHTML = originalHtml; }
    });
    return;
  } else if (currentValue === null || currentValue === undefined) {
    input.value = '';
    input.placeholder = 'null';
  } else {
    input.value = String(currentValue);
  }

  if (input.tagName === 'INPUT') {
    input.type = typeof currentValue === 'number' ? 'number' : 'text';
    if (typeof currentValue === 'number') input.step = 'any';
  }

  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const rawValue = input.value;
    let newValue;

    if (isComplex) {
      try {
        newValue = JSON.parse(rawValue);
      } catch {
        td.innerHTML = originalHtml;
        return;
      }
    } else if (rawValue === '' && (currentValue === null || currentValue === undefined)) {
      td.innerHTML = originalHtml;
      return;
    } else if (typeof currentValue === 'number') {
      newValue = Number(rawValue);
      if (isNaN(newValue)) { td.innerHTML = originalHtml; return; }
    } else if (rawValue === 'null') {
      newValue = null;
    } else {
      newValue = rawValue;
    }

    // No change
    if (JSON.stringify(newValue) === JSON.stringify(currentValue)) {
      td.innerHTML = originalHtml;
      return;
    }

    await saveInlineEdit(td, doc, field, newValue, dbName, collectionName, docId, originalHtml);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isComplex) save();
    if (e.key === 'Enter' && isComplex && (e.ctrlKey || e.metaKey)) save();
    if (e.key === 'Escape') { td.innerHTML = originalHtml; }
  });
}

async function saveInlineEdit(td, doc, field, newValue, dbName, collectionName, docId, originalHtml) {
  td.innerHTML = '<span class="inline-edit-saving">Saving...</span>';

  try {
    // Build updated document (clone and modify field)
    const updatedDoc = JSON.parse(JSON.stringify(doc));
    delete updatedDoc._id;
    updatedDoc[field] = newValue;

    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedDoc),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Update local document reference
    doc[field] = newValue;
    td.innerHTML = formatCellValue(newValue, field);

    // Flash success
    td.classList.add('inline-edit-success');
    setTimeout(() => td.classList.remove('inline-edit-success'), 800);
  } catch (err) {
    td.innerHTML = originalHtml;
    td.classList.add('inline-edit-error');
    setTimeout(() => td.classList.remove('inline-edit-error'), 800);
  }
}

function formatCellValue(value, field) {
  if (value === null || value === undefined) {
    return '<span class="cell-null">null</span>';
  }

  if (field === '_id' && value.$oid) {
    return `<span class="cell-id">${value.$oid}</span>`;
  }

  if (typeof value === 'object') {
    if (value.$oid) return `<span class="cell-id">${value.$oid}</span>`;
    if (value.$date) return `<span class="cell-value">${new Date(value.$date).toLocaleString()}</span>`;
    if (Array.isArray(value)) return `<span class="cell-object">[${value.length} items]</span>`;
    return `<span class="cell-object">{...}</span>`;
  }

  if (typeof value === 'string') {
    const maxLen = 50;
    const display = value.length > maxLen ? value.substring(0, maxLen) + '...' : value;
    return `<span class="cell-value">${escapeHtml(display)}</span>`;
  }

  return `<span class="cell-value">${value}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeId(str) {
  // Convert field name to a safe ID by replacing special characters
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Document Modal
let currentModalDoc = null;
let currentModalDb = null;
let currentModalCol = null;
let currentSchema = null;
let useFormMode = true;

function setupModalHandlers() {
  const modal = document.getElementById('docModal');
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn = document.getElementById('modalSave');
  const deleteBtn = document.getElementById('modalDelete');

  const closeModal = () => {
    modal.style.display = 'none';
    currentModalDoc = null;
  };

  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', saveDocument);
  deleteBtn.addEventListener('click', () => {
    const docId = currentModalDoc?._id?.$oid || currentModalDoc?._id;
    if (docId) {
      modal.style.display = 'none';
      openDeleteModal(currentModalDb, currentModalCol, docId);
    }
  });

  // Form/JSON toggle
  document.getElementById('useFormBtn')?.addEventListener('click', () => {
    useFormMode = true;
    const cmWrap = cmEditors['docEditor']?.getWrapperElement();
    if (cmWrap) cmWrap.style.display = 'none';
    document.getElementById('docFormContainer').style.display = 'block';
    document.getElementById('useFormBtn').classList.add('active');
    document.getElementById('useJsonBtn').classList.remove('active');
  });

  document.getElementById('useJsonBtn')?.addEventListener('click', () => {
    useFormMode = false;
    const formContainer = document.getElementById('docFormContainer');
    const cmWrap = cmEditors['docEditor']?.getWrapperElement();

    // Convert form data to JSON
    if (currentSchema) {
      const formData = getFormData(formContainer);
      setEditorValue('docEditor', JSON.stringify(formData, null, 2));
    }

    if (cmWrap) cmWrap.style.display = '';
    formContainer.style.display = 'none';
    document.getElementById('useFormBtn').classList.remove('active');
    document.getElementById('useJsonBtn').classList.add('active');
    focusEditor('docEditor');
  });

  // Delete modal handlers
  const deleteModal = document.getElementById('deleteModal');
  if (deleteModal) {
    deleteModal.querySelector('.modal-backdrop').addEventListener('click', () => deleteModal.style.display = 'none');
    document.getElementById('deleteModalClose')?.addEventListener('click', () => deleteModal.style.display = 'none');
    document.getElementById('deleteCancel')?.addEventListener('click', () => deleteModal.style.display = 'none');
  }
}

async function openDocModal(dbName, collectionName, doc) {
  const modal = document.getElementById('docModal');
  const title = document.getElementById('modalTitle');
  const editorEl = document.getElementById('docEditor');
  const formContainer = document.getElementById('docFormContainer');
  const formToggle = document.getElementById('formToggle');
  const deleteBtn = document.getElementById('modalDelete');
  const errorEl = document.getElementById('editorError');

  currentModalDoc = doc;
  currentModalDb = dbName;
  currentModalCol = collectionName;

  // Initialize CodeMirror if not yet created
  if (!cmEditors['docEditor'] && editorEl) {
    createJsonEditor('docEditor');
  }

  const cmWrap = cmEditors['docEditor']?.getWrapperElement();

  if (doc) {
    title.textContent = 'Edit Document';
    deleteBtn.style.display = 'block';
    setEditorValue('docEditor', JSON.stringify(doc, null, 2));
    useFormMode = false;
    formToggle.style.display = 'none';
    formContainer.style.display = 'none';
    if (cmWrap) cmWrap.style.display = '';
  } else {
    title.textContent = 'New Document';
    deleteBtn.style.display = 'none';

    try {
      const res = await fetch(`/api/${dbName}/${collectionName}/schema`);
      const data = await res.json();

      if (res.ok && data.schema && !data.schema.isEmpty && Object.keys(data.schema.fields || {}).length > 0) {
        currentSchema = data.schema;
        useFormMode = true;
        formToggle.style.display = 'flex';
        renderFormFromSchema(formContainer, currentSchema.fields);
        formContainer.style.display = 'block';
        if (cmWrap) cmWrap.style.display = 'none';
      } else {
        currentSchema = null;
        useFormMode = false;
        formToggle.style.display = 'none';
        formContainer.style.display = 'none';
        if (cmWrap) cmWrap.style.display = '';
        setEditorValue('docEditor', '{\n  \n}');
      }
    } catch (err) {
      currentSchema = null;
      useFormMode = false;
      formToggle.style.display = 'none';
      formContainer.style.display = 'none';
      if (cmWrap) cmWrap.style.display = '';
      setEditorValue('docEditor', '{\n  \n}');
    }
  }

  errorEl.style.display = 'none';
  modal.style.display = 'flex';

  if (useFormMode && formContainer.style.display !== 'none') {
    const firstInput = formContainer.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  } else {
    focusEditor('docEditor');
  }
}

async function saveDocument() {
  const formContainer = document.getElementById('docFormContainer');
  const errorEl = document.getElementById('editorError');
  const saveBtn = document.getElementById('modalSave');

  let doc;
  try {
    if (useFormMode && formContainer.style.display !== 'none' && currentSchema) {
      doc = getFormData(formContainer);
    } else {
      doc = JSON.parse(getEditorValue('docEditor'));
    }
  } catch (e) {
    errorEl.textContent = 'Invalid JSON: ' + e.message;
    errorEl.style.display = 'block';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  errorEl.style.display = 'none';

  try {
    const isNew = !currentModalDoc;
    const docId = currentModalDoc?._id?.$oid || currentModalDoc?._id;
    
    const url = isNew 
      ? `/api/${currentModalDb}/${currentModalCol}`
      : `/api/${currentModalDb}/${currentModalCol}/${docId}`;
    
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Close modal and refresh
    document.getElementById('docModal').style.display = 'none';
    currentModalDoc = null;
    currentSchema = null;
    
    // Refresh the document list
    currentCursor = null;
    allDocuments = [];
    loadDocuments(currentModalDb, currentModalCol);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

let deleteDocId = null;
let deleteDbName = null;
let deleteColName = null;

function openDeleteModal(dbName, collectionName, docId) {
  deleteDocId = docId;
  deleteDbName = dbName;
  deleteColName = collectionName;

  const modal = document.getElementById('deleteModal');
  modal.style.display = 'flex';

  document.getElementById('deleteConfirm').onclick = confirmDelete;
}

async function confirmDelete() {
  const confirmBtn = document.getElementById('deleteConfirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';

  try {
    const res = await fetch(`/api/${deleteDbName}/${deleteColName}/${deleteDocId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Close modal and refresh
    document.getElementById('deleteModal').style.display = 'none';
    
    // If on document page, go back to collection
    if (window.location.pathname.includes(`/${deleteDocId}`)) {
      window.location.href = `/browse/${deleteDbName}/${deleteColName}`;
    } else {
      // Refresh the document list
      currentCursor = null;
      allDocuments = [];
      loadDocuments(deleteDbName, deleteColName);
    }
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete';
  }
}

// Document Detail Page
async function initDocumentPage(dbName, collectionName, docId) {
  const treeEl = document.getElementById('documentTree');
  
  try {
    const res = await fetch(`/api/${dbName}/${collectionName}/${docId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    treeEl.innerHTML = '<div class="json-viewer">' + renderJsonTree(data.document) + '</div>';

    // Edit button
    document.getElementById('editDocBtn')?.addEventListener('click', () => {
      openEditModal(data.document);
    });

    // Delete button
    document.getElementById('deleteDocBtn')?.addEventListener('click', () => {
      openDeleteModalForPage(dbName, collectionName, docId);
    });

    // Setup edit modal handlers
    setupEditModalHandlers(dbName, collectionName, docId);
  } catch (err) {
    treeEl.innerHTML = `<div style="color: var(--danger);">Error: ${err.message}</div>`;
  }
}

function renderJsonTree(obj, indent = 0) {
  if (obj === null) return '<span class="json-null">null</span>';
  if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
  if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
  if (typeof obj === 'string') return `<span class="json-string">"${escapeHtml(obj)}"</span>`;

  if (obj.$oid) return `<span class="json-string">ObjectId("${obj.$oid}")</span>`;
  if (obj.$date) return `<span class="json-string">ISODate("${obj.$date}")</span>`;

  const indentSize = 2;
  const spaces = ' '.repeat(indent * indentSize);
  const innerSpaces = ' '.repeat((indent + 1) * indentSize);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-bracket">[]</span>';
    const items = obj.map(item => {
      const rendered = renderJsonTree(item, indent + 1);
      return `${innerSpaces}${rendered}`;
    }).join(',\n');
    return `<span class="json-bracket">[</span>\n${items}\n${spaces}<span class="json-bracket">]</span>`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return '<span class="json-bracket">{}</span>';

  const entries = keys.map(key => {
    const rendered = renderJsonTree(obj[key], indent + 1);
    return `${innerSpaces}<span class="json-key">"${escapeHtml(key)}"</span>: ${rendered}`;
  }).join(',\n');

  return `<span class="json-bracket">{</span>\n${entries}\n${spaces}<span class="json-bracket">}</span>`;
}

function openEditModal(doc) {
  const modal = document.getElementById('editModal');
  const editorEl = document.getElementById('editDocEditor');

  // Initialize CodeMirror if not yet created
  if (!cmEditors['editDocEditor'] && editorEl) {
    createJsonEditor('editDocEditor');
  }

  setEditorValue('editDocEditor', JSON.stringify(doc, null, 2));
  document.getElementById('editError').style.display = 'none';
  modal.style.display = 'flex';
  focusEditor('editDocEditor');
}

function setupEditModalHandlers(dbName, collectionName, docId) {
  const modal = document.getElementById('editModal');
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  const closeBtn = document.getElementById('editModalClose');
  const cancelBtn = document.getElementById('editCancel');
  const saveBtn = document.getElementById('editSave');

  const closeModal = () => modal.style.display = 'none';

  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('editError');

    let doc;
    try {
      doc = JSON.parse(getEditorValue('editDocEditor'));
    } catch (e) {
      errorEl.textContent = 'Invalid JSON: ' + e.message;
      errorEl.style.display = 'block';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    errorEl.style.display = 'none';

    try {
      const res = await fetch(`/api/${dbName}/${collectionName}/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh the page
      window.location.reload();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });

  // Delete modal
  const deleteModal = document.getElementById('deleteModal');
  deleteModal.querySelector('.modal-backdrop').addEventListener('click', () => deleteModal.style.display = 'none');
  document.getElementById('deleteModalClose').addEventListener('click', () => deleteModal.style.display = 'none');
  document.getElementById('deleteCancel').addEventListener('click', () => deleteModal.style.display = 'none');
}

function openDeleteModalForPage(dbName, collectionName, docId) {
  const modal = document.getElementById('deleteModal');
  modal.style.display = 'flex';

  document.getElementById('deleteConfirm').onclick = async () => {
    const confirmBtn = document.getElementById('deleteConfirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
      const res = await fetch(`/api/${dbName}/${collectionName}/${docId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Go back to collection
      window.location.href = `/browse/${dbName}/${collectionName}`;
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
    }
  };
}

// Schema-based form rendering
function renderFormFromSchema(container, schemaFields, prefix = '') {
  container.innerHTML = '';
  const form = document.createElement('form');
  form.className = 'doc-form';
  form.id = 'docForm';
  
  if (!schemaFields || Object.keys(schemaFields).length === 0) {
    const message = document.createElement('div');
    message.style.padding = '20px';
    message.style.textAlign = 'center';
    message.style.color = 'var(--text-muted)';
    message.textContent = 'No schema fields found. Use JSON editor instead.';
    container.appendChild(message);
    return;
  }
  
  const fields = flattenSchema(schemaFields, prefix);
  console.log(`Rendering ${fields.length} form fields`);
  
  if (fields.length === 0) {
    const message = document.createElement('div');
    message.style.padding = '20px';
    message.style.textAlign = 'center';
    message.style.color = 'var(--text-muted)';
    message.textContent = 'No fields detected. Use JSON editor instead.';
    container.appendChild(message);
    return;
  }
  
  fields.forEach(field => {
    const fieldEl = createFormField(field);
    form.appendChild(fieldEl);
  });
  
  container.appendChild(form);
}

function flattenSchema(schemaFields, prefix = '', depth = 0) {
  const fields = [];
  
  Object.keys(schemaFields).forEach(key => {
    const fieldSchema = schemaFields[key];
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    
    if (fieldSchema.type === 'object' && fieldSchema.fields) {
      // Nested object - recursively flatten
      const nested = flattenSchema(fieldSchema.fields, fieldPath, depth + 1);
      fields.push(...nested);
    } else {
      fields.push({
        path: fieldPath,
        name: key,
        depth,
        ...fieldSchema
      });
    }
  });
  
  return fields;
}

function createFormField(field) {
  const fieldDiv = document.createElement('div');
  fieldDiv.className = 'form-field';
  if (field.depth > 0) {
    fieldDiv.classList.add('form-nested');
    fieldDiv.style.marginLeft = `${field.depth * 16}px`;
  }
  
  const label = document.createElement('label');
  // Show full path for nested fields
  label.textContent = field.depth > 0 ? field.path : field.name;
  label.setAttribute('for', `field_${field.path.replace(/\./g, '_')}`);
  fieldDiv.appendChild(label);
  
  let input;
  
  if (field.type === 'enum' && field.enum) {
    // Dropdown for enum
    input = document.createElement('select');
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
    
    // Add empty option
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Select --';
    input.appendChild(emptyOption);
    
    // Add enum options
    field.enum.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      input.appendChild(option);
    });
  } else if (field.type === 'boolean') {
    // Checkbox for boolean
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    
    input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
    input.checked = field.default || false;
    
    wrapper.appendChild(input);
    wrapper.appendChild(label.cloneNode(true));
    fieldDiv.innerHTML = '';
    fieldDiv.appendChild(wrapper);
    return fieldDiv;
  } else if (field.type === 'number') {
    // Number input
    input = document.createElement('input');
    input.type = 'number';
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
  } else if (field.type === 'date') {
    // Date input
    input = document.createElement('input');
    input.type = 'datetime-local';
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
  } else if (field.type === 'array') {
    // Array field - simplified for now
    input = document.createElement('textarea');
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
    input.placeholder = 'Enter JSON array, e.g., ["item1", "item2"]';
  } else {
    // Text input (default)
    input = document.createElement('input');
    input.type = 'text';
    input.id = `field_${field.path.replace(/\./g, '_')}`;
    input.name = field.path;
  }
  
  if (field.examples && field.examples.length > 0) {
    const help = document.createElement('div');
    help.className = 'field-examples';
    help.textContent = `Examples: ${field.examples.slice(0, 3).join(', ')}`;
    fieldDiv.appendChild(help);
  }
  
  fieldDiv.appendChild(input);
  return fieldDiv;
}

function getFormData(formContainer) {
  const form = formContainer.querySelector('#docForm');
  if (!form) {
    console.error('Form not found in container');
    return {};
  }
  
  const data = {};
  const inputs = form.querySelectorAll('input, select, textarea');
  
  console.log(`Found ${inputs.length} form fields`);
  
  // Process form fields
  inputs.forEach(input => {
    if (!input.name) {
      console.warn('Input without name attribute:', input);
      return;
    }
    
    const value = getFieldValue(input);
    console.log(`Field ${input.name}: value =`, value, 'type =', input.type || input.tagName);
    
    // Include the value if it's not null/undefined
    // Include empty strings, false booleans, and 0 numbers
    if (value !== null && value !== undefined) {
      // For select dropdowns, skip empty option values
      if (input.tagName === 'SELECT' && input.value === '') {
        return; // Skip empty select values
      }
      setNestedValue(data, input.name, value);
    }
  });
  
  console.log('Collected form data:', data);
  return data;
}

function getFieldValue(input) {
  if (input.type === 'checkbox') {
    return input.checked;
  } else if (input.type === 'number') {
    const num = parseFloat(input.value);
    return isNaN(num) ? null : num;
  } else if (input.tagName === 'SELECT') {
    return input.value || null;
  } else if (input.tagName === 'TEXTAREA' && input.value.trim().startsWith('[')) {
    // Try to parse as JSON array
    try {
      return JSON.parse(input.value);
    } catch {
      return input.value;
    }
  } else {
    return input.value || null;
  }
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// Column Selector Modal
function setupColumnsModalHandlers() {
  const modal = document.getElementById('columnsModal');
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  const closeBtn = document.getElementById('columnsModalClose');
  const cancelBtn = document.getElementById('columnsCancel');
  const applyBtn = document.getElementById('columnsApply');
  const selectAllBtn = document.getElementById('selectAllColumns');
  const deselectAllBtn = document.getElementById('deselectAllColumns');

  const closeModal = () => {
    modal.style.display = 'none';
  };

  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  applyBtn.addEventListener('click', () => {
    const checkboxes = modal.querySelectorAll('#columnsList input[type="checkbox"]');
    const selectedFields = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    
    if (selectedFields.length === 0) {
      showToast('Please select at least one column to display.', 'warning');
      return;
    }

    // Save preferences
    saveColumnVisibility(currentDbName, currentCollectionName, selectedFields);
    
    // Update table fields
    tableFields = selectedFields;
    
    // Re-render table
    renderTableHeader();
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    allDocuments.forEach(doc => {
      const row = createDocumentRow(doc, currentDbName, currentCollectionName);
      tableBody.appendChild(row);
    });
    
    closeModal();
  });

  selectAllBtn.addEventListener('click', () => {
    modal.querySelectorAll('#columnsList input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
    });
  });

  deselectAllBtn.addEventListener('click', () => {
    modal.querySelectorAll('#columnsList input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
  });
}

function openColumnsModal(dbName, collectionName) {
  const modal = document.getElementById('columnsModal');
  const columnsList = document.getElementById('columnsList');
  
  if (!modal || !columnsList) return;

  // Get all available fields (use allAvailableFields if populated, otherwise extract from current documents)
  const availableFields = allAvailableFields.length > 0 
    ? allAvailableFields 
    : (allDocuments.length > 0 ? extractAllFields(allDocuments) : []);

  if (availableFields.length === 0) {
    columnsList.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">No fields available. Load some documents first.</p>';
    modal.style.display = 'flex';
    return;
  }

  // Get current visibility preferences
  const savedVisibility = getColumnVisibility(dbName, collectionName);
  const visibleFields = savedVisibility || tableFields;

  // Render checkboxes for each field
  columnsList.innerHTML = availableFields.map(field => {
    const isChecked = visibleFields.includes(field);
    const fieldType = getFieldType(field);
    return `
      <div class="column-item">
        <input type="checkbox" id="col_${field}" value="${escapeHtml(field)}" ${isChecked ? 'checked' : ''}>
        <label for="col_${field}">${escapeHtml(field)}</label>
        ${fieldType ? `<span class="column-type">${fieldType}</span>` : ''}
      </div>
    `;
  }).join('');

  modal.style.display = 'flex';
}

// View Document Modal
let currentViewDoc = null;
let currentViewDb = null;
let currentViewCollection = null;

function setupViewModalHandlers() {
  const modal = document.getElementById('viewModal');
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  const closeBtn = document.getElementById('viewModalClose');
  const closeBtnFooter = document.getElementById('viewModalCloseBtn');
  const populateBtn = document.getElementById('viewModalPopulateBtn');
  const copyBtn = document.getElementById('viewModalCopyBtn');

  const closeModal = () => {
    modal.style.display = 'none';
    currentViewDoc = null;
    currentViewDb = null;
    currentViewCollection = null;
  };

  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  closeBtnFooter.addEventListener('click', closeModal);
  
  populateBtn.addEventListener('click', async () => {
    if (currentViewDoc && currentViewDb) {
      await populateReferences(currentViewDoc, currentViewDb);
    }
  });

  const duplicateBtn = document.getElementById('viewModalDuplicateBtn');
  if (duplicateBtn) {
    duplicateBtn.addEventListener('click', async () => {
      if (currentViewDoc && currentViewDb && currentViewCollection) {
        await duplicateDocument(currentViewDoc, currentViewDb, currentViewCollection);
        closeModal();
      }
    });
  }

  copyBtn.addEventListener('click', async () => {
    if (!currentViewDoc) return;
    
    try {
      const jsonString = JSON.stringify(currentViewDoc, null, 2);
      await navigator.clipboard.writeText(jsonString);
      
      // Show feedback
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        Copied!
      `;
      copyBtn.disabled = true;
      
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy to clipboard', 'error');
    }
  });
}

async function openViewModal(dbName, collectionName, docId) {
  const modal = document.getElementById('viewModal');
  const contentEl = document.getElementById('viewDocumentContent');
  const populateBtn = document.getElementById('viewModalPopulateBtn');
  const copyBtn = document.getElementById('viewModalCopyBtn');
  
  if (!modal || !contentEl) return;

  // Show loading state
  contentEl.innerHTML = '<div class="loading-spinner"></div>';
  modal.style.display = 'flex';
  populateBtn.disabled = true;
  if (copyBtn) copyBtn.disabled = true;

  try {
    const res = await fetch(`/api/${dbName}/${collectionName}/${docId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    // Store current document info
    currentViewDoc = JSON.parse(JSON.stringify(data.document)); // Deep copy
    currentViewDb = dbName;
    currentViewCollection = collectionName;

    // Render JSON tree
    contentEl.innerHTML = '<div class="json-viewer">' + renderJsonTree(currentViewDoc) + '</div>';
    populateBtn.disabled = false;
    if (copyBtn) copyBtn.disabled = false;
  } catch (err) {
    contentEl.innerHTML = `<div style="color: var(--danger);">Error: ${err.message}</div>`;
    populateBtn.disabled = false;
    if (copyBtn) copyBtn.disabled = false;
  }
}

// Extract all ObjectIds from a document recursively
function extractObjectIds(obj, path = '', result = []) {
  if (obj === null || obj === undefined) {
    return result;
  }

  // Check if this is an ObjectId
  if (obj.$oid) {
    const fieldName = path.split(/[\.\[\]]/).filter(p => p && !/^\d+$/.test(p)).pop() || '';
    result.push({
      oid: obj.$oid,
      path: path,
      fieldName: fieldName
    });
    return result;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const newPath = path ? `${path}[${index}]` : `[${index}]`;
      extractObjectIds(item, newPath, result);
    });
    return result;
  }

  // Handle objects
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      extractObjectIds(obj[key], newPath, result);
    });
    return result;
  }

  return result;
}

// Guess collection name from field name
function guessCollectionName(fieldName) {
  // Common patterns
  const patterns = [
    // Remove common suffixes
    fieldName.replace(/Id$/, '').replace(/Ids$/, ''),
    fieldName.replace(/Ref$/, '').replace(/Refs$/, ''),
    fieldName.replace(/Reference$/, '').replace(/References$/, ''),
    // Pluralize
    fieldName + 's',
    // Singularize
    fieldName.replace(/s$/, ''),
    // Direct match
    fieldName
  ];

  return [...new Set(patterns)].filter(p => p && p.length > 0);
}

// Try to find a document by ObjectId in a collection
async function findDocumentById(dbName, collectionName, oid) {
  try {
    const res = await fetch(`/api/${dbName}/${collectionName}/${oid}`);
    const data = await res.json();
    if (res.ok && data.document) {
      return data.document;
    }
  } catch (err) {
    // Document not found or error
  }
  return null;
}

// Get all collections in a database
async function getCollections(dbName) {
  try {
    const res = await fetch(`/api/${dbName}/collections`);
    const data = await res.json();
    if (res.ok && data.collections) {
      return data.collections.map(c => c.name);
    }
  } catch (err) {
    console.error('Error fetching collections:', err);
  }
  return [];
}

// Populate ObjectId references in a document
async function populateReferences(doc, dbName) {
  const contentEl = document.getElementById('viewDocumentContent');
  const populateBtn = document.getElementById('viewModalPopulateBtn');
  const copyBtn = document.getElementById('viewModalCopyBtn');
  
  if (!contentEl || !populateBtn) return;

  // Show loading state
  populateBtn.disabled = true;
  populateBtn.textContent = 'Populating...';
  if (copyBtn) copyBtn.disabled = true;
  const originalContent = contentEl.innerHTML;
  contentEl.innerHTML = '<div class="loading-spinner"></div>';

  try {
    // Extract all ObjectIds
    const objectIds = extractObjectIds(doc);
    
    if (objectIds.length === 0) {
      contentEl.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">No ObjectId references found to populate.</div>';
      populateBtn.disabled = false;
      populateBtn.textContent = 'Populate';
      if (copyBtn) copyBtn.disabled = false;
      return;
    }

    // Get all collections in the database
    const collections = await getCollections(dbName);
    
    // Create a copy of the document to populate
    const populatedDoc = JSON.parse(JSON.stringify(doc));
    
    // Track which ObjectIds we've populated
    let populatedCount = 0;
    let notFoundCount = 0;

    // Try to populate each ObjectId
    for (const { oid, path, fieldName } of objectIds) {
      // Skip _id field (it's the document's own ID)
      if (path === '_id' || path === '') {
        continue;
      }

      let found = false;
      
      // First, try collections based on field name
      const guessedCollections = guessCollectionName(fieldName);
      for (const collectionName of guessedCollections) {
        if (collections.includes(collectionName)) {
          const refDoc = await findDocumentById(dbName, collectionName, oid);
          if (refDoc) {
            // Replace ObjectId with the document
            setNestedValue(populatedDoc, path, refDoc);
            found = true;
            populatedCount++;
            break;
          }
        }
      }

      // If not found, try all collections
      if (!found) {
        for (const collectionName of collections) {
          const refDoc = await findDocumentById(dbName, collectionName, oid);
          if (refDoc) {
            // Replace ObjectId with the document
            setNestedValue(populatedDoc, path, refDoc);
            found = true;
            populatedCount++;
            break;
          }
        }
      }

      if (!found) {
        notFoundCount++;
      }
    }

    // Update the stored document
    currentViewDoc = populatedDoc;

    // Render the populated document
    let statusHtml = '';
    if (notFoundCount > 0 || populatedCount > 0) {
      statusHtml = `<div style="padding: 12px; margin-top: 12px; background: var(--bg-tertiary); border-radius: var(--radius); color: var(--text-secondary); font-size: 12px;">
        Populated ${populatedCount} reference(s).${notFoundCount > 0 ? ` ${notFoundCount} reference(s) not found.` : ''}
      </div>`;
    }
    
    contentEl.innerHTML = '<div class="json-viewer">' + renderJsonTree(populatedDoc) + '</div>' + statusHtml;
    if (copyBtn) copyBtn.disabled = false;

  } catch (err) {
    contentEl.innerHTML = `<div style="color: var(--danger);">Error populating references: ${err.message}</div>`;
  } finally {
    populateBtn.disabled = false;
    populateBtn.textContent = 'Populate';
    if (copyBtn) copyBtn.disabled = false;
  }
}

// Helper function to set nested value by path (handles arrays)
function setNestedValue(obj, path, value) {
  // Parse path like "urls[0]" or "metadata.sources[1]" or "pageId"
  const pathParts = [];
  let currentPart = '';
  
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '.') {
      if (currentPart) {
        pathParts.push({ type: 'property', value: currentPart });
        currentPart = '';
      }
    } else if (char === '[') {
      if (currentPart) {
        pathParts.push({ type: 'property', value: currentPart });
        currentPart = '';
      }
    } else if (char === ']') {
      if (currentPart) {
        pathParts.push({ type: 'index', value: parseInt(currentPart) });
        currentPart = '';
      }
    } else {
      currentPart += char;
    }
  }
  
  if (currentPart) {
    pathParts.push({ type: 'property', value: currentPart });
  }
  
  // Navigate to the target location
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (part.type === 'property') {
      if (current[part.value] === undefined || current[part.value] === null) {
        // Check if next part is an index (array)
        if (i + 1 < pathParts.length && pathParts[i + 1].type === 'index') {
          current[part.value] = [];
        } else {
          current[part.value] = {};
        }
      }
      current = current[part.value];
    } else if (part.type === 'index') {
      if (!Array.isArray(current)) {
        return; // Can't navigate into non-array
      }
      if (current[part.value] === undefined) {
        current[part.value] = {};
      }
      current = current[part.value];
    }
  }
  
  // Set the final value
  const lastPart = pathParts[pathParts.length - 1];
  if (lastPart.type === 'property') {
    current[lastPart.value] = value;
  } else if (lastPart.type === 'index') {
    if (!Array.isArray(current)) {
      return; // Can't set index on non-array
    }
    current[lastPart.value] = value;
  }
}

// Helper function to get nested value by path
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

function getFieldType(fieldName) {
  // Try to infer field type from sample documents
  if (allDocuments.length === 0) return null;
  
  const sampleDoc = allDocuments[0];
  const value = sampleDoc[fieldName];
  
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (value.$oid) return 'ObjectId';
  if (value.$date) return 'Date';
  if (typeof value === 'object') return 'object';
  return null;
}

// Array filter functions
function applyArrayFilter(fieldName) {
  const fieldId = sanitizeId(fieldName);
  const filterType = document.querySelector(`input[name="filter-type-${fieldId}"]:checked`)?.value;
  
  if (!filterType) {
    showToast('Please select a filter type', 'warning');
    return;
  }
  
  if (filterType === 'empty') {
    arrayFilters[fieldName] = { type: 'empty' };
  } else if (filterType === 'gte') {
    const valueInput = document.getElementById(`filter-value-${fieldId}`);
    if (!valueInput) {
      console.error('Value input not found for field:', fieldName);
      return;
    }
    const value = parseInt(valueInput.value);
    if (isNaN(value) || value < 0) {
      showToast('Please enter a valid number (>= 0)', 'warning');
      return;
    }
    arrayFilters[fieldName] = { type: 'gte', value: value };
  }
  
  // Close dropdown
  const dropdown = document.getElementById(`filter-dropdown-${fieldId}`);
  if (dropdown) {
    dropdown.classList.remove('show');
    dropdown.style.display = 'none';
  }
  
  // Update URL with new filter state
  updateUrlParams();
  
  // Reload documents with new filter
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  loadDocuments(currentDbName, currentCollectionName);
}

function clearArrayFilter(fieldName) {
  delete arrayFilters[fieldName];
  
  // Close dropdown
  const fieldId = sanitizeId(fieldName);
  const dropdown = document.getElementById(`filter-dropdown-${fieldId}`);
  if (dropdown) {
    dropdown.classList.remove('show');
    dropdown.style.display = 'none';
  }
  
  // Update URL with new filter state
  updateUrlParams();
  
  // Reload documents without filter
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  loadDocuments(currentDbName, currentCollectionName);
}

// Functions are called via event listeners, but keep them globally available for debugging
window.applyArrayFilter = applyArrayFilter;
window.clearArrayFilter = clearArrayFilter;

// ─── Saved Queries & Query History ───────────────────────────────────────────

function savedQueriesKey(dbName, collectionName) {
  return `mongodb_dashboard_savedqueries_${dbName}_${collectionName}`;
}

function queryHistoryKey(dbName, collectionName) {
  return `mongodb_dashboard_queryhistory_${dbName}_${collectionName}`;
}

function getSavedQueries(dbName, collectionName) {
  try {
    return JSON.parse(localStorage.getItem(savedQueriesKey(dbName, collectionName)) || '[]');
  } catch {
    return [];
  }
}

function getQueryHistory(dbName, collectionName) {
  try {
    return JSON.parse(localStorage.getItem(queryHistoryKey(dbName, collectionName)) || '[]');
  } catch {
    return [];
  }
}

function saveQuery(dbName, collectionName, query) {
  const queries = getSavedQueries(dbName, collectionName);
  queries.unshift(query);
  localStorage.setItem(savedQueriesKey(dbName, collectionName), JSON.stringify(queries.slice(0, 20)));
}

function addToQueryHistory(dbName, collectionName, query) {
  const history = getQueryHistory(dbName, collectionName);
  // Avoid duplicates of exact same filter/sort/projection
  const sig = JSON.stringify({ f: query.filter, s: query.sort, p: query.projection });
  const existing = history.findIndex(h => JSON.stringify({ f: h.filter, s: h.sort, p: h.projection }) === sig);
  if (existing !== -1) history.splice(existing, 1);
  query.timestamp = Date.now();
  history.unshift(query);
  localStorage.setItem(queryHistoryKey(dbName, collectionName), JSON.stringify(history.slice(0, 50)));
}

function clearQueryHistory(dbName, collectionName) {
  localStorage.removeItem(queryHistoryKey(dbName, collectionName));
}

function deleteSavedQuery(dbName, collectionName, index) {
  const queries = getSavedQueries(dbName, collectionName);
  queries.splice(index, 1);
  localStorage.setItem(savedQueriesKey(dbName, collectionName), JSON.stringify(queries));
}

let queriesDropdownTab = 'saved';

function renderSavedQueriesDropdown(dbName, collectionName, dropdown) {
  const saved = getSavedQueries(dbName, collectionName);
  const history = getQueryHistory(dbName, collectionName);

  dropdown.innerHTML = `
    <div class="queries-dropdown-tabs">
      <button class="queries-tab ${queriesDropdownTab === 'saved' ? 'active' : ''}" data-tab="saved">Saved (${saved.length})</button>
      <button class="queries-tab ${queriesDropdownTab === 'history' ? 'active' : ''}" data-tab="history">History (${history.length})</button>
    </div>
    <div class="queries-dropdown-body">
      ${queriesDropdownTab === 'saved' ? renderSavedList(saved) : renderHistoryList(history)}
    </div>
  `;

  // Tab switching
  dropdown.querySelectorAll('.queries-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      queriesDropdownTab = tab.dataset.tab;
      renderSavedQueriesDropdown(dbName, collectionName, dropdown);
    });
  });

  // Clear history button
  dropdown.querySelector('.query-history-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearQueryHistory(dbName, collectionName);
    renderSavedQueriesDropdown(dbName, collectionName, dropdown);
  });

  // Item click handlers
  dropdown.querySelectorAll('.saved-query-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.saved-query-delete')) {
        e.stopPropagation();
        const idx = parseInt(e.target.closest('.saved-query-delete').dataset.index);
        if (queriesDropdownTab === 'saved') {
          deleteSavedQuery(dbName, collectionName, idx);
        } else {
          const hist = getQueryHistory(dbName, collectionName);
          hist.splice(idx, 1);
          localStorage.setItem(queryHistoryKey(dbName, collectionName), JSON.stringify(hist));
        }
        renderSavedQueriesDropdown(dbName, collectionName, dropdown);
        return;
      }
      const idx = parseInt(item.dataset.index);
      const q = queriesDropdownTab === 'saved' ? saved[idx] : history[idx];
      if (!q) return;
      applyQueryToBar(q);
      dropdown.style.display = 'none';
      runQuery(dbName, collectionName);
    });
  });
}

function renderSavedList(queries) {
  if (queries.length === 0) return '<div class="saved-queries-empty">No saved queries yet.</div>';
  return queries.map((q, i) => `
    <div class="saved-query-item" data-index="${i}">
      <div class="saved-query-info">
        <div class="saved-query-name">${escapeHtml(q.name)}</div>
        <div class="saved-query-preview">${escapeHtml(q.filter || '{}')}</div>
      </div>
      <button class="saved-query-delete" data-index="${i}" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');
}

function renderHistoryList(history) {
  if (history.length === 0) return '<div class="saved-queries-empty">No query history yet.</div>';
  let html = history.map((q, i) => {
    const timeAgo = formatTimeAgo(q.timestamp);
    return `
      <div class="saved-query-item" data-index="${i}">
        <div class="saved-query-info">
          <div class="saved-query-preview">${escapeHtml(q.filter || '{}')}</div>
          <div class="saved-query-time">${timeAgo}</div>
        </div>
        <button class="saved-query-delete" data-index="${i}" title="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
  }).join('');
  html += '<div class="query-history-clear-row"><button class="btn btn-sm btn-ghost query-history-clear">Clear History</button></div>';
  return html;
}

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function applyQueryToBar(q) {
  const queryFilterEl = document.getElementById('queryFilter');
  const queryProjectionEl = document.getElementById('queryProjection');
  const querySortEl = document.getElementById('querySort');
  const queryLimitEl = document.getElementById('queryLimit');
  const querySkipEl = document.getElementById('querySkip');
  if (queryFilterEl) queryFilterEl.value = q.filter || '';
  if (queryProjectionEl) queryProjectionEl.value = q.projection || '';
  if (querySortEl) querySortEl.value = q.sort || '';
  if (queryLimitEl) queryLimitEl.value = q.limit || 50;
  if (querySkipEl) querySkipEl.value = q.skip || 0;
}

// ─── Collection Stats ─────────────────────────────────────────────────────────

function initStatsPanel(dbName, collectionName) {
  document.getElementById('refreshStats')?.addEventListener('click', () => {
    loadCollectionStats(dbName, collectionName);
  });
}

async function loadCollectionStats(dbName, collectionName) {
  const container = document.getElementById('statsContent');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/stats`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const indexEntries = Object.entries(data.indexSizes || {});

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stats-card">
          <div class="stats-card-value">${formatCount(data.count)}</div>
          <div class="stats-card-label">Documents</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatBytes(data.size)}</div>
          <div class="stats-card-label">Data Size</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatBytes(data.avgObjSize)}</div>
          <div class="stats-card-label">Avg Document Size</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatBytes(data.storageSize)}</div>
          <div class="stats-card-label">Storage Size</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${data.nindexes}</div>
          <div class="stats-card-label">Indexes</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatBytes(data.totalIndexSize)}</div>
          <div class="stats-card-label">Total Index Size</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatBytes(data.freeStorageSize)}</div>
          <div class="stats-card-label">Free Storage</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${data.capped ? 'Yes' : 'No'}</div>
          <div class="stats-card-label">Capped Collection</div>
        </div>
      </div>
      ${indexEntries.length > 0 ? `
      <div style="margin-top:24px">
        <h3 style="font-size:14px;margin-bottom:12px;color:var(--text-primary)">Index Sizes</h3>
        <div class="stats-index-list">
          ${indexEntries.map(([name, size]) => `
            <div class="stats-index-row">
              <span class="stats-index-name">${escapeHtml(name)}</span>
              <div class="stats-index-bar-wrap">
                <div class="stats-index-bar" style="width:${Math.max(2, (size / data.totalIndexSize) * 100)}%"></div>
              </div>
              <span class="stats-index-size">${formatBytes(size)}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    `;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">Error: ${err.message}</div>`;
  }
}

// ─── Performance Page ─────────────────────────────────────────────────────────

function initPerformancePage() {
  let prevOpcounters = null;
  let prevTimestamp = null;
  let intervalId = null;
  let maxDelta = 1;

  const OPS = ['insert', 'query', 'update', 'delete', 'getmore', 'command'];

  async function fetchStats() {
    try {
      const res = await fetch('/api/server/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const now = Date.now();
      const ss = data;

      // Server info
      document.getElementById('perfServerInfo').textContent =
        `MongoDB ${ss.version || ''}  ·  Uptime: ${Math.floor((ss.uptime || 0) / 1000 / 60)} min`;

      // Stat cards
      document.getElementById('stat-conn-current').textContent = ss.connections?.current ?? '—';
      document.getElementById('stat-conn-available').textContent = ss.connections?.available ?? '—';
      document.getElementById('stat-mem-resident').textContent = ss.mem?.resident ? ss.mem.resident + ' MB' : '—';
      document.getElementById('stat-mem-virtual').textContent = ss.mem?.virtual ? ss.mem.virtual + ' MB' : '—';
      document.getElementById('stat-net-in').textContent = ss.network?.bytesIn ? formatBytes(ss.network.bytesIn) : '—';
      document.getElementById('stat-net-out').textContent = ss.network?.bytesOut ? formatBytes(ss.network.bytesOut) : '—';

      // Ops delta
      if (prevOpcounters && prevTimestamp) {
        const elapsedSec = (now - prevTimestamp) / 1000;
        const deltas = {};
        OPS.forEach(op => {
          const cur = ss.opcounters?.[op] || 0;
          const prev = prevOpcounters[op] || 0;
          deltas[op] = Math.max(0, Math.round((cur - prev) / elapsedSec));
        });

        maxDelta = Math.max(maxDelta, ...Object.values(deltas), 1);

        OPS.forEach(op => {
          const val = deltas[op];
          const pct = (val / maxDelta * 100).toFixed(1);
          const barEl = document.getElementById(`bar-${op}`);
          const valEl = document.getElementById(`val-${op}`);
          if (barEl) barEl.style.width = pct + '%';
          if (valEl) valEl.textContent = val + '/s';
        });
      }

      prevOpcounters = { ...ss.opcounters };
      prevTimestamp = now;
    } catch (err) {
      console.error('Performance stats error:', err);
    }
  }

  async function fetchCurrentOps() {
    const tbody = document.getElementById('currentOpsBody');
    if (!tbody) return;
    try {
      const res = await fetch('/api/server/currentop');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No active operations</td></tr>';
        return;
      }

      tbody.innerHTML = data.ops.map(op => `
        <tr>
          <td><span class="cell-value mono">${op.opid ?? '—'}</span></td>
          <td><span class="cell-value">${escapeHtml(op.op || '—')}</span></td>
          <td><span class="cell-value mono">${escapeHtml(op.ns || '—')}</span></td>
          <td><span class="cell-value">${op.secs_running ?? '—'}s</span></td>
          <td><span class="cell-value">${escapeHtml(op.client || '—')}</span></td>
          <td>
            <button class="action-btn delete" onclick="killOp(${op.opid})" title="Kill operation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:24px;text-align:center">Error: ${err.message}</td></tr>`;
    }
  }

  function startPolling(ms) {
    if (intervalId) clearInterval(intervalId);
    if (ms === 0) {
      document.getElementById('perfLiveIndicator').textContent = '⏸ PAUSED';
      document.getElementById('perfLiveIndicator').style.color = 'var(--text-muted)';
      return;
    }
    document.getElementById('perfLiveIndicator').textContent = '● LIVE';
    document.getElementById('perfLiveIndicator').style.color = 'var(--success)';
    fetchStats();
    intervalId = setInterval(fetchStats, ms);
  }

  document.getElementById('perfInterval')?.addEventListener('change', (e) => {
    startPolling(parseInt(e.target.value));
  });

  document.getElementById('refreshOps')?.addEventListener('click', fetchCurrentOps);

  startPolling(2000);
  fetchCurrentOps();
}

window.killOp = async function(opid) {
  if (!confirm(`Kill operation ${opid}?`)) return;
  try {
    const res = await fetch(`/api/server/currentop/${opid}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById('refreshOps')?.click();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ─── Schema Validation ───────────────────────────────────────────────────────

async function initValidationPanel(dbName, collectionName) {
  const panel = document.getElementById('panel-validation');
  if (!panel) return;

  // Load current validation rules when tab becomes visible
  panel._loaded = false;
  panel._load = async () => {
    if (panel._loaded) return;
    panel._loaded = true;

    // Initialize CodeMirror for validation editor
    const validatorEl = document.getElementById('validatorEditor');
    if (validatorEl && !cmEditors['validatorEditor']) {
      createJsonEditor('validatorEditor');
    }

    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/validation`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const levelEl = document.getElementById('validationLevel');
      const actionEl = document.getElementById('validationAction');
      if (levelEl) levelEl.value = data.validationLevel || 'strict';
      if (actionEl) actionEl.value = data.validationAction || 'error';
      setEditorValue('validatorEditor', data.validator ? JSON.stringify(data.validator, null, 2) : '');
      refreshEditor('validatorEditor');
    } catch (err) {
      const errEl = document.getElementById('validationError');
      if (errEl) { errEl.textContent = 'Failed to load validation rules: ' + err.message; errEl.style.display = 'block'; }
    }
  };

  // Save
  document.getElementById('saveValidation')?.addEventListener('click', async () => {
    const errEl = document.getElementById('validationError');
    const successEl = document.getElementById('validationSuccess');
    errEl.style.display = 'none';
    successEl.style.display = 'none';

    let validator = null;
    const validatorStr = getEditorValue('validatorEditor').trim();
    if (validatorStr) {
      try { validator = JSON.parse(validatorStr); }
      catch (e) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = 'block'; return; }
    }

    const btn = document.getElementById('saveValidation');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/validation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validator,
          validationLevel: document.getElementById('validationLevel')?.value || 'strict',
          validationAction: document.getElementById('validationAction')?.value || 'error',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      successEl.style.display = 'block';
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  });

  // Test validation
  document.getElementById('testValidation')?.addEventListener('click', async () => {
    const resultsEl = document.getElementById('validationTestResults');
    const errEl = document.getElementById('validationError');
    errEl.style.display = 'none';

    let validator;
    try { validator = JSON.parse(getEditorValue('validatorEditor').trim() || '{}'); }
    catch (e) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = 'block'; return; }

    resultsEl.innerHTML = '<div class="loading-spinner" style="display:inline-block;width:16px;height:16px;margin-right:8px"></div>Testing...';

    try {
      // Fetch 10 sample docs and test each against the $jsonSchema validator client-side
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}?limit=10`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const docs = data.documents;
      if (docs.length === 0) { resultsEl.textContent = 'No documents to test.'; return; }

      resultsEl.innerHTML = `<p style="color:var(--text-secondary);margin-bottom:8px">Sampled ${docs.length} documents — validation is enforced by MongoDB server, not client-side. Showing document _ids for reference:</p>` +
        docs.map(d => `<div style="font-family:monospace;font-size:12px;padding:3px 0;color:var(--accent)">${d._id?.$oid || d._id}</div>`).join('');
    } catch (err) {
      resultsEl.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
    }
  });
}

// ─── Explain Plan ────────────────────────────────────────────────────────────

function initExplainPlan(dbName, collectionName) {
  const explainBtn = document.getElementById('queryExplainBtn');
  const modal = document.getElementById('explainModal');
  if (!explainBtn || !modal) return;

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('explainModalClose')?.addEventListener('click', close);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', close);

  let showingRaw = false;
  document.getElementById('explainRawToggle')?.addEventListener('click', () => {
    showingRaw = !showingRaw;
    document.getElementById('explainTree').style.display = showingRaw ? 'none' : 'block';
    document.getElementById('explainSummary').style.display = showingRaw ? 'none' : 'block';
    document.getElementById('explainRaw').style.display = showingRaw ? 'block' : 'none';
    document.getElementById('explainRawToggle').textContent = showingRaw ? 'Visual' : 'Raw JSON';
  });

  explainBtn.addEventListener('click', async () => {
    const queryFilterEl = document.getElementById('queryFilter');
    const queryProjectionEl = document.getElementById('queryProjection');
    const querySortEl = document.getElementById('querySort');

    let filter = {}, sort = {}, projection = {};
    try { if (queryFilterEl?.value.trim()) filter = JSON.parse(queryFilterEl.value.trim()); } catch (e) {}
    try { if (querySortEl?.value.trim()) sort = JSON.parse(querySortEl.value.trim()); } catch (e) {}
    try { if (queryProjectionEl?.value.trim()) projection = JSON.parse(queryProjectionEl.value.trim()); } catch (e) {}

    document.getElementById('explainLoading').style.display = 'flex';
    document.getElementById('explainSummary').style.display = 'none';
    document.getElementById('explainTree').style.display = 'none';
    document.getElementById('explainRaw').style.display = 'none';
    showingRaw = false;
    document.getElementById('explainRawToggle').textContent = 'Raw JSON';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter, sort, projection }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      document.getElementById('explainLoading').style.display = 'none';
      renderExplainPlan(data.plan);
    } catch (err) {
      document.getElementById('explainLoading').style.display = 'none';
      document.getElementById('explainSummary').innerHTML = `<div style="color:var(--danger)">Error: ${err.message}</div>`;
      document.getElementById('explainSummary').style.display = 'block';
    }
  });
}

function renderExplainPlan(plan) {
  const execStats = plan.executionStats;
  const queryPlanner = plan.queryPlanner;
  const winningPlan = queryPlanner?.winningPlan;

  // Summary bar
  const summaryEl = document.getElementById('explainSummary');
  if (execStats) {
    const indexUsed = getIndexUsed(winningPlan) || 'COLLSCAN (no index)';
    const isCollscan = indexUsed.includes('COLLSCAN');
    summaryEl.innerHTML = `
      <div class="explain-stats">
        <div class="explain-stat">
          <div class="explain-stat-value">${execStats.executionTimeMillis ?? '—'}ms</div>
          <div class="explain-stat-label">Execution time</div>
        </div>
        <div class="explain-stat">
          <div class="explain-stat-value">${execStats.nReturned ?? '—'}</div>
          <div class="explain-stat-label">Docs returned</div>
        </div>
        <div class="explain-stat">
          <div class="explain-stat-value">${execStats.totalDocsExamined ?? '—'}</div>
          <div class="explain-stat-label">Docs examined</div>
        </div>
        <div class="explain-stat">
          <div class="explain-stat-value">${execStats.totalKeysExamined ?? '—'}</div>
          <div class="explain-stat-label">Keys examined</div>
        </div>
        <div class="explain-stat ${isCollscan ? 'explain-stat-warn' : 'explain-stat-ok'}">
          <div class="explain-stat-value" style="font-size:12px;word-break:break-all">${escapeHtml(indexUsed)}</div>
          <div class="explain-stat-label">Index used</div>
        </div>
      </div>`;
  } else {
    summaryEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Execution stats not available (run with executionStats verbosity).</p>';
  }
  summaryEl.style.display = 'block';

  // Visual plan tree
  const treeEl = document.getElementById('explainTree');
  if (winningPlan) {
    treeEl.innerHTML = '<div style="padding:16px 0;font-family:monospace">' + renderPlanStage(winningPlan, 0) + '</div>';
    treeEl.style.display = 'block';
  }

  // Raw JSON
  document.getElementById('explainRaw').innerHTML = renderJsonTree(plan);
}

function getIndexUsed(plan) {
  if (!plan) return null;
  if (plan.stage === 'IXSCAN') return plan.indexName || 'index';
  if (plan.stage === 'COLLSCAN') return 'COLLSCAN (no index)';
  if (plan.inputStage) return getIndexUsed(plan.inputStage);
  if (plan.inputStages) {
    for (const s of plan.inputStages) {
      const r = getIndexUsed(s);
      if (r) return r;
    }
  }
  return plan.stage || null;
}

const STAGE_COLORS = {
  COLLSCAN: '#f85149', IXSCAN: '#3fb950', FETCH: '#58a6ff',
  SORT: '#d29922', PROJECTION_SIMPLE: '#bc8cff', PROJECTION_DEFAULT: '#bc8cff',
  LIMIT: '#79c0ff', SKIP: '#79c0ff', OR: '#ff7b72', AND_HASH: '#ff7b72',
};

function renderPlanStage(stage, depth) {
  if (!stage) return '';
  const color = STAGE_COLORS[stage.stage] || '#8b949e';
  const indent = depth * 24;
  const details = [];
  if (stage.indexName) details.push(`index: ${stage.indexName}`);
  if (stage.filter) details.push(`filter: ${JSON.stringify(stage.filter).substring(0, 60)}`);
  if (stage.sortPattern) details.push(`sort: ${JSON.stringify(stage.sortPattern)}`);
  if (stage.limitAmount != null) details.push(`limit: ${stage.limitAmount}`);

  let children = '';
  if (stage.inputStage) children = renderPlanStage(stage.inputStage, depth + 1);
  if (stage.inputStages) children = stage.inputStages.map(s => renderPlanStage(s, depth + 1)).join('');

  return `
    <div style="margin-left:${indent}px;margin-bottom:6px">
      ${depth > 0 ? `<div style="margin-left:0;margin-bottom:4px;color:var(--text-muted);font-size:11px;padding-left:8px">↑</div>` : ''}
      <div class="explain-stage-node" style="border-color:${color}">
        <span class="explain-stage-name" style="color:${color}">${escapeHtml(stage.stage || 'UNKNOWN')}</span>
        ${details.length > 0 ? `<span class="explain-stage-detail">${details.map(escapeHtml).join(' · ')}</span>` : ''}
      </div>
    </div>
    ${children}`;
}

// ─── Collection Tabs ─────────────────────────────────────────────────────────

function initCollectionTabs(dbName, collectionName) {
  const tabs = document.querySelectorAll('.collection-tab');
  const panels = {
    documents: document.getElementById('panel-documents'),
    indexes: document.getElementById('panel-indexes'),
    schema: document.getElementById('panel-schema'),
    aggregation: document.getElementById('panel-aggregation'),
    validation: document.getElementById('panel-validation'),
    stats: document.getElementById('panel-stats'),
  };

  function switchTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    Object.entries(panels).forEach(([name, el]) => {
      if (!el) return;
      el.style.display = name === tabName ? 'flex' : 'none';
      el.style.flexDirection = 'column';
    });
    if (tabName === 'indexes') loadIndexes(dbName, collectionName);
    if (tabName === 'validation') {
      panels.validation?._load?.();
      refreshEditor('validatorEditor');
    }
    if (tabName === 'stats') loadCollectionStats(dbName, collectionName);
    if (tabName === 'aggregation') {
      // Refresh all agg stage CodeMirror instances
      Object.keys(cmEditors).forEach(key => {
        if (key.startsWith('agg-stage-')) cmEditors[key].refresh();
      });
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// ─── Schema Analysis ──────────────────────────────────────────────────────────

function initSchemaPanel(dbName, collectionName) {
  document.getElementById('runSchemaAnalysis')?.addEventListener('click', () => {
    const sampleSize = document.getElementById('schemaSampleSize').value || 500;
    runSchemaAnalysis(dbName, collectionName, sampleSize);
  });
}

async function runSchemaAnalysis(dbName, collectionName, sampleSize) {
  const contentEl = document.getElementById('schemaContent');
  const sampleInfo = document.getElementById('schemaSampleInfo');
  if (!contentEl) return;

  contentEl.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/schema-analysis?sampleSize=${sampleSize}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (sampleInfo) sampleInfo.textContent = `${data.totalDocs} documents sampled`;

    if (data.totalDocs === 0) {
      contentEl.innerHTML = '<div class="empty-state" style="height:auto;padding:60px 0"><h3>No documents</h3><p>Import some documents to analyze the schema.</p></div>';
      return;
    }

    const typeColors = {
      string: '#58a6ff', number: '#3fb950', boolean: '#ff7b72', date: '#d29922',
      objectId: '#bc8cff', array: '#79c0ff', object: '#8b949e', null: '#6e7681',
      decimal: '#3fb950', undefined: '#6e7681',
    };

    const fields = Object.entries(data.fields);

    contentEl.innerHTML = `
      <div class="schema-grid">
        ${fields.map(([fieldName, info]) => {
          const totalTyped = Object.values(info.types).reduce((a, b) => a + b, 0);
          const presencePct = Math.round(info.presence * 100);

          const typeBar = Object.entries(info.types)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
              const pct = (count / totalTyped * 100).toFixed(1);
              const color = typeColors[type] || '#8b949e';
              return `<div class="type-bar-segment" style="width:${pct}%;background:${color}" title="${type}: ${pct}%"></div>`;
            }).join('');

          const typeLegend = Object.entries(info.types)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
              const color = typeColors[type] || '#8b949e';
              const pct = (count / totalTyped * 100).toFixed(0);
              return `<span class="type-legend-item"><span class="type-dot" style="background:${color}"></span>${type} ${pct}%</span>`;
            }).join('');

          let extra = '';

          // Top values chart for strings
          if (info.topValues && info.topValues.length > 0) {
            const maxCount = info.topValues[0].count;
            extra += `
              <div class="schema-section">
                <div class="schema-section-label">Top values${info.uniqueCount ? ` (${formatCount(info.uniqueCount)} unique)` : ''}</div>
                ${info.topValues.map(tv => {
                  const pct = (tv.count / maxCount * 100).toFixed(0);
                  return `<div class="value-bar-row">
                    <span class="value-bar-label" title="${escapeHtml(String(tv.value))}">${escapeHtml(String(tv.value).substring(0, 30))}</span>
                    <div class="value-bar-track"><div class="value-bar-fill" style="width:${pct}%"></div></div>
                    <span class="value-bar-count">${tv.count}</span>
                  </div>`;
                }).join('')}
              </div>`;
          }

          // Histogram for numbers
          if (info.histogram && info.histogram.length > 0) {
            const maxBucketCount = Math.max(...info.histogram.map(b => b.count));
            extra += `
              <div class="schema-section">
                <div class="schema-section-label">Distribution &nbsp;<small>min ${info.min} · avg ${info.mean} · max ${info.max}</small></div>
                <div class="histogram">
                  ${info.histogram.map(bucket => {
                    const pct = maxBucketCount > 0 ? (bucket.count / maxBucketCount * 100).toFixed(0) : 0;
                    return `<div class="histogram-bar" title="${bucket.min}–${bucket.max}: ${bucket.count}">
                      <div class="histogram-fill" style="height:${pct}%"></div>
                      <div class="histogram-label">${bucket.min}</div>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
          }

          return `
            <div class="schema-field-card">
              <div class="schema-field-header">
                <span class="schema-field-name">${escapeHtml(fieldName)}</span>
                <span class="schema-field-presence" title="Field presence">${presencePct}%</span>
              </div>
              <div class="type-bar">${typeBar}</div>
              <div class="type-legend">${typeLegend}</div>
              ${extra}
            </div>`;
        }).join('')}
      </div>`;

  } catch (err) {
    contentEl.innerHTML = `<div style="color:var(--danger);padding:24px">Error: ${err.message}</div>`;
  }
}

// ─── Indexes ─────────────────────────────────────────────────────────────────

async function loadIndexes(dbName, collectionName) {
  const tbody = document.getElementById('indexTableBody');
  const countEl = document.getElementById('indexCount');
  if (!tbody) return;

  tbody.innerHTML = '<tr class="loading-row"><td colspan="5"><div class="loading-spinner"></div></td></tr>';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/indexes`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const indexes = data.indexes;
    if (countEl) countEl.textContent = `${indexes.length} index${indexes.length !== 1 ? 'es' : ''}`;

    tbody.innerHTML = indexes.map(idx => {
      const keyStr = Object.entries(idx.key).map(([k, v]) => `${k}: ${v}`).join(', ');
      const props = [
        idx.unique ? '<span class="index-badge">unique</span>' : '',
        idx.sparse ? '<span class="index-badge">sparse</span>' : '',
        idx.hidden ? '<span class="index-badge index-badge-warn">hidden</span>' : '',
        idx.expireAfterSeconds != null ? `<span class="index-badge">TTL ${idx.expireAfterSeconds}s</span>` : '',
      ].filter(Boolean).join(' ');
      const size = idx.sizeBytes != null ? formatBytes(idx.sizeBytes) : '—';
      const canDrop = idx.name !== '_id_';
      return `
        <tr>
          <td><span class="cell-value">${escapeHtml(idx.name)}</span></td>
          <td><span class="cell-value mono">${escapeHtml(keyStr)}</span></td>
          <td>${props || '<span class="cell-muted">—</span>'}</td>
          <td><span class="cell-value">${size}</span></td>
          <td>
            <div class="cell-actions">
              ${canDrop ? `
              <button class="action-btn" title="${idx.hidden ? 'Unhide' : 'Hide'}" onclick="toggleIndexHidden('${encodeURIComponent(dbName)}','${encodeURIComponent(collectionName)}','${encodeURIComponent(idx.name)}',${!idx.hidden})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${idx.hidden
                    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>'}
                </svg>
              </button>
              <button class="action-btn delete" title="Drop" onclick="openDropIndexModal('${encodeURIComponent(dbName)}','${encodeURIComponent(collectionName)}','${encodeURIComponent(idx.name)}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>` : '<span class="cell-muted">system</span>'}
            </div>
          </td>
        </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function initIndexesPanel(dbName, collectionName) {
  document.getElementById('refreshIndexesBtn')?.addEventListener('click', () => loadIndexes(dbName, collectionName));

  // Create index modal
  const createModal = document.getElementById('createIndexModal');
  const closeCreate = () => {
    createModal.style.display = 'none';
    document.getElementById('createIndexError').style.display = 'none';
  };
  document.getElementById('createIndexBtn')?.addEventListener('click', () => { createModal.style.display = 'flex'; document.getElementById('indexKey').focus(); });
  document.getElementById('createIndexModalClose')?.addEventListener('click', closeCreate);
  document.getElementById('createIndexCancel')?.addEventListener('click', closeCreate);
  createModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeCreate);

  document.getElementById('createIndexConfirm')?.addEventListener('click', async () => {
    const keyStr = document.getElementById('indexKey').value.trim();
    const errEl = document.getElementById('createIndexError');
    if (!keyStr) { errEl.textContent = 'Index key is required'; errEl.style.display = 'block'; return; }

    let key;
    try { key = JSON.parse(keyStr); } catch (e) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = 'block'; return; }

    const options = {};
    if (document.getElementById('indexUnique').checked) options.unique = true;
    if (document.getElementById('indexSparse').checked) options.sparse = true;
    const ttl = parseInt(document.getElementById('indexTTL').value);
    if (!isNaN(ttl) && ttl >= 0) options.expireAfterSeconds = ttl;
    const name = document.getElementById('indexName').value.trim();
    if (name) options.name = name;

    const btn = document.getElementById('createIndexConfirm');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/indexes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, options }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      closeCreate();
      loadIndexes(dbName, collectionName);
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Create Index';
    }
  });

  // Drop index modal
  const dropModal = document.getElementById('dropIndexModal');
  const closeDropIdx = () => { dropModal.style.display = 'none'; };
  document.getElementById('dropIndexModalClose')?.addEventListener('click', closeDropIdx);
  document.getElementById('dropIndexCancel')?.addEventListener('click', closeDropIdx);
  dropModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDropIdx);
}

window.openDropIndexModal = function(dbName, collectionName, indexName) {
  document.getElementById('dropIndexName').textContent = decodeURIComponent(indexName);
  document.getElementById('dropIndexError').style.display = 'none';
  document.getElementById('dropIndexModal').style.display = 'flex';

  document.getElementById('dropIndexConfirm').onclick = async () => {
    const btn = document.getElementById('dropIndexConfirm');
    const errEl = document.getElementById('dropIndexError');
    btn.disabled = true; btn.textContent = 'Dropping...';
    try {
      const res = await fetch(`/api/${decodeURIComponent(dbName)}/${decodeURIComponent(collectionName)}/indexes/${decodeURIComponent(indexName)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      document.getElementById('dropIndexModal').style.display = 'none';
      loadIndexes(decodeURIComponent(dbName), decodeURIComponent(collectionName));
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Drop';
    }
  };
};

window.toggleIndexHidden = async function(dbName, collectionName, indexName, hidden) {
  try {
    const res = await fetch(`/api/${decodeURIComponent(dbName)}/${decodeURIComponent(collectionName)}/indexes/${decodeURIComponent(indexName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadIndexes(decodeURIComponent(dbName), decodeURIComponent(collectionName));
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ─── Aggregation Pipeline Builder ────────────────────────────────────────────

const AGG_STAGE_TEMPLATES = {
  '$match':      '{\n  "field": "value"\n}',
  '$group':      '{\n  "_id": "$field",\n  "count": { "$sum": 1 }\n}',
  '$project':    '{\n  "field": 1,\n  "_id": 0\n}',
  '$sort':       '{\n  "field": -1\n}',
  '$limit':      '20',
  '$skip':       '0',
  '$unwind':     '"$arrayField"',
  '$addFields':  '{\n  "newField": "$existingField"\n}',
  '$replaceRoot':'{\n  "newRoot": "$embeddedDoc"\n}',
  '$count':      '"total"',
  '$lookup': '{\n  "from": "other_collection",\n  "localField": "_id",\n  "foreignField": "ref_id",\n  "as": "joined"\n}',
  '$facet': '{\n  "byStatus": [{ "$group": { "_id": "$status", "count": { "$sum": 1 } } }]\n}',
  '$bucket': '{\n  "groupBy": "$field",\n  "boundaries": [0, 10, 50, 100],\n  "default": "Other",\n  "output": { "count": { "$sum": 1 } }\n}',
  '$out':        '"output_collection"',
  '$merge':      '{\n  "into": "output_collection",\n  "whenMatched": "replace",\n  "whenNotMatched": "insert"\n}',
};

const STAGE_TYPES = Object.keys(AGG_STAGE_TEMPLATES);

let aggStages = []; // [{ id, type, body, enabled }]
let aggIdCounter = 0;

function aggStageKey(dbName, collectionName) {
  return `mongodb_dashboard_pipelines_${dbName}_${collectionName}`;
}

function getSavedPipelines(dbName, collectionName) {
  try { return JSON.parse(localStorage.getItem(aggStageKey(dbName, collectionName)) || '[]'); }
  catch { return []; }
}

function initAggregationPanel(dbName, collectionName) {
  aggStages = [];
  aggIdCounter = 0;
  renderAggStages(dbName, collectionName);

  document.getElementById('aggAddStage')?.addEventListener('click', () => {
    addAggStage(dbName, collectionName);
  });

  document.getElementById('aggRun')?.addEventListener('click', () => {
    runAggregation(dbName, collectionName);
  });

  // Save pipeline
  document.getElementById('aggSave')?.addEventListener('click', () => {
    if (aggStages.length === 0) { showToast('Add at least one stage to save.', 'warning'); return; }
    const name = prompt('Name for this pipeline:');
    if (!name) return;
    const pipelines = getSavedPipelines(dbName, collectionName);
    pipelines.unshift({ name, stages: JSON.parse(JSON.stringify(aggStages)) });
    localStorage.setItem(aggStageKey(dbName, collectionName), JSON.stringify(pipelines.slice(0, 20)));
  });

  // Saved pipelines dropdown
  const savedBtn = document.getElementById('aggSavedBtn');
  const savedDropdown = document.getElementById('aggSavedDropdown');
  if (savedBtn && savedDropdown) {
    savedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = savedDropdown.style.display !== 'none';
      savedDropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderAggSavedDropdown(dbName, collectionName, savedDropdown);
    });
    document.addEventListener('click', () => { savedDropdown.style.display = 'none'; });
  }

  // Export dropdown
  const exportBtn = document.getElementById('aggExportBtn');
  const exportDropdown = document.getElementById('aggExportDropdown');
  if (exportBtn && exportDropdown) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.style.display = exportDropdown.style.display === 'none' ? 'block' : 'none';
    });
    exportDropdown.querySelectorAll('.saved-query-item').forEach(item => {
      item.addEventListener('click', () => {
        exportDropdown.style.display = 'none';
        exportPipeline(dbName, collectionName, item.dataset.lang);
      });
    });
    document.addEventListener('click', () => { exportDropdown.style.display = 'none'; });
  }

  // Export modal close
  const closeExportModal = () => { document.getElementById('aggExportModal').style.display = 'none'; };
  document.getElementById('aggExportModalClose')?.addEventListener('click', closeExportModal);
  document.getElementById('aggExportModalClose2')?.addEventListener('click', closeExportModal);
  document.getElementById('aggExportModal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeExportModal);
  document.getElementById('aggExportCopy')?.addEventListener('click', () => {
    const code = getEditorValue('aggExportCode');
    navigator.clipboard.writeText(code)
      .then(() => showToast('Copied to clipboard', 'success', 2000))
      .catch(() => showToast('Failed to copy to clipboard', 'error'));
  });
}

function addAggStage(dbName, collectionName, type = '$match', body = null) {
  const id = ++aggIdCounter;
  const stageType = type;
  const stageBody = body ?? (AGG_STAGE_TEMPLATES[stageType] || '{}');
  aggStages.push({ id, type: stageType, body: stageBody, enabled: true });
  renderAggStages(dbName, collectionName);
}

function renderAggStages(dbName, collectionName) {
  const list = document.getElementById('aggStageList');
  if (!list) return;

  // Clean up old CodeMirror instances for agg stages
  Object.keys(cmEditors).forEach(key => {
    if (key.startsWith('agg-stage-')) {
      cmEditors[key].toTextArea();
      delete cmEditors[key];
    }
  });

  if (aggStages.length === 0) {
    list.innerHTML = '<div class="agg-empty-state"><p>No stages yet. Click <strong>Add Stage</strong> to begin.</p></div>';
    return;
  }

  list.innerHTML = aggStages.map((stage, idx) => `
    <div class="agg-stage-card ${stage.enabled ? '' : 'disabled'}" data-id="${stage.id}">
      <div class="agg-stage-header">
        <span class="agg-stage-num">#${idx + 1}</span>
        <select class="agg-stage-type" data-id="${stage.id}">
          ${STAGE_TYPES.map(t => `<option value="${t}" ${t === stage.type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div class="agg-stage-actions">
          <button class="agg-stage-btn" title="Move up" data-action="up" data-id="${stage.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button class="agg-stage-btn" title="Move down" data-action="down" data-id="${stage.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button class="agg-stage-btn" title="${stage.enabled ? 'Disable' : 'Enable'}" data-action="toggle" data-id="${stage.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${stage.enabled
                ? '<path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'}
            </svg>
          </button>
          <button class="agg-stage-btn danger" title="Delete" data-action="delete" data-id="${stage.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="agg-stage-editor-wrap">
        <textarea class="agg-stage-editor" data-id="${stage.id}" spellcheck="false">${escapeHtml(stage.body)}</textarea>
      </div>
      <div class="agg-stage-error" id="stage-err-${stage.id}"></div>
      <div class="agg-stage-preview-bar">
        <button class="btn btn-sm btn-ghost agg-preview-btn" data-action="preview" data-id="${stage.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Preview output
        </button>
        <span class="agg-preview-count" id="stage-count-${stage.id}"></span>
      </div>
      <div class="agg-stage-preview" id="stage-preview-${stage.id}" style="display:none"></div>
    </div>
  `).join('');

  // Wire up event handlers
  list.querySelectorAll('.agg-stage-type').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const stage = aggStages.find(s => s.id === id);
      if (stage) {
        stage.type = e.target.value;
        stage.body = AGG_STAGE_TEMPLATES[e.target.value] || '{}';
        renderAggStages(dbName, collectionName);
      }
    });
  });

  // Initialize CodeMirror for each aggregation stage editor
  list.querySelectorAll('.agg-stage-editor').forEach(ta => {
    const stageId = ta.dataset.id;
    if (window.CodeMirror) {
      const cm = CodeMirror.fromTextArea(ta, {
        mode: { name: 'javascript', json: true },
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: true,
        viewportMargin: Infinity,
        extraKeys: {
          'Tab': (cm) => cm.execCommand('indentMore'),
          'Shift-Tab': (cm) => cm.execCommand('indentLess'),
        },
      });
      cm.on('change', () => {
        const id = parseInt(stageId);
        const stage = aggStages.find(s => s.id === id);
        if (stage) stage.body = cm.getValue();
      });
      // Store reference for cleanup
      const editorKey = `agg-stage-${stageId}`;
      cmEditors[editorKey] = cm;
    } else {
      ta.addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id);
        const stage = aggStages.find(s => s.id === id);
        if (stage) stage.body = e.target.value;
      });
    }
  });

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);

      if (action === 'preview') {
        previewStage(id, dbName, collectionName);
        return;
      }

      const idx = aggStages.findIndex(s => s.id === id);
      if (idx === -1) return;

      if (action === 'delete') {
        aggStages.splice(idx, 1);
      } else if (action === 'up' && idx > 0) {
        [aggStages[idx - 1], aggStages[idx]] = [aggStages[idx], aggStages[idx - 1]];
      } else if (action === 'down' && idx < aggStages.length - 1) {
        [aggStages[idx], aggStages[idx + 1]] = [aggStages[idx + 1], aggStages[idx]];
      } else if (action === 'toggle') {
        aggStages[idx].enabled = !aggStages[idx].enabled;
      }
      renderAggStages(dbName, collectionName);
    });
  });
}

async function runAggregation(dbName, collectionName) {
  const resultBody = document.getElementById('aggResultBody');
  const countEl = document.getElementById('aggResultCount');
  const limit = parseInt(document.getElementById('aggPreviewLimit')?.value) || 20;

  if (!resultBody) return;

  // Validate and build pipeline
  const pipeline = [];
  let hasError = false;
  for (const stage of aggStages) {
    if (!stage.enabled) continue;
    const errEl = document.getElementById(`stage-err-${stage.id}`);
    try {
      const stageBody = JSON.parse(stage.body);
      pipeline.push({ [stage.type]: stageBody });
      if (errEl) errEl.style.display = 'none';
    } catch (e) {
      if (errEl) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = 'block'; }
      hasError = true;
    }
  }
  if (hasError) return;

  resultBody.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  if (countEl) countEl.textContent = 'Running...';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline, options: { limit } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (countEl) countEl.textContent = `${data.count} document${data.count !== 1 ? 's' : ''}`;

    if (data.documents.length === 0) {
      resultBody.innerHTML = '<div class="agg-result-placeholder">No results</div>';
      return;
    }

    resultBody.innerHTML = data.documents.map(doc =>
      `<div class="agg-result-doc json-viewer">${renderJsonTree(doc)}</div>`
    ).join('');

  } catch (err) {
    resultBody.innerHTML = `<div style="color:var(--danger);padding:24px">Error: ${err.message}</div>`;
    if (countEl) countEl.textContent = 'Error';
  }
}

async function previewStage(stageId, dbName, collectionName) {
  const previewEl = document.getElementById(`stage-preview-${stageId}`);
  const countEl = document.getElementById(`stage-count-${stageId}`);
  if (!previewEl) return;

  // Toggle: if already visible, hide it
  if (previewEl.style.display !== 'none') {
    previewEl.style.display = 'none';
    if (countEl) countEl.textContent = '';
    return;
  }

  // Build pipeline up to and including this stage
  const pipeline = [];
  for (const stage of aggStages) {
    if (!stage.enabled) continue;
    try {
      pipeline.push({ [stage.type]: JSON.parse(stage.body) });
    } catch (e) {
      if (stage.id === stageId) {
        previewEl.innerHTML = `<div style="color:var(--danger);padding:8px">Invalid JSON in this stage</div>`;
        previewEl.style.display = 'block';
        return;
      }
    }
    if (stage.id === stageId) break;
  }

  previewEl.innerHTML = '<div style="display:flex;justify-content:center;padding:16px"><div class="loading-spinner"></div></div>';
  previewEl.style.display = 'block';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline, options: { limit: 5 } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (countEl) countEl.textContent = `${data.count} doc${data.count !== 1 ? 's' : ''}`;

    if (data.documents.length === 0) {
      previewEl.innerHTML = '<div class="agg-preview-empty">No output</div>';
    } else {
      previewEl.innerHTML = data.documents.map(doc =>
        `<div class="agg-preview-doc json-viewer">${renderJsonTree(doc)}</div>`
      ).join('');
    }
  } catch (err) {
    previewEl.innerHTML = `<div style="color:var(--danger);padding:8px;font-size:12px">${escapeHtml(err.message)}</div>`;
    if (countEl) countEl.textContent = '';
  }
}

function renderAggSavedDropdown(dbName, collectionName, dropdown) {
  const pipelines = getSavedPipelines(dbName, collectionName);
  if (pipelines.length === 0) {
    dropdown.innerHTML = '<div class="saved-queries-empty">No saved pipelines.</div>';
    return;
  }
  dropdown.innerHTML = pipelines.map((p, i) => `
    <div class="saved-query-item" data-idx="${i}">
      <div class="saved-query-info">
        <div class="saved-query-name">${escapeHtml(p.name)}</div>
        <div class="saved-query-preview">${p.stages.length} stage${p.stages.length !== 1 ? 's' : ''}</div>
      </div>
      <button class="saved-query-delete" data-idx="${i}" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `).join('');

  dropdown.querySelectorAll('.saved-query-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.saved-query-delete')) {
        const idx = parseInt(e.target.closest('.saved-query-delete').dataset.idx);
        pipelines.splice(idx, 1);
        localStorage.setItem(aggStageKey(dbName, collectionName), JSON.stringify(pipelines));
        renderAggSavedDropdown(dbName, collectionName, dropdown);
        return;
      }
      const idx = parseInt(item.dataset.idx);
      const p = pipelines[idx];
      aggStages = p.stages.map(s => ({ ...s, id: ++aggIdCounter }));
      renderAggStages(dbName, collectionName);
      dropdown.style.display = 'none';
    });
  });
}

function exportPipeline(dbName, collectionName, lang) {
  const pipeline = [];
  for (const stage of aggStages) {
    if (!stage.enabled) continue;
    try {
      pipeline.push({ [stage.type]: JSON.parse(stage.body) });
    } catch (e) { /* skip invalid */ }
  }

  let code = '';
  if (lang === 'js') {
    code = `// MongoDB Aggregation Pipeline\n// Database: ${dbName}, Collection: ${collectionName}\n\ndb.getCollection('${collectionName}').aggregate([\n${pipeline.map(s => '  ' + JSON.stringify(s, null, 2).split('\n').join('\n  ')).join(',\n')}\n]);`;
  } else if (lang === 'python') {
    const pipeStr = JSON.stringify(pipeline, null, 2).split('\n').join('\n  ');
    code = `# MongoDB Aggregation Pipeline\n# Database: ${dbName}, Collection: ${collectionName}\n\nfrom pymongo import MongoClient\n\nclient = MongoClient("mongodb://localhost:27017/")\ndb = client["${dbName}"]\ncollection = db["${collectionName}"]\n\npipeline = ${pipeStr}\n\nresults = list(collection.aggregate(pipeline))\nfor doc in results:\n    print(doc)`;
  }

  document.getElementById('aggExportTitle').textContent = lang === 'js' ? 'Export — JavaScript (mongosh)' : 'Export — Python (pymongo)';

  // Initialize CodeMirror for export code if not yet created
  const exportEl = document.getElementById('aggExportCode');
  if (exportEl && !cmEditors['aggExportCode']) {
    createJsonEditor('aggExportCode', { readOnly: true, mode: 'javascript' });
  }
  setEditorValue('aggExportCode', code);
  document.getElementById('aggExportModal').style.display = 'flex';
  refreshEditor('aggExportCode');
}

// ─── Import / Export ─────────────────────────────────────────────────────────

function initImportExport(dbName, collectionName) {
  // ── Export ──────────────────────────────────────────────────────────────
  const exportBtn = document.getElementById('exportBtn');
  const exportModal = document.getElementById('exportModal');
  if (exportBtn && exportModal) {
    const closeExport = () => { exportModal.style.display = 'none'; };
    exportBtn.addEventListener('click', () => { exportModal.style.display = 'flex'; });
    document.getElementById('exportModalClose')?.addEventListener('click', closeExport);
    document.getElementById('exportCancel')?.addEventListener('click', closeExport);
    exportModal.querySelector('.modal-backdrop')?.addEventListener('click', closeExport);

    document.getElementById('exportConfirm')?.addEventListener('click', () => {
      const format = document.getElementById('exportFormat').value;
      const limit = document.getElementById('exportLimit').value || 10000;
      const params = new URLSearchParams({ format, limit });
      if (currentFilter) params.set('filter', currentFilter);
      if (currentSort) params.set('sort', currentSort);
      window.location.href = `/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/export?${params}`;
      closeExport();
    });
  }

  // ── Import ──────────────────────────────────────────────────────────────
  const importBtn = document.getElementById('importBtn');
  const importModal = document.getElementById('importModal');
  if (!importBtn || !importModal) return;

  let importContent = null;

  const closeImport = () => {
    importModal.style.display = 'none';
    document.getElementById('importError').style.display = 'none';
    document.getElementById('importResult').style.display = 'none';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('importFile').value = '';
    document.getElementById('importConfirm').disabled = true;
    importContent = null;
  };

  importBtn.addEventListener('click', () => { importModal.style.display = 'flex'; });
  document.getElementById('importModalClose')?.addEventListener('click', closeImport);
  document.getElementById('importCancel')?.addEventListener('click', closeImport);
  importModal.querySelector('.modal-backdrop')?.addEventListener('click', closeImport);

  document.getElementById('importFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Auto-detect format
    if (file.name.endsWith('.csv')) {
      document.getElementById('importFormat').value = 'csv';
    } else {
      document.getElementById('importFormat').value = 'json';
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      importContent = ev.target.result;
      const preview = document.getElementById('importPreview');
      preview.textContent = importContent.substring(0, 500) + (importContent.length > 500 ? '...' : '');
      preview.style.display = 'block';
      document.getElementById('importConfirm').disabled = false;
    };
    reader.readAsText(file);
  });

  document.getElementById('importConfirm')?.addEventListener('click', async () => {
    if (!importContent) return;
    const format = document.getElementById('importFormat').value;
    const stopOnError = document.getElementById('importStopOnError').checked;
    const errEl = document.getElementById('importError');
    const resultEl = document.getElementById('importResult');
    const btn = document.getElementById('importConfirm');

    errEl.style.display = 'none';
    resultEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, content: importContent, stopOnError }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      resultEl.textContent = `Imported ${data.inserted} of ${data.total} documents.${data.errors.length > 0 ? ` ${data.errors.length} error(s): ${data.errors[0]}` : ''}`;
      resultEl.style.display = 'block';

      // Refresh table
      currentCursor = null;
      currentNextSkip = null;
      allDocuments = [];
      loadDocuments(dbName, collectionName);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import';
    }
  });
}

// ─── Database & Collection Management ────────────────────────────────────────

function initDatabasesPage() {
  const createDbBtn = document.getElementById('createDbBtn');
  const createDbModal = document.getElementById('createDbModal');
  const dropDbModal = document.getElementById('dropDbModal');

  if (!createDbModal) return;

  const closeCreate = () => {
    createDbModal.style.display = 'none';
    document.getElementById('createDbError').style.display = 'none';
    document.getElementById('newDbName').value = '';
    document.getElementById('newDbCollection').value = '';
  };

  createDbBtn?.addEventListener('click', () => { createDbModal.style.display = 'flex'; document.getElementById('newDbName').focus(); });
  document.getElementById('createDbModalClose')?.addEventListener('click', closeCreate);
  document.getElementById('createDbCancel')?.addEventListener('click', closeCreate);
  createDbModal.querySelector('.modal-backdrop')?.addEventListener('click', closeCreate);

  document.getElementById('createDbConfirm')?.addEventListener('click', async () => {
    const name = document.getElementById('newDbName').value.trim();
    const initialCollection = document.getElementById('newDbCollection').value.trim() || '_init';
    const errEl = document.getElementById('createDbError');
    if (!name) { errEl.textContent = 'Database name is required'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('createDbConfirm');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, initialCollection }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/browse/${name}`;
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Create';
    }
  });

  // Drop database buttons
  let dropTarget = null;
  document.querySelectorAll('.db-drop-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropTarget = btn.dataset.db;
      document.getElementById('dropDbName').textContent = dropTarget;
      document.getElementById('dropDbError').style.display = 'none';
      dropDbModal.style.display = 'flex';
    });
  });

  const closeDropDb = () => { dropDbModal.style.display = 'none'; dropTarget = null; };
  document.getElementById('dropDbModalClose')?.addEventListener('click', closeDropDb);
  document.getElementById('dropDbCancel')?.addEventListener('click', closeDropDb);
  dropDbModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDropDb);

  document.getElementById('dropDbConfirm')?.addEventListener('click', async () => {
    if (!dropTarget) return;
    const btn = document.getElementById('dropDbConfirm');
    const errEl = document.getElementById('dropDbError');
    btn.disabled = true; btn.textContent = 'Dropping...';
    try {
      const res = await fetch(`/api/databases/${encodeURIComponent(dropTarget)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.reload();
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Drop Database';
    }
  });
}

function initCollectionManagement(dbName) {
  const createColBtn = document.getElementById('createCollectionBtn');
  const createColModal = document.getElementById('createColModal');
  const dropColModal = document.getElementById('dropColModal');
  const renameColModal = document.getElementById('renameColModal');

  if (!createColModal) return;

  // Create collection
  const closeCreate = () => {
    createColModal.style.display = 'none';
    document.getElementById('createColError').style.display = 'none';
    document.getElementById('newColName').value = '';
  };

  createColBtn?.addEventListener('click', () => { createColModal.style.display = 'flex'; document.getElementById('newColName').focus(); });
  document.getElementById('createColModalClose')?.addEventListener('click', closeCreate);
  document.getElementById('createColCancel')?.addEventListener('click', closeCreate);
  createColModal.querySelector('.modal-backdrop')?.addEventListener('click', closeCreate);

  document.getElementById('createColConfirm')?.addEventListener('click', async () => {
    const name = document.getElementById('newColName').value.trim();
    const errEl = document.getElementById('createColError');
    if (!name) { errEl.textContent = 'Collection name is required'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('createColConfirm');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/browse/${encodeURIComponent(dbName)}/${encodeURIComponent(name)}`;
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Create';
    }
  });

  // Drop collection
  let dropColTarget = null;
  document.querySelectorAll('.col-drop-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropColTarget = btn.dataset.col;
      document.getElementById('dropColName').textContent = dropColTarget;
      document.getElementById('dropColError').style.display = 'none';
      dropColModal.style.display = 'flex';
    });
  });

  const closeDropCol = () => { dropColModal.style.display = 'none'; dropColTarget = null; };
  document.getElementById('dropColModalClose')?.addEventListener('click', closeDropCol);
  document.getElementById('dropColCancel')?.addEventListener('click', closeDropCol);
  dropColModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDropCol);

  document.getElementById('dropColConfirm')?.addEventListener('click', async () => {
    if (!dropColTarget) return;
    const btn = document.getElementById('dropColConfirm');
    const errEl = document.getElementById('dropColError');
    btn.disabled = true; btn.textContent = 'Dropping...';
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(dropColTarget)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/browse/${encodeURIComponent(dbName)}`;
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Drop';
    }
  });

  // Rename collection
  let renameColTarget = null;
  document.querySelectorAll('.col-rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      renameColTarget = btn.dataset.col;
      document.getElementById('renameColNewName').value = renameColTarget;
      document.getElementById('renameColError').style.display = 'none';
      renameColModal.style.display = 'flex';
      document.getElementById('renameColNewName').focus();
      document.getElementById('renameColNewName').select();
    });
  });

  const closeRename = () => { renameColModal.style.display = 'none'; renameColTarget = null; };
  document.getElementById('renameColModalClose')?.addEventListener('click', closeRename);
  document.getElementById('renameColCancel')?.addEventListener('click', closeRename);
  renameColModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeRename);

  document.getElementById('renameColConfirm')?.addEventListener('click', async () => {
    if (!renameColTarget) return;
    const newName = document.getElementById('renameColNewName').value.trim();
    const errEl = document.getElementById('renameColError');
    if (!newName) { errEl.textContent = 'New name is required'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('renameColConfirm');
    btn.disabled = true; btn.textContent = 'Renaming...';
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/collections/${encodeURIComponent(renameColTarget)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = `/browse/${encodeURIComponent(dbName)}/${encodeURIComponent(newName)}`;
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Rename';
    }
  });
}

// Global disconnect handler
document.getElementById('disconnectBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/disconnect', { method: 'POST' });
    setActiveConnection(null); // Clear active connection
    window.location.href = '/';
  } catch (err) {
    setActiveConnection(null); // Clear active connection
    window.location.href = '/';
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape to close modals
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
  }
});

// Global initialization - check connection status on all pages except connect page and browser pages
async function initGlobalConnectionCheck() {
  // Skip on connect page (it handles its own reconnection)
  if (window.location.pathname === '/' || window.location.pathname === '/connect') {
    return;
  }

  // Skip on browser pages - initBrowser handles connection check now
  if (window.location.pathname.startsWith('/browse/')) {
    return;
  }

  try {
    const status = await checkConnectionStatus();
    if (!status.connected) {
      // Try to auto-reconnect
      const reconnected = await autoReconnect();
      if (reconnected) {
        // Successfully reconnected, reload the page to stay on current page
        window.location.reload();
      } else {
        // Failed to reconnect, save current URL and redirect to connect page
        const currentUrl = window.location.pathname + window.location.search;
        sessionStorage.setItem('mongodb_dashboard_return_url', currentUrl);
        window.location.href = '/';
      }
    }
  } catch (err) {
    // On error, try to reconnect
    const reconnected = await autoReconnect();
    if (!reconnected) {
      // Save current URL before redirecting
      const currentUrl = window.location.pathname + window.location.search;
      sessionStorage.setItem('mongodb_dashboard_return_url', currentUrl);
      window.location.href = '/';
    }
  }
}

// Theme Management
function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeToggleUI(theme);
  
  // Update active option in dropdown if it exists
  document.querySelectorAll('.theme-option').forEach(option => {
    if (option.dataset.theme === theme) {
      option.classList.add('active');
    } else {
      option.classList.remove('active');
    }
  });
}

function updateThemeToggleUI(theme) {
  const btn = document.querySelector('.theme-toggle-btn');
  if (!btn) return;
  
  const icon = btn.querySelector('svg');
  const text = btn.querySelector('.theme-toggle-text');
  
  if (theme === 'light') {
    if (icon) {
      icon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>';
    }
    if (text) text.textContent = 'Light';
  } else if (theme === 'dark') {
    if (icon) {
      icon.innerHTML = '<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
    }
    if (text) text.textContent = 'Dark';
  } else {
    if (icon) {
      icon.innerHTML = '<path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>';
    }
    if (text) text.textContent = 'System';
  }
}

function initThemeToggle() {
  // Apply saved theme on load
  const savedTheme = getTheme();
  applyTheme(savedTheme);
  
  // Listen for system theme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  mediaQuery.addEventListener('change', () => {
    if (getTheme() === 'system') {
      applyTheme('system');
    }
  });
  
  // Setup dropdown toggle
  const toggleBtn = document.querySelector('.theme-toggle-btn');
  const dropdown = document.querySelector('.theme-dropdown');
  
  if (toggleBtn && dropdown) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-toggle')) {
        dropdown.classList.remove('show');
      }
    });
    
    // Handle theme option clicks
    document.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        setTheme(theme);
        dropdown.classList.remove('show');
      });
    });
  }
}

// Apply theme immediately to prevent flash
(function() {
  const savedTheme = getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

// Initialize theme on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
  initThemeToggle();
}

// Run global connection check when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalConnectionCheck);
} else {
  initGlobalConnectionCheck();
}
