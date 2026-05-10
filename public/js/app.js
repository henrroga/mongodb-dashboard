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

// ─── Copy-as-code: generate driver code for queries / aggregations ────────────

const CODE_LANGUAGES = [
  { id: 'mongosh', label: 'mongosh', mode: 'javascript' },
  { id: 'node',    label: 'Node.js (driver)', mode: 'javascript' },
  { id: 'python',  label: 'Python (pymongo)', mode: 'python' },
  { id: 'java',    label: 'Java (driver)', mode: 'java' },
  { id: 'go',      label: 'Go (mongo-go-driver)', mode: 'go' },
];

function safeParseJsonish(input, fallback = null) {
  if (!input || !input.trim()) return fallback;
  try { return JSON.parse(input); }
  catch (_) {}
  // Try MQL-style (unquoted keys, single quotes) via the same trick we use server-side.
  try {
    const normalized = input
      .replace(/'((?:\\.|[^'\\])*)'/g, (_m, body) => JSON.stringify(body))
      .replace(/([{,\s])([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
    return JSON.parse(normalized);
  } catch (e) {
    throw new Error('Could not parse: ' + e.message);
  }
}

function indentJson(value, indent = 2) {
  if (value === undefined || value === null) return '{}';
  return JSON.stringify(value, null, indent);
}

function pythonRepr(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = value.map((v) => pad + '    ' + pythonRepr(v, indent + 4)).join(',\n');
    return '[\n' + inner + '\n' + pad + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const inner = keys
      .map((k) => `${pad}    ${JSON.stringify(k)}: ${pythonRepr(value[k], indent + 4)}`)
      .join(',\n');
    return '{\n' + inner + '\n' + pad + '}';
  }
  return JSON.stringify(value);
}

function generateCode({ language, dbName, collectionName, filter, projection, sort, limit, skip, pipeline }) {
  const filterObj = pipeline ? null : safeParseJsonish(filter, {});
  const projObj = pipeline ? null : safeParseJsonish(projection, null);
  const sortObj = pipeline ? null : safeParseJsonish(sort, null);

  switch (language) {
    case 'mongosh': {
      if (pipeline) {
        return `use ${dbName};\n\ndb.getCollection(${JSON.stringify(collectionName)}).aggregate(${indentJson(pipeline)});`;
      }
      // In mongosh, find(filter, projection) takes the projection directly;
      // sort/skip/limit are chained.
      const findArgs = projObj
        ? `${indentJson(filterObj)}, ${indentJson(projObj)}`
        : indentJson(filterObj);
      let chain = `db.getCollection(${JSON.stringify(collectionName)}).find(${findArgs})`;
      if (sortObj) chain += `.sort(${indentJson(sortObj)})`;
      if (skip) chain += `.skip(${skip})`;
      if (limit) chain += `.limit(${limit})`;
      return `use ${dbName};\n\n${chain};`;
    }
    case 'node': {
      const setupHead = `const { MongoClient } = require('mongodb');\n\nconst client = new MongoClient(process.env.MONGODB_URI);\nawait client.connect();\nconst db = client.db(${JSON.stringify(dbName)});\nconst col = db.collection(${JSON.stringify(collectionName)});\n\n`;
      if (pipeline) {
        return `${setupHead}const docs = await col.aggregate(${indentJson(pipeline)}).toArray();\nconsole.log(docs);`;
      }
      const findArgs = projObj
        ? `${indentJson(filterObj)}, { projection: ${indentJson(projObj)} }`
        : indentJson(filterObj);
      let chain = `col.find(${findArgs})`;
      if (sortObj) chain += `\n  .sort(${indentJson(sortObj)})`;
      if (skip) chain += `\n  .skip(${skip})`;
      if (limit) chain += `\n  .limit(${limit})`;
      return `${setupHead}const docs = await ${chain}.toArray();\nconsole.log(docs);`;
    }
    case 'python': {
      const head = `from pymongo import MongoClient\nimport os\n\nclient = MongoClient(os.environ["MONGODB_URI"])\ncol = client[${JSON.stringify(dbName)}][${JSON.stringify(collectionName)}]\n\n`;
      if (pipeline) {
        return `${head}docs = list(col.aggregate(${pythonRepr(pipeline)}))\nprint(docs)`;
      }
      const args = [`filter=${pythonRepr(filterObj)}`];
      if (projObj) args.push(`projection=${pythonRepr(projObj)}`);
      let cursorExpr = `col.find(${args.join(', ')})`;
      if (sortObj) cursorExpr += `.sort(list(${pythonRepr(sortObj)}.items()))`;
      if (skip) cursorExpr += `.skip(${skip})`;
      if (limit) cursorExpr += `.limit(${limit})`;
      return `${head}for doc in ${cursorExpr}:\n    print(doc)`;
    }
    case 'java': {
      const head = `// requires org.mongodb:mongodb-driver-sync\nimport com.mongodb.client.*;\nimport org.bson.Document;\n\nMongoClient client = MongoClients.create(System.getenv("MONGODB_URI"));\nMongoCollection<Document> col = client\n  .getDatabase(${JSON.stringify(dbName)})\n  .getCollection(${JSON.stringify(collectionName)});\n\n`;
      if (pipeline) {
        return `${head}// pipeline as parsed JSON Documents:\nList<Document> pipeline = ${JSON.stringify(pipeline)
          .split('},').join('},\n  ')};\n// .aggregate(pipeline.stream().map(s -> Document.parse(s.toJson())).toList())`;
      }
      let chain = `Document filter = Document.parse(${JSON.stringify(JSON.stringify(filterObj || {}))});\nFindIterable<Document> it = col.find(filter)`;
      if (projObj) chain += `\n  .projection(Document.parse(${JSON.stringify(JSON.stringify(projObj))}))`;
      if (sortObj) chain += `\n  .sort(Document.parse(${JSON.stringify(JSON.stringify(sortObj))}))`;
      if (skip) chain += `\n  .skip(${skip})`;
      if (limit) chain += `\n  .limit(${limit})`;
      return `${head}${chain};\nfor (Document doc : it) System.out.println(doc.toJson());`;
    }
    case 'go': {
      const head = `// requires go.mongodb.org/mongo-driver\nimport (\n  "context"\n  "os"\n  "go.mongodb.org/mongo-driver/bson"\n  "go.mongodb.org/mongo-driver/mongo"\n  "go.mongodb.org/mongo-driver/mongo/options"\n)\n\nclient, _ := mongo.Connect(context.TODO(), options.Client().ApplyURI(os.Getenv("MONGODB_URI")))\ncol := client.Database(${JSON.stringify(dbName)}).Collection(${JSON.stringify(collectionName)})\n\n`;
      const filterGo = `bson.M${JSON.stringify(filterObj || {}).replace(/"([^"]+)":/g, '"$1": ')}`;
      if (pipeline) {
        return `${head}cursor, _ := col.Aggregate(context.TODO(), bson.A${JSON.stringify(pipeline).replace(/"([^"]+)":/g, '"$1": ')})\nvar docs []bson.M\ncursor.All(context.TODO(), &docs)`;
      }
      const opts = [];
      if (projObj) opts.push(`SetProjection(bson.M${JSON.stringify(projObj).replace(/"([^"]+)":/g, '"$1": ')})`);
      if (sortObj) opts.push(`SetSort(bson.M${JSON.stringify(sortObj).replace(/"([^"]+)":/g, '"$1": ')})`);
      if (limit) opts.push(`SetLimit(${limit})`);
      if (skip) opts.push(`SetSkip(${skip})`);
      const optExpr = opts.length ? `, options.Find().${opts.join('.')}` : '';
      return `${head}cursor, _ := col.Find(context.TODO(), ${filterGo}${optExpr})\nvar docs []bson.M\ncursor.All(context.TODO(), &docs)`;
    }
    default:
      return '// unsupported language';
  }
}

let copyAsCodeLanguage = localStorage.getItem('mdb_code_lang') || 'mongosh';

async function openCopyAsCodeModal({ dbName, collectionName, getInputs, kind = 'find' }) {
  const root = document.createElement('div');
  root.className = 'ui-modal ui-modal-code';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const langTabs = CODE_LANGUAGES.map(
    (l) => `<button class="code-lang-tab${l.id === copyAsCodeLanguage ? ' active' : ''}" data-lang="${l.id}">${escapeHtml(l.label)}</button>`
  ).join('');
  root.innerHTML = `
    <div class="ui-modal-backdrop"></div>
    <div class="ui-modal-dialog ui-modal-dialog-wide" tabindex="-1">
      <header class="ui-modal-header">
        <h3 class="ui-modal-title">Copy as code</h3>
        <button class="ui-modal-close" aria-label="Close">&times;</button>
      </header>
      <div class="ui-modal-body" style="padding:0">
        <div class="code-lang-tabs">${langTabs}</div>
        <pre class="code-output mono" id="codeOutput"></pre>
      </div>
      <footer class="ui-modal-actions">
        <span class="code-hint">Generated client-side from your current ${kind === 'aggregate' ? 'pipeline' : 'query'}.</span>
        <button class="btn btn-primary" id="codeCopyBtn">Copy</button>
      </footer>
    </div>
  `;
  document.body.appendChild(root);
  // eslint-disable-next-line no-unused-expressions
  root.offsetWidth;
  root.classList.add('ui-modal-open');

  const out = root.querySelector('#codeOutput');
  function refresh() {
    let inputs;
    try {
      inputs = getInputs();
    } catch (e) {
      out.textContent = '// ' + e.message;
      return;
    }
    try {
      out.textContent = generateCode({
        language: copyAsCodeLanguage,
        dbName,
        collectionName,
        ...inputs,
      });
    } catch (e) {
      out.textContent = '// ' + e.message;
    }
  }
  refresh();

  root.querySelectorAll('.code-lang-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyAsCodeLanguage = btn.dataset.lang;
      localStorage.setItem('mdb_code_lang', copyAsCodeLanguage);
      root.querySelectorAll('.code-lang-tab').forEach((b) => b.classList.toggle('active', b === btn));
      refresh();
    });
  });

  const cleanup = () => {
    root.classList.remove('ui-modal-open');
    setTimeout(() => root.remove(), 150);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.ui-modal-close').addEventListener('click', cleanup);
  root.querySelector('.ui-modal-backdrop').addEventListener('click', cleanup);

  root.querySelector('#codeCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(out.textContent);
      showToast('Code copied to clipboard', 'success', 2000);
    } catch {
      showToast('Could not access clipboard', 'error');
    }
  });
}

// ─── First-run onboarding ────────────────────────────────────────────────────

const ONBOARDING_KEY = 'mongodb_dashboard_onboarded_v1';

const ONBOARDING_STEPS = [
  {
    title: 'Welcome to your MongoDB dashboard',
    body: `<p>A quick tour. You can skip it any time — this only shows once.</p>
           <ul class="onboarding-list">
             <li>Browse, edit, import, and export documents.</li>
             <li>Save queries, run aggregation pipelines, watch change streams.</li>
             <li>Built to be self-hosted with auth + read-only mode.</li>
           </ul>`,
  },
  {
    title: 'Command palette: <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd>',
    body: `<p>The fastest way around. Hit it from anywhere to:</p>
           <ul class="onboarding-list">
             <li>Jump to any open collection</li>
             <li>Open a tab (Schema, Indexes, Aggregation, Changes…)</li>
             <li>Run any action without reaching for the mouse</li>
           </ul>`,
  },
  {
    title: 'Read-only mode',
    body: `<p>Toggle read-only from the command palette to lock writes — useful when poking around production.</p>
           <p>For self-hosted instances, set <code>READ_ONLY=true</code> server-side and writes are blocked at the API layer too.</p>`,
  },
  {
    title: 'Right-click anywhere to act',
    body: `<p>Right-click a row in the table for a context menu — Open in new tab, Copy <code>_id</code>, Duplicate, Delete.</p>
           <p>Click any field name in the JSON tree to copy its dotted path.</p>`,
  },
  {
    title: 'Theme + keyboard shortcuts',
    body: `<p>Toggle light/dark/system from the top-right.</p>
           <p>Press <kbd>?</kbd> to see the full keyboard shortcut list.</p>`,
  },
];

function showOnboardingIfFirstRun() {
  try {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
  } catch (_) {}
  // Don't interrupt the login page or any unauthenticated state.
  if (document.body.classList.contains('connect-page')) return;
  setTimeout(showOnboardingTour, 600);
}

function showOnboardingTour(force = false) {
  let stepIdx = 0;
  const root = document.createElement('div');
  root.className = 'onboarding-overlay';
  root.innerHTML = `
    <div class="onboarding-backdrop"></div>
    <div class="onboarding-card" role="dialog" aria-modal="true">
      <div class="onboarding-progress"></div>
      <div class="onboarding-body"></div>
      <footer class="onboarding-footer">
        <button class="btn btn-ghost btn-sm" data-onb="skip">Skip tour</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" data-onb="prev">Back</button>
        <button class="btn btn-primary btn-sm" data-onb="next">Next</button>
      </footer>
    </div>
  `;
  document.body.appendChild(root);
  // eslint-disable-next-line no-unused-expressions
  root.offsetWidth;
  root.classList.add('onboarding-open');

  const bodyEl = root.querySelector('.onboarding-body');
  const progressEl = root.querySelector('.onboarding-progress');
  const prevBtn = root.querySelector('[data-onb="prev"]');
  const nextBtn = root.querySelector('[data-onb="next"]');
  const skipBtn = root.querySelector('[data-onb="skip"]');

  function render() {
    const step = ONBOARDING_STEPS[stepIdx];
    bodyEl.innerHTML = `<h2>${step.title}</h2>${step.body}`;
    progressEl.innerHTML = ONBOARDING_STEPS.map(
      (_, i) => `<span class="onboarding-dot${i === stepIdx ? ' active' : ''}"></span>`
    ).join('');
    prevBtn.disabled = stepIdx === 0;
    nextBtn.textContent = stepIdx === ONBOARDING_STEPS.length - 1 ? 'Done' : 'Next';
  }
  function close(remember = true) {
    if (remember && !force) {
      try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch (_) {}
    }
    root.classList.remove('onboarding-open');
    setTimeout(() => root.remove(), 180);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') { stepIdx = Math.min(ONBOARDING_STEPS.length - 1, stepIdx + 1); render(); }
    if (e.key === 'ArrowLeft')  { stepIdx = Math.max(0, stepIdx - 1); render(); }
  }
  document.addEventListener('keydown', onKey);

  prevBtn.addEventListener('click', () => { stepIdx = Math.max(0, stepIdx - 1); render(); });
  nextBtn.addEventListener('click', () => {
    if (stepIdx === ONBOARDING_STEPS.length - 1) close(true);
    else { stepIdx += 1; render(); }
  });
  skipBtn.addEventListener('click', () => close(true));
  root.querySelector('.onboarding-backdrop').addEventListener('click', () => close(true));

  render();
}

// Expose so the command palette / a future menu item can re-trigger.
window.showOnboardingTour = () => showOnboardingTour(true);

document.addEventListener('DOMContentLoaded', showOnboardingIfFirstRun);

// ─── Context menu ─────────────────────────────────────────────────────────────

let activeContextMenu = null;

function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
    document.removeEventListener('click', _ctxOnDocClick, true);
    document.removeEventListener('keydown', _ctxOnKey, true);
    window.removeEventListener('resize', closeContextMenu);
    window.removeEventListener('scroll', closeContextMenu, true);
  }
}

function _ctxOnDocClick(e) {
  if (activeContextMenu && !activeContextMenu.contains(e.target)) {
    closeContextMenu();
  }
}
function _ctxOnKey(e) {
  if (e.key === 'Escape') closeContextMenu();
}

function showContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map((it) => {
      if (it.divider) return '<div class="ctx-menu-divider"></div>';
      const danger = it.danger ? ' ctx-menu-item-danger' : '';
      const disabled = it.disabled ? ' ctx-menu-item-disabled' : '';
      const icon = it.icon ? `<span class="ctx-menu-icon">${it.icon}</span>` : '<span class="ctx-menu-icon"></span>';
      const shortcut = it.shortcut ? `<span class="ctx-menu-shortcut">${escapeHtml(it.shortcut)}</span>` : '';
      return `<div class="ctx-menu-item${danger}${disabled}" data-id="${escapeHtml(it.id || '')}" role="menuitem">${icon}<span class="ctx-menu-label">${escapeHtml(it.label)}</span>${shortcut}</div>`;
    })
    .join('');

  // Pre-position offscreen so we can measure size, then clamp into viewport.
  menu.style.position = 'fixed';
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';
  document.body.appendChild(menu);
  const { width, height } = menu.getBoundingClientRect();
  const px = Math.min(x, window.innerWidth - width - 8);
  const py = Math.min(y, window.innerHeight - height - 8);
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-menu-item');
    if (!item || item.classList.contains('ctx-menu-item-disabled')) return;
    const id = item.dataset.id;
    const found = items.find((i) => i.id === id);
    closeContextMenu();
    if (found && found.action) found.action();
  });

  // Schedule listeners on next tick so the click that opened the menu doesn't close it.
  setTimeout(() => {
    document.addEventListener('click', _ctxOnDocClick, true);
    document.addEventListener('keydown', _ctxOnKey, true);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
  }, 0);

  activeContextMenu = menu;
  return menu;
}

function openRowContextMenu(e, doc, dbName, collectionName) {
  const docId = doc._id?.$oid || doc._id;
  const cleanId = String(docId).replace(/^"|"$/g, '');
  const docUrl = `/browse/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(cleanId)}`;
  showContextMenu(e.clientX, e.clientY, [
    {
      id: 'open',
      label: 'Open document',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      shortcut: 'Click',
      action: () => { window.location.href = docUrl; },
    },
    {
      id: 'open-new-tab',
      label: 'Open in new tab',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      shortcut: 'Ctrl+Click',
      action: () => { window.open(docUrl, '_blank', 'noopener'); },
    },
    { divider: true },
    {
      id: 'copy-id',
      label: 'Copy _id',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
      action: async () => {
        try {
          await navigator.clipboard.writeText(cleanId);
          showToast('Copied _id', 'success', 1800);
        } catch {
          showToast('Could not access clipboard', 'error');
        }
      },
    },
    {
      id: 'copy-json',
      label: 'Copy as JSON',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      action: async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
          showToast('Copied document JSON', 'success', 1800);
        } catch {
          showToast('Could not access clipboard', 'error');
        }
      },
    },
    {
      id: 'copy-filter',
      label: 'Copy as { _id: … } filter',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
      action: async () => {
        const expr = `{ _id: ObjectId("${cleanId}") }`;
        try {
          await navigator.clipboard.writeText(expr);
          showToast('Copied filter', 'success', 1800);
        } catch {
          showToast('Could not access clipboard', 'error');
        }
      },
    },
    { divider: true },
    {
      id: 'duplicate',
      label: 'Duplicate document',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
      disabled: isReadOnly(),
      action: () => {
        if (typeof duplicateDocument === 'function') {
          duplicateDocument(doc, dbName, collectionName);
        }
      },
    },
    {
      id: 'use-as-template',
      label: 'New from this as template',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>',
      disabled: isReadOnly(),
      action: () => openDocModalFromTemplate(dbName, collectionName, doc),
    },
    {
      id: 'delete',
      label: 'Delete document…',
      danger: true,
      disabled: isReadOnly(),
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
      action: () => {
        if (typeof openDeleteModal === 'function') {
          openDeleteModal(dbName, collectionName, cleanId);
        }
      },
    },
  ]);
}

// ─── Skeleton loaders + polished empty states ────────────────────────────────

function renderTableSkeleton(rowCount = 6, colCount = 5) {
  const cells = Array.from({ length: colCount }, (_, i) => {
    // Vary widths so it looks organic, not a grid of identical bars.
    const widths = ['90%', '60%', '75%', '40%', '85%', '55%'];
    return `<td><span class="skeleton skeleton-text" style="width:${widths[i % widths.length]}"></span></td>`;
  }).join('');
  const rows = Array.from({ length: rowCount }, () =>
    `<tr class="skeleton-row">${cells}</tr>`
  ).join('');
  return rows;
}

function renderEmptyState({
  icon,
  title,
  message,
  actions = [],
} = {}) {
  const iconHtml = icon ||
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
  const actionsHtml = actions.length
    ? `<div class="empty-actions">${actions
        .map(
          (a) =>
            `<button class="btn ${a.primary ? 'btn-primary' : 'btn-ghost'} btn-sm" data-empty-action="${escapeHtml(a.id || '')}">${escapeHtml(a.label)}</button>`
        )
        .join('')}</div>`
    : '';
  return `
    <div class="empty-state-polished">
      <div class="empty-icon">${iconHtml}</div>
      <h3>${escapeHtml(title || '')}</h3>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
      ${actionsHtml}
    </div>
  `;
}

// ─── UI Modals (confirm / prompt / alert) ─────────────────────────────────────
// Replaces the browser-native dialogs. All return Promises so they're easy to
// drop into existing async flows without callback nesting.

const ui = (window.ui = window.ui || {});

function _uiBuildModal({ title, body, actions, kind = 'default' }) {
  const root = document.createElement('div');
  root.className = `ui-modal ui-modal-${kind}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="ui-modal-backdrop"></div>
    <div class="ui-modal-dialog" tabindex="-1">
      <header class="ui-modal-header">
        <h3 class="ui-modal-title"></h3>
        <button class="ui-modal-close" aria-label="Close">&times;</button>
      </header>
      <div class="ui-modal-body"></div>
      <footer class="ui-modal-actions"></footer>
    </div>
  `;
  root.querySelector('.ui-modal-title').textContent = title || '';
  const bodyEl = root.querySelector('.ui-modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const actionsEl = root.querySelector('.ui-modal-actions');
  return { root, bodyEl, actionsEl };
}

function _uiOpen(root, dialog, onClose) {
  document.body.appendChild(root);
  // Force reflow before adding class so the transition runs.
  // eslint-disable-next-line no-unused-expressions
  root.offsetWidth;
  root.classList.add('ui-modal-open');
  setTimeout(() => dialog.focus(), 50);

  const cleanup = (result) => {
    root.classList.remove('ui-modal-open');
    setTimeout(() => {
      root.remove();
      document.removeEventListener('keydown', onKey);
      onClose && onClose(result);
    }, 150);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup({ cancelled: true });
    }
  };
  document.addEventListener('keydown', onKey);
  root.querySelector('.ui-modal-close').addEventListener('click', () => cleanup({ cancelled: true }));
  root.querySelector('.ui-modal-backdrop').addEventListener('click', () => cleanup({ cancelled: true }));
  return cleanup;
}

ui.confirm = function ({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const { root, actionsEl } = _uiBuildModal({
      title,
      body: `<p class="ui-modal-message">${escapeHtml(message)}</p>`,
      kind: danger ? 'danger' : 'default',
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = cancelText;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    confirmBtn.textContent = confirmText;
    actionsEl.append(cancelBtn, confirmBtn);

    const dialog = root.querySelector('.ui-modal-dialog');
    const cleanup = _uiOpen(root, dialog, (r) => resolve(r && !r.cancelled));
    cancelBtn.addEventListener('click', () => cleanup({ cancelled: true }));
    confirmBtn.addEventListener('click', () => cleanup({ cancelled: false }));
    confirmBtn.focus();
  });
};

ui.prompt = function ({
  title = 'Enter value',
  message = '',
  placeholder = '',
  defaultValue = '',
  confirmText = 'Save',
  cancelText = 'Cancel',
  type = 'text',
  validate = null,
  fields = null,
} = {}) {
  return new Promise((resolve) => {
    const fieldList = fields || [
      { name: 'value', label: message || '', placeholder, defaultValue, type, autofocus: true },
    ];
    const formHtml = fieldList
      .map((f, i) => {
        const id = `ui-prompt-field-${i}`;
        const labelHtml = f.label
          ? `<label class="ui-prompt-label" for="${id}">${escapeHtml(f.label)}</label>`
          : '';
        if (f.type === 'select') {
          const opts = (f.options || [])
            .map((o) =>
              `<option value="${escapeHtml(o.value)}"${o.value === f.defaultValue ? ' selected' : ''}>${escapeHtml(o.label || o.value)}</option>`
            )
            .join('');
          return `<div class="ui-prompt-row">${labelHtml}<select id="${id}" name="${escapeHtml(f.name)}" class="ui-prompt-input">${opts}</select></div>`;
        }
        if (f.type === 'color-swatches') {
          const swatches = (f.options || [])
            .map(
              (o) =>
                `<button type="button" class="ui-color-swatch${o.value === f.defaultValue ? ' selected' : ''}" data-value="${escapeHtml(o.value)}" style="background:${escapeHtml(o.value)}" title="${escapeHtml(o.label || '')}" aria-label="${escapeHtml(o.label || o.value)}"></button>`
            )
            .join('');
          return `<div class="ui-prompt-row">${labelHtml}<div class="ui-color-swatches" data-name="${escapeHtml(f.name)}" data-value="${escapeHtml(f.defaultValue || '')}">${swatches}<button type="button" class="ui-color-swatch ui-color-swatch-clear${!f.defaultValue ? ' selected' : ''}" data-value="" title="No color" aria-label="No color"></button></div></div>`;
        }
        return `<div class="ui-prompt-row">${labelHtml}<input id="${id}" name="${escapeHtml(f.name)}" type="${f.type || 'text'}" class="ui-prompt-input" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.defaultValue || '')}"${f.autofocus ? ' autofocus' : ''}/></div>`;
      })
      .join('');
    const errorHtml = `<p class="ui-prompt-error" style="display:none"></p>`;
    const { root, actionsEl, bodyEl } = _uiBuildModal({
      title,
      body: `<form class="ui-prompt-form">${formHtml}${errorHtml}</form>`,
    });

    // Wire color swatches
    bodyEl.querySelectorAll('.ui-color-swatches').forEach((group) => {
      group.querySelectorAll('.ui-color-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
          group.dataset.value = btn.dataset.value;
          group.querySelectorAll('.ui-color-swatch').forEach((b) => b.classList.toggle('selected', b === btn));
        });
      });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.type = 'button';
    cancelBtn.textContent = cancelText;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.type = 'submit';
    confirmBtn.textContent = confirmText;
    actionsEl.append(cancelBtn, confirmBtn);
    bodyEl.querySelector('form').appendChild(actionsEl.cloneNode(false));
    bodyEl.querySelector('.ui-modal-actions') &&
      bodyEl.querySelector('.ui-modal-actions').remove();

    const dialog = root.querySelector('.ui-modal-dialog');
    const cleanup = _uiOpen(root, dialog, (r) => resolve(r));

    cancelBtn.addEventListener('click', () => cleanup({ cancelled: true }));
    bodyEl.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      fieldList.forEach((f) => {
        if (f.type === 'color-swatches') {
          values[f.name] = bodyEl.querySelector(`[data-name="${f.name}"]`).dataset.value;
        } else {
          const el = bodyEl.querySelector(`[name="${f.name}"]`);
          values[f.name] = el ? el.value : '';
        }
      });
      if (validate) {
        const err = validate(values);
        if (err) {
          const errEl = bodyEl.querySelector('.ui-prompt-error');
          errEl.textContent = err;
          errEl.style.display = 'block';
          return;
        }
      }
      const result =
        fieldList.length === 1 && fieldList[0].name === 'value'
          ? values.value
          : values;
      cleanup({ cancelled: false, value: result });
    });
    setTimeout(() => {
      const first = bodyEl.querySelector('.ui-prompt-input, [autofocus]');
      first && first.focus();
      first && first.select && first.select();
    }, 80);
  }).then((r) => (r && !r.cancelled ? r.value : null));
};

ui.alert = function ({ title = 'Notice', message = '', confirmText = 'OK' } = {}) {
  return new Promise((resolve) => {
    const { root, actionsEl } = _uiBuildModal({
      title,
      body: `<p class="ui-modal-message">${escapeHtml(message)}</p>`,
    });
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = confirmText;
    actionsEl.append(okBtn);

    const dialog = root.querySelector('.ui-modal-dialog');
    const cleanup = _uiOpen(root, dialog, () => resolve());
    okBtn.addEventListener('click', () => cleanup());
    okBtn.focus();
  });
};

// Storage keys
const STORAGE_KEY = 'mongodb_dashboard_connections';
const ACTIVE_CONNECTION_KEY = 'mongodb_dashboard_active_connection';
const THEME_KEY = 'mongodb_dashboard_theme';
const READONLY_KEY = 'mongodb_dashboard_readonly';

function isReadOnly() {
  return localStorage.getItem(READONLY_KEY) === 'true';
}

function setReadOnly(val) {
  localStorage.setItem(READONLY_KEY, val ? 'true' : 'false');
  document.body.classList.toggle('readonly-mode', val);
  updateReadOnlyBadge();
}

function updateReadOnlyBadge() {
  let badge = document.getElementById('readonlyBadge');
  if (isReadOnly()) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'readonlyBadge';
      badge.className = 'readonly-badge';
      badge.textContent = 'READ-ONLY';
      badge.title = 'Click to disable read-only mode';
      badge.addEventListener('click', () => setReadOnly(false));
      const header = document.querySelector('.header');
      if (header) header.appendChild(badge);
    }
    badge.style.display = '';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

// Apply read-only on page load
document.addEventListener('DOMContentLoaded', () => {
  if (isReadOnly()) {
    document.body.classList.add('readonly-mode');
    updateReadOnlyBadge();
  }
  injectLogoutControl();
});

function injectLogoutControl() {
  const cfg = window.__APP_CONFIG__ || {};
  if (!cfg.authEnabled) return;
  const headerActions = document.querySelector('.header-actions');
  if (!headerActions) return;
  if (headerActions.querySelector('[data-logout-btn]')) return;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/logout';
  form.style.display = 'inline-flex';
  form.dataset.logoutBtn = '1';

  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn-sm btn-ghost';
  btn.title = 'Sign out';
  btn.setAttribute('aria-label', 'Sign out');
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>';

  form.appendChild(btn);
  headerActions.appendChild(form);

  // When auth is enabled and a preset URI is in use, the user-controlled
  // disconnect button doesn't apply — hide it to avoid confusion.
  if (cfg.presetLocked) {
    const dc = document.getElementById('disconnectBtn');
    if (dc) dc.style.display = 'none';
  }
}

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

// Apply connection-aware header color and page title
function applyConnectionBranding() {
  const activeUri = getActiveConnection();
  if (!activeUri) return;

  const conns = getConnections();
  const conn = conns.find(c => c.uri === activeUri);

  // Apply color to header
  if (conn?.color) {
    const header = document.querySelector('.header');
    if (header) header.style.borderBottomColor = conn.color;
  }

  // Update page title with connection name
  if (conn?.name) {
    const baseTitle = document.title;
    if (!baseTitle.includes('|')) {
      document.title = `${baseTitle} — ${conn.name}`;
    } else {
      document.title = baseTitle.replace(/\|/, `— ${conn.name} |`);
    }
  }
}

document.addEventListener('DOMContentLoaded', applyConnectionBranding);

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

    // Cmd/Ctrl + K — open command palette
    if (isMod && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
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
            <div class="shortcut-row"><kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K</kbd><span>Command palette</span></div>
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
            <div class="shortcut-row"><kbd>J</kbd><span>Next recent document (on doc page)</span></div>
            <div class="shortcut-row"><kbd>K</kbd><span>Previous recent document</span></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

// ─── Command Palette ─────────────────────────────────────────────────────────

function toggleCommandPalette() {
  let palette = document.getElementById('commandPalette');
  if (palette && palette.style.display !== 'none') {
    palette.style.display = 'none';
    return;
  }

  if (!palette) {
    palette = document.createElement('div');
    palette.id = 'commandPalette';
    palette.className = 'command-palette';
    palette.innerHTML = `
      <div class="command-palette-backdrop" onclick="document.getElementById('commandPalette').style.display='none'"></div>
      <div class="command-palette-dialog">
        <div class="command-palette-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="command-palette-icon">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" id="commandPaletteInput" class="command-palette-input" placeholder="Search actions, collections, or pages..." autocomplete="off" spellcheck="false"/>
        </div>
        <div id="commandPaletteResults" class="command-palette-results"></div>
      </div>
    `;
    document.body.appendChild(palette);

    const input = document.getElementById('commandPaletteInput');
    input.addEventListener('input', () => renderPaletteResults(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { palette.style.display = 'none'; return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); movePaletteSelection(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); movePaletteSelection(-1); }
      if (e.key === 'Enter') { e.preventDefault(); executePaletteSelection(); }
    });
  }

  palette.style.display = 'flex';
  const input = document.getElementById('commandPaletteInput');
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function getCommandActions() {
  const actions = [
    { label: 'Go to Databases', category: 'Navigation', action: () => window.location.href = '/databases' },
    { label: 'Go to Performance', category: 'Navigation', action: () => window.location.href = '/performance' },
    { label: 'Go to Connect', category: 'Navigation', action: () => window.location.href = '/' },
    { label: 'New Document', category: 'Actions', action: () => document.getElementById('addDocBtn')?.click() },
    { label: 'Refresh Documents', category: 'Actions', action: () => document.getElementById('refreshBtn')?.click() },
    { label: 'Run Query', category: 'Actions', action: () => document.getElementById('queryRunBtn')?.click() },
    { label: 'Import Documents', category: 'Actions', action: () => document.getElementById('importBtn')?.click() },
    { label: 'Export Documents', category: 'Actions', action: () => document.getElementById('exportBtn')?.click() },
    { label: 'Toggle Shell', category: 'Actions', action: () => {
      const panel = document.getElementById('shellPanel');
      if (panel?.classList.contains('shell-panel-closed')) document.getElementById('shellOpenBtn')?.click();
      else document.getElementById('shellToggleBtn')?.click();
    }},
    { label: 'Keyboard Shortcuts', category: 'Actions', action: toggleShortcutsModal },
    { label: 'Show Onboarding Tour', category: 'Help', action: () => window.showOnboardingTour && window.showOnboardingTour() },
    { label: 'Toggle Scratchpad', category: 'Actions', action: () => document.getElementById('scratchpadBtn')?.click() },
    ...THEME_VARIANTS.map((t) => ({
      label: `Theme: ${t.label}`,
      category: 'Settings',
      action: () => setTheme(t.id),
    })),
    { label: 'Tab: Documents', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="documents"]')?.click() },
    { label: 'Tab: Indexes', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="indexes"]')?.click() },
    { label: 'Tab: Schema', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="schema"]')?.click() },
    { label: 'Tab: Aggregation', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="aggregation"]')?.click() },
    { label: 'Tab: Validation', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="validation"]')?.click() },
    { label: 'Tab: Stats', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="stats"]')?.click() },
    { label: 'Tab: Changes', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="changes"]')?.click() },
    { label: 'Tab: SQL to MQL', category: 'Tabs', action: () => document.querySelector('.collection-tab[data-tab="sql"]')?.click() },
    { label: 'Focus Search', category: 'Actions', action: () => { const s = document.getElementById('searchInput'); if (s) { s.focus(); s.select(); } }},
    { label: 'Focus Filter', category: 'Actions', action: () => document.getElementById('queryFilter')?.focus() },
    { label: 'Select Columns', category: 'Actions', action: () => document.getElementById('columnsBtn')?.click() },
    { label: isReadOnly() ? 'Disable Read-Only Mode' : 'Enable Read-Only Mode', category: 'Settings', action: () => setReadOnly(!isReadOnly()) },
  ];

  // Add open tabs as navigation options
  const tabs = getOpenTabs();
  tabs.forEach(tab => {
    actions.push({
      label: `${tab.db} / ${tab.collection}`,
      category: 'Collections',
      action: () => window.location.href = `/browse/${encodeURIComponent(tab.db)}/${encodeURIComponent(tab.collection)}`,
    });
  });

  return actions;
}

let paletteSelectedIdx = 0;
let paletteFiltered = [];

function renderPaletteResults(query) {
  const results = document.getElementById('commandPaletteResults');
  const actions = getCommandActions();
  const q = query.toLowerCase().trim();

  paletteFiltered = q
    ? actions.filter(a => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
    : actions;

  paletteSelectedIdx = 0;

  if (paletteFiltered.length === 0) {
    results.innerHTML = '<div class="command-palette-empty">No results found</div>';
    return;
  }

  // Group by category
  const grouped = {};
  paletteFiltered.forEach((a, i) => {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push({ ...a, idx: i });
  });

  let html = '';
  for (const [category, items] of Object.entries(grouped)) {
    html += `<div class="command-palette-group">${escapeHtml(category)}</div>`;
    html += items.map(item => `
      <div class="command-palette-item ${item.idx === 0 ? 'selected' : ''}" data-idx="${item.idx}">
        ${escapeHtml(item.label)}
      </div>
    `).join('');
  }
  results.innerHTML = html;

  results.querySelectorAll('.command-palette-item').forEach(el => {
    el.addEventListener('click', () => {
      paletteSelectedIdx = parseInt(el.dataset.idx);
      executePaletteSelection();
    });
    el.addEventListener('mouseenter', () => {
      paletteSelectedIdx = parseInt(el.dataset.idx);
      results.querySelectorAll('.command-palette-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function movePaletteSelection(delta) {
  const results = document.getElementById('commandPaletteResults');
  paletteSelectedIdx = Math.max(0, Math.min(paletteFiltered.length - 1, paletteSelectedIdx + delta));
  results.querySelectorAll('.command-palette-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.idx) === paletteSelectedIdx);
  });
  results.querySelector('.command-palette-item.selected')?.scrollIntoView({ block: 'nearest' });
}

function executePaletteSelection() {
  const action = paletteFiltered[paletteSelectedIdx];
  if (action) {
    document.getElementById('commandPalette').style.display = 'none';
    action.action();
  }
}

// Initialize shortcuts on page load
document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);

// ─── Query input validation ───────────────────────────────────────────────────

// Returns { message, line, column } or null when input is valid.
function validateMqlInput(text) {
  if (!text) return null;
  const candidates = [text];
  // MQL allows unquoted keys + single quotes — try a permissive transform
  // that mirrors what the server's shellArg parser does.
  const normalized = text
    .replace(/'((?:\\.|[^'\\])*)'/g, (_m, body) => JSON.stringify(body))
    .replace(/([{,\s])([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  if (normalized !== text) candidates.push(normalized);
  let lastError = null;
  for (const c of candidates) {
    try {
      JSON.parse(c);
      return null; // any candidate parses → accept
    } catch (e) {
      lastError = e;
    }
  }
  // Extract a position from the standard V8 error message:
  //   "Unexpected token X in JSON at position Y"
  // Newer V8 emits "Unexpected token 'X', \"...{ a: 1...\" is not valid JSON" with no pos.
  let pos = null;
  const posMatch = /at position (\d+)/.exec(lastError.message);
  if (posMatch) pos = parseInt(posMatch[1]);
  let line = 1, column = 1;
  if (pos !== null) {
    const upTo = text.slice(0, pos);
    const lines = upTo.split('\n');
    line = lines.length;
    column = lines[lines.length - 1].length + 1;
  }
  // Friendly message: trim noisy V8 prefixes and any appended (line N column M).
  const friendly = lastError.message
    .replace(/\s*\(line \d+ column \d+\)\s*$/, '')
    .replace(/^.*JSON\s+at\s+position\s+\d+/, 'Could not parse JSON')
    .replace(/SyntaxError:\s*/, '')
    .replace(/in JSON\s*$/i, '');
  return {
    message: pos !== null ? `${friendly} (col ${column})` : friendly,
    line,
    column,
    position: pos,
  };
}

function setQueryFieldError(input, error, _label) {
  // Clear or set inline error pill below the input.
  const id = input.id || (input.id = 'q-input-' + Math.random().toString(36).slice(2));
  let pill = document.getElementById(id + '-err');
  if (!error) {
    input.classList.remove('query-input-error');
    if (pill) pill.remove();
    return;
  }
  input.classList.add('query-input-error');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = id + '-err';
    pill.className = 'query-input-error-pill';
    input.insertAdjacentElement('afterend', pill);
  }
  pill.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span>${escapeHtml(error.message)}</span>
  `;
  // Clear the error on next edit so it doesn't linger.
  const onInput = () => {
    setQueryFieldError(input, null);
    input.removeEventListener('input', onInput);
  };
  input.addEventListener('input', onInput);
}

// ─── Scratchpad (per-collection markdown notes) ──────────────────────────────

const SCRATCHPAD_KEY = 'mongodb_dashboard_scratchpad';

function getScratchpad(dbName, collectionName) {
  try {
    const all = JSON.parse(localStorage.getItem(SCRATCHPAD_KEY) || '{}');
    return all[`${dbName}/${collectionName}`] || '';
  } catch { return ''; }
}

function setScratchpad(dbName, collectionName, value) {
  let all;
  try { all = JSON.parse(localStorage.getItem(SCRATCHPAD_KEY) || '{}'); }
  catch { all = {}; }
  const key = `${dbName}/${collectionName}`;
  if (value && value.trim()) all[key] = value;
  else delete all[key];
  localStorage.setItem(SCRATCHPAD_KEY, JSON.stringify(all));
}

// Tiny markdown subset: # / ## / ### headers, **bold**, *italic*, `code`,
// fenced ``` blocks, [link](url), bullet lists, blockquote, and paragraphs.
// Intentionally minimal — no images, no HTML passthrough.
function renderMiniMarkdown(src) {
  if (!src) return '';
  // Escape first.
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // Pull fenced code blocks out so inline rules don't touch them.
  const blocks = [];
  let safe = esc(src).replace(/```([\s\S]*?)```/g, (_, body) => {
    blocks.push(body);
    return `CODEBLOCK${blocks.length - 1}`;
  });

  // Inline code
  safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold then italic (order matters because ** is a superset of *)
  safe = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Links — only safe schemes.
  safe = safe.replace(/\[([^\]]+)\]\(((?:https?:|mailto:|\/)[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Block-level processing: headers, lists, blockquote, paragraphs.
  const lines = safe.split('\n');
  const out = [];
  let inUl = false;
  const closeUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };
  for (let line of lines) {
    if (/^#{3} (.+)/.test(line)) { closeUl(); out.push(line.replace(/^#{3} (.+)/, '<h3>$1</h3>')); continue; }
    if (/^#{2} (.+)/.test(line)) { closeUl(); out.push(line.replace(/^#{2} (.+)/, '<h2>$1</h2>')); continue; }
    if (/^# (.+)/.test(line))    { closeUl(); out.push(line.replace(/^# (.+)/, '<h1>$1</h1>')); continue; }
    if (/^[-*] (.+)/.test(line)) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(line.replace(/^[-*] (.+)/, '<li>$1</li>'));
      continue;
    }
    if (/^&gt; (.+)/.test(line)) { closeUl(); out.push(line.replace(/^&gt; (.+)/, '<blockquote>$1</blockquote>')); continue; }
    closeUl();
    if (line.trim() === '') out.push('');
    else out.push(`<p>${line}</p>`);
  }
  closeUl();
  let html = out.join('\n');

  // Restore code blocks.
  html = html.replace(/CODEBLOCK(\d+)/g, (_, idx) =>
    `<pre><code>${blocks[parseInt(idx)]}</code></pre>`
  );
  return html;
}

let scratchpadOpen = false;
let scratchpadEditMode = true;

function mountScratchpad(dbName, collectionName) {
  const btn = document.getElementById('scratchpadBtn');
  if (!btn || !dbName || !collectionName) return;

  // Reflect "has notes" on the button.
  const refreshBtn = () => {
    const hasNotes = !!(getScratchpad(dbName, collectionName) || '').trim();
    btn.classList.toggle('btn-active', hasNotes);
    btn.setAttribute('title', hasNotes ? 'Open scratchpad (notes saved)' : 'Open scratchpad (empty)');
  };
  refreshBtn();

  btn.addEventListener('click', () => toggleScratchpad(dbName, collectionName, refreshBtn));
}

function toggleScratchpad(dbName, collectionName, onChange) {
  let panel = document.getElementById('scratchpadPanel');
  if (panel) { panel.remove(); scratchpadOpen = false; return; }
  scratchpadOpen = true;

  panel = document.createElement('aside');
  panel.id = 'scratchpadPanel';
  panel.className = 'scratchpad-panel';
  panel.innerHTML = `
    <header class="scratchpad-header">
      <span class="scratchpad-title">Notes · ${escapeHtml(dbName)}.${escapeHtml(collectionName)}</span>
      <div class="scratchpad-tabs">
        <button data-mode="edit" class="scratchpad-tab ${scratchpadEditMode ? 'active' : ''}">Edit</button>
        <button data-mode="preview" class="scratchpad-tab ${!scratchpadEditMode ? 'active' : ''}">Preview</button>
      </div>
      <button class="scratchpad-close" aria-label="Close" title="Close">&times;</button>
    </header>
    <div class="scratchpad-body">
      <textarea class="scratchpad-textarea mono" placeholder="Markdown notes for this collection — only visible to you, stored locally.&#10;&#10;Examples:&#10; - quirks of this dataset&#10; - pinned MQL queries&#10; - PRD links"></textarea>
      <div class="scratchpad-preview"></div>
    </div>
    <footer class="scratchpad-footer">
      <span class="scratchpad-hint">Cmd/Ctrl-S saves · Esc closes · supports basic markdown</span>
      <span class="scratchpad-saved">Saved</span>
    </footer>
  `;
  document.body.appendChild(panel);
  // eslint-disable-next-line no-unused-expressions
  panel.offsetWidth;
  panel.classList.add('scratchpad-panel-open');

  const textarea = panel.querySelector('.scratchpad-textarea');
  const preview = panel.querySelector('.scratchpad-preview');
  const savedBadge = panel.querySelector('.scratchpad-saved');
  textarea.value = getScratchpad(dbName, collectionName);

  function applyMode() {
    panel.classList.toggle('scratchpad-mode-edit', scratchpadEditMode);
    panel.classList.toggle('scratchpad-mode-preview', !scratchpadEditMode);
    panel.querySelectorAll('.scratchpad-tab').forEach((t) =>
      t.classList.toggle('active', (t.dataset.mode === 'edit') === scratchpadEditMode)
    );
    if (!scratchpadEditMode) preview.innerHTML = renderMiniMarkdown(textarea.value);
  }
  applyMode();

  let saveTimer = null;
  const flashSaved = () => {
    savedBadge.classList.add('scratchpad-saved-flash');
    setTimeout(() => savedBadge.classList.remove('scratchpad-saved-flash'), 700);
  };
  const debouncedSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      setScratchpad(dbName, collectionName, textarea.value);
      flashSaved();
      onChange && onChange();
    }, 300);
  };

  textarea.addEventListener('input', debouncedSave);

  panel.querySelectorAll('.scratchpad-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      scratchpadEditMode = tab.dataset.mode === 'edit';
      applyMode();
      if (scratchpadEditMode) textarea.focus();
    });
  });

  const close = () => {
    setScratchpad(dbName, collectionName, textarea.value);
    onChange && onChange();
    panel.classList.remove('scratchpad-panel-open');
    setTimeout(() => panel.remove(), 180);
    document.removeEventListener('keydown', onKey);
    scratchpadOpen = false;
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && !e.target.closest('.scratchpad-panel') === false) {
      // Only close on Esc when no other modal is open.
      if (!document.querySelector('.ui-modal.ui-modal-open, .onboarding-overlay.onboarding-open')) {
        close();
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && e.target.closest('.scratchpad-panel')) {
      e.preventDefault();
      setScratchpad(dbName, collectionName, textarea.value);
      flashSaved();
      onChange && onChange();
    }
  };
  document.addEventListener('keydown', onKey);
  panel.querySelector('.scratchpad-close').addEventListener('click', close);

  if (scratchpadEditMode) setTimeout(() => textarea.focus(), 100);
}

// ─── Recently viewed documents ────────────────────────────────────────────────

const RECENT_DOCS_KEY = 'mongodb_dashboard_recent_docs';
const MAX_RECENT_DOCS = 30;

function getRecentDocuments(dbName = null, collectionName = null) {
  let all;
  try { all = JSON.parse(localStorage.getItem(RECENT_DOCS_KEY) || '[]'); }
  catch { all = []; }
  if (dbName && collectionName) {
    return all.filter((r) => r.db === dbName && r.collection === collectionName);
  }
  return all;
}

function recordRecentDocument(dbName, collectionName, docId, doc) {
  let preview = '';
  try {
    if (doc) {
      const keys = Object.keys(doc).filter((k) => k !== '_id').slice(0, 2);
      preview = keys
        .map((k) => {
          const v = doc[k];
          if (v == null) return `${k}:${v}`;
          if (typeof v === 'object') return `${k}:{…}`;
          const s = String(v);
          return `${k}:${s.length > 24 ? s.slice(0, 24) + '…' : s}`;
        })
        .join(' · ');
    }
  } catch (_) {}

  const cleanId = typeof docId === 'string' ? docId.replace(/^"|"$/g, '') : String(docId);
  const all = getRecentDocuments();
  const filtered = all.filter(
    (r) => !(r.db === dbName && r.collection === collectionName && r.id === cleanId)
  );
  filtered.unshift({
    db: dbName,
    collection: collectionName,
    id: cleanId,
    preview,
    ts: Date.now(),
  });
  localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_DOCS)));

  // If a recents widget is mounted, refresh it.
  const widget = document.getElementById('recentDocsWidget');
  if (widget) renderRecentDocsWidget(widget, dbName, collectionName);
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

function isDocumentPinned(dbName, collectionName, docId) {
  return getRecentDocuments().some(
    (r) => r.db === dbName && r.collection === collectionName && r.id === String(docId).replace(/^"|"$/g, '') && r.pinned
  );
}

function toggleDocumentPin(dbName, collectionName, docId, doc) {
  const cleanId = String(docId).replace(/^"|"$/g, '');
  const all = getRecentDocuments();
  const idx = all.findIndex((r) => r.db === dbName && r.collection === collectionName && r.id === cleanId);
  let pinned;
  if (idx === -1) {
    // Pin a doc that isn't in recents yet — add it.
    recordRecentDocument(dbName, collectionName, cleanId, doc);
    return toggleDocumentPin(dbName, collectionName, docId, doc);
  } else {
    all[idx].pinned = !all[idx].pinned;
    pinned = all[idx].pinned;
    localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(all));
  }
  // Refresh widget if mounted.
  const widget = document.getElementById('recentDocsWidget');
  if (widget) renderRecentDocsWidget(widget, dbName, collectionName);
  return pinned;
}

function renderRecentDocsWidget(container, dbName, collectionName) {
  const all = getRecentDocuments(dbName, collectionName);
  const pinned = all.filter((r) => r.pinned);
  const recent = all.filter((r) => !r.pinned).slice(0, 8);
  if (!pinned.length && !recent.length) {
    container.innerHTML = '';
    return;
  }
  const renderItem = (r) => `
    <div class="recents-widget-item-row">
      <a class="recents-widget-item ${r.pinned ? 'recents-widget-item-pinned' : ''}" href="/browse/${encodeURIComponent(r.db)}/${encodeURIComponent(r.collection)}/${encodeURIComponent(r.id)}" title="${escapeHtml(r.id)}">
        <div class="recents-widget-id mono">${escapeHtml(r.id.slice(0, 18))}${r.id.length > 18 ? '…' : ''}</div>
        ${r.preview ? `<div class="recents-widget-preview">${escapeHtml(r.preview)}</div>` : ''}
        <div class="recents-widget-meta">${timeAgo(r.ts)}</div>
      </a>
      <button class="recents-widget-pin-btn" data-doc-id="${escapeHtml(r.id)}" title="${r.pinned ? 'Unpin' : 'Pin to top'}" aria-label="${r.pinned ? 'Unpin document' : 'Pin document'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${r.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M12 17v5M9 10.76V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 13.24V15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76z"/>
        </svg>
      </button>
    </div>`;

  container.innerHTML = `
    <div class="recents-widget">
      ${pinned.length ? `
        <div class="recents-widget-header">
          <span>Pinned</span>
        </div>
        <div class="recents-widget-list">
          ${pinned.map(renderItem).join('')}
        </div>
      ` : ''}
      ${recent.length ? `
        <div class="recents-widget-header">
          <span>Recently viewed</span>
          <button class="recents-widget-clear" title="Clear" type="button">Clear</button>
        </div>
        <div class="recents-widget-list">
          ${recent.map(renderItem).join('')}
        </div>
      ` : ''}
    </div>
  `;
  container.querySelector('.recents-widget-clear')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Clear unpinned recents only — pinned docs survive.
    const survivors = getRecentDocuments().filter(
      (r) => !(r.db === dbName && r.collection === collectionName) || r.pinned
    );
    localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(survivors));
    renderRecentDocsWidget(container, dbName, collectionName);
  });
  container.querySelectorAll('.recents-widget-pin-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDocumentPin(dbName, collectionName, btn.dataset.docId);
    });
  });
}

function mountRecentDocsWidget(dbName, collectionName) {
  if (!dbName || !collectionName) return;
  const sidebar = document.querySelector('.collections-sidebar') || document.querySelector('.sidebar');
  if (!sidebar) return;
  let widget = document.getElementById('recentDocsWidget');
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'recentDocsWidget';
    sidebar.appendChild(widget);
  }
  renderRecentDocsWidget(widget, dbName, collectionName);
}

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
    <div class="open-tab ${tab.id === currentId ? 'open-tab-active' : ''}" draggable="true" data-tab-id="${escapeHtml(tab.id)}">
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

  // Drag-to-reorder
  let dragId = null;
  bar.querySelectorAll('.open-tab').forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      dragId = el.dataset.tabId;
      el.classList.add('open-tab-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('open-tab-dragging');
      bar.querySelectorAll('.open-tab-drop-before, .open-tab-drop-after').forEach((n) =>
        n.classList.remove('open-tab-drop-before', 'open-tab-drop-after')
      );
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragId || dragId === el.dataset.tabId) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      el.classList.toggle('open-tab-drop-before', before);
      el.classList.toggle('open-tab-drop-after', !before);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('open-tab-drop-before', 'open-tab-drop-after');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === el.dataset.tabId) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      reorderOpenTabs(dragId, el.dataset.tabId, before ? 'before' : 'after');
      dragId = null;
      renderOpenTabsBar(currentDb, currentCollection);
    });
  });
}

function reorderOpenTabs(sourceId, targetId, position) {
  const tabs = getOpenTabs();
  const fromIdx = tabs.findIndex((t) => t.id === sourceId);
  if (fromIdx === -1) return;
  const [moved] = tabs.splice(fromIdx, 1);
  let toIdx = tabs.findIndex((t) => t.id === targetId);
  if (toIdx === -1) {
    tabs.push(moved);
  } else {
    if (position === 'after') toIdx += 1;
    tabs.splice(toIdx, 0, moved);
  }
  saveOpenTabs(tabs);
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
  const connExportBtn = document.getElementById('connExportBtn');
  const connImportBtn = document.getElementById('connImportBtn');
  const connImportFile = document.getElementById('connImportFile');

  if (connExportBtn) {
    connExportBtn.addEventListener('click', () => {
      const conns = getConnections();
      if (!conns.length) {
        showToast('Nothing to export — save a connection first.', 'warning');
        return;
      }
      // Strip embedded credentials before export so a backup file isn't a
      // walking secret. The host & options ride along; user re-enters the
      // password on the importing machine.
      const sanitized = conns.map((c) => ({
        ...c,
        uri: String(c.uri).replace(/(\/\/)[^@/]+@/, '$1<credentials>@'),
      }));
      const blob = new Blob(
        [
          JSON.stringify(
            {
              app: 'mongodb-dashboard',
              version: 1,
              exportedAt: new Date().toISOString(),
              connections: sanitized,
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mongodb-dashboard-connections-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${sanitized.length} connection${sanitized.length === 1 ? '' : 's'} (credentials stripped)`, 'success');
    });
  }

  if (connImportBtn && connImportFile) {
    connImportBtn.addEventListener('click', () => connImportFile.click());
    connImportFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      connImportFile.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const incoming = Array.isArray(data) ? data : data.connections;
        if (!Array.isArray(incoming)) throw new Error('File does not contain a connections array');

        const cleaned = incoming
          .map((c) => {
            if (typeof c === 'string') return { uri: c, name: '', color: '' };
            if (c && typeof c.uri === 'string') {
              return { uri: c.uri, name: c.name || '', color: c.color || '' };
            }
            return null;
          })
          .filter(Boolean);

        const ok = await ui.confirm({
          title: `Import ${cleaned.length} connection${cleaned.length === 1 ? '' : 's'}?`,
          message:
            'Imported entries are merged into your saved list. URIs missing credentials need to be edited before they can connect.',
          confirmText: 'Import',
        });
        if (!ok) return;

        const existing = getConnections();
        const byUri = new Map(existing.map((c) => [c.uri, c]));
        for (const c of cleaned) byUri.set(c.uri, { ...byUri.get(c.uri), ...c });
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...byUri.values()]));
        renderBookmarks();
        showToast(`Imported ${cleaned.length} connection${cleaned.length === 1 ? '' : 's'}`, 'success');
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
    });
  }

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
      ui.prompt({
        title: 'Edit connection',
        confirmText: 'Save',
        fields: [
          { name: 'name', label: 'Label', placeholder: 'My production cluster', defaultValue: existing?.name || '', autofocus: true },
          {
            name: 'color',
            label: 'Color',
            type: 'color-swatches',
            defaultValue: existing?.color || '',
            options: [
              { value: '#388bfd', label: 'Blue' },
              { value: '#3fb950', label: 'Green' },
              { value: '#d29922', label: 'Yellow' },
              { value: '#f85149', label: 'Red' },
              { value: '#bc8cff', label: 'Purple' },
              { value: '#ff7b72', label: 'Coral' },
              { value: '#79c0ff', label: 'Sky' },
            ],
          },
        ],
      }).then((result) => {
        if (!result) return;
        updateConnectionMeta(uri, result.name || '', result.color || '');
        renderBookmarks();
      });
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
let selectedDocIds = new Set();

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

function initSidebarResize() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const handle = document.createElement('div');
  handle.className = 'sidebar-resize-handle';
  sidebar.appendChild(handle);

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e) => {
      const newWidth = Math.min(500, Math.max(180, startWidth + (e.clientX - startX)));
      sidebar.style.width = newWidth + 'px';
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try { localStorage.setItem('mongodb_sidebar_width', sidebar.style.width); } catch (e) {}
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Restore saved width
  try {
    const saved = localStorage.getItem('mongodb_sidebar_width');
    if (saved) sidebar.style.width = saved;
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', initSidebarResize);

function loadServerInfo() {
  const badge = document.getElementById('serverVersionBadge');
  if (!badge) return;

  fetch('/api/server-info')
    .then(r => r.json())
    .then(data => {
      if (data.version) {
        badge.textContent = `MongoDB ${data.version}`;
        badge.title = `Host: ${data.host || '?'}\nEngine: ${data.storageEngine || '?'}\nUptime: ${data.uptime ? Math.floor(data.uptime / 3600) + 'h' : '?'}`;
        badge.style.display = '';
      }
    })
    .catch(() => {});
}

document.addEventListener('DOMContentLoaded', loadServerInfo);

let autoRefreshInterval = null;

function initAutoRefresh(dbName, collectionName) {
  const toggle = document.getElementById('autoRefreshToggle');
  const dropdown = document.getElementById('autoRefreshDropdown');
  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
  });

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });

  dropdown.querySelectorAll('.auto-refresh-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const interval = parseInt(btn.dataset.interval);
      dropdown.style.display = 'none';

      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
      }

      if (interval > 0) {
        toggle.classList.add('auto-refresh-active');
        toggle.title = `Auto-refresh: ${interval}s`;
        autoRefreshInterval = setInterval(() => {
          document.getElementById('refreshBtn')?.click();
        }, interval * 1000);
        showToast(`Auto-refresh every ${interval}s`, 'info', 2000);
      } else {
        toggle.classList.remove('auto-refresh-active');
        toggle.title = 'Auto-refresh';
        showToast('Auto-refresh off', 'info', 1500);
      }
    });
  });
}

function initFavoriteCollections() {
  const FAV_KEY = 'mongodb_fav_collections';
  const getFavs = () => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  };
  const setFavs = (favs) => localStorage.setItem(FAV_KEY, JSON.stringify(favs));

  const favs = getFavs();
  const list = document.getElementById('collectionList');
  if (!list) return;

  // Apply fav state and sort
  const items = Array.from(list.querySelectorAll('.collection-item-wrapper'));
  items.forEach(item => {
    const name = item.dataset.collection;
    const btn = item.querySelector('.col-fav-btn');
    if (favs.includes(name)) {
      item.classList.add('collection-favorited');
      if (btn) btn.classList.add('fav-active');
    }
  });

  // Sort: favorites first
  items
    .sort((a, b) => {
      const aFav = favs.includes(a.dataset.collection) ? 0 : 1;
      const bFav = favs.includes(b.dataset.collection) ? 0 : 1;
      return aFav - bFav;
    })
    .forEach(item => list.appendChild(item));

  // Click handlers
  document.querySelectorAll('.col-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const col = btn.dataset.col;
      let current = getFavs();
      if (current.includes(col)) {
        current = current.filter(c => c !== col);
        btn.classList.remove('fav-active');
        btn.closest('.collection-item-wrapper')?.classList.remove('collection-favorited');
      } else {
        current.push(col);
        btn.classList.add('fav-active');
        btn.closest('.collection-item-wrapper')?.classList.add('collection-favorited');
      }
      setFavs(current);

      // Re-sort
      const items = Array.from(list.querySelectorAll('.collection-item-wrapper'));
      const newFavs = current;
      items
        .sort((a, b) => {
          const aFav = newFavs.includes(a.dataset.collection) ? 0 : 1;
          const bFav = newFavs.includes(b.dataset.collection) ? 0 : 1;
          return aFav - bFav;
        })
        .forEach(item => list.appendChild(item));
    });
  });
}

document.addEventListener('DOMContentLoaded', initFavoriteCollections);

function initCollectionSearch() {
  const searchInput = document.getElementById('collectionSearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    document.querySelectorAll('#collectionList .collection-item-wrapper').forEach(item => {
      const name = item.querySelector('.collection-name')?.textContent.toLowerCase() || '';
      item.style.display = name.includes(term) ? '' : 'none';
    });
  });
}

document.addEventListener('DOMContentLoaded', initCollectionSearch);

async function initBrowser(dbName, collectionName) {
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  tableFields = [];
  allAvailableFields = [];
  currentDbName = dbName;
  currentCollectionName = collectionName;

  if (collectionName) {
    mountRecentDocsWidget(dbName, collectionName);
    mountScratchpad(dbName, collectionName);
  }

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
  const queryCopyCodeBtn = document.getElementById('queryCopyCodeBtn');

  if (queryCopyCodeBtn) {
    queryCopyCodeBtn.addEventListener('click', () => {
      openCopyAsCodeModal({
        dbName,
        collectionName,
        kind: 'find',
        getInputs: () => ({
          filter: queryFilterEl?.value || '',
          projection: queryProjectionEl?.value || '',
          sort: querySortEl?.value || '',
          limit: parseInt(queryLimitEl?.value) || null,
          skip: parseInt(querySkipEl?.value) || null,
        }),
      });
    });
  }

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
    saveQueryBtn.addEventListener('click', async () => {
      const filter = queryFilterEl?.value.trim() || '';
      const projection = queryProjectionEl?.value.trim() || '';
      const sort = querySortEl?.value.trim() || '';
      if (!filter && !projection && !sort) {
        showToast('Enter at least a filter, projection, or sort to save.', 'warning');
        return;
      }
      const name = await ui.prompt({
        title: 'Save query',
        message: 'Give this query a name so you can recall it later.',
        placeholder: 'e.g. Active users last 7 days',
        confirmText: 'Save query',
      });
      if (!name) return;
      saveQuery(dbName, collectionName, { name, filter, projection, sort,
        limit: parseInt(queryLimitEl?.value) || 50,
        skip: parseInt(querySkipEl?.value) || 0 });
      showToast(`Saved query "${name}"`, 'success');
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

  // Add document button (split: main action + templates dropdown)
  const addDocBtn = document.getElementById('addDocBtn');
  if (addDocBtn) {
    addDocBtn.addEventListener('click', () => {
      openDocModal(dbName, collectionName, null);
    });
    // Inject a small caret button next to it for "from template" picker.
    if (!document.getElementById('addDocFromTemplateBtn')) {
      const caret = document.createElement('button');
      caret.id = 'addDocFromTemplateBtn';
      caret.className = 'btn btn-primary btn-caret';
      caret.title = 'New document from template…';
      caret.setAttribute('aria-label', 'Pick a template');
      caret.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
      addDocBtn.insertAdjacentElement('afterend', caret);
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        openTemplatePickerMenu(caret, dbName, collectionName);
      });
    }
  }

  // Columns button
  document.getElementById('columnsBtn')?.addEventListener('click', () => {
    openColumnsModal(dbName, collectionName);
  });

  // Text wrap toggle
  const wrapToggle = document.getElementById('wrapToggle');
  if (wrapToggle) {
    const isWrapped = localStorage.getItem('mongodb_wrap_cells') === 'true';
    if (isWrapped) document.body.classList.add('cells-wrapped');
    wrapToggle.classList.toggle('active', isWrapped);

    wrapToggle.addEventListener('click', () => {
      const wrap = !document.body.classList.contains('cells-wrapped');
      document.body.classList.toggle('cells-wrapped', wrap);
      wrapToggle.classList.toggle('active', wrap);
      localStorage.setItem('mongodb_wrap_cells', wrap);
    });
  }

  // Auto-refresh toggle
  initAutoRefresh(dbName, collectionName);

  // Load more button — handles both cursor and offset pagination modes
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
    if (currentNextSkip !== null) {
      loadDocuments(dbName, collectionName, null, currentNextSkip);
    } else {
      loadDocuments(dbName, collectionName, currentCursor);
    }
  });

  // Go to skip offset
  document.getElementById('paginationGoBtn')?.addEventListener('click', () => {
    const skipInput = document.getElementById('paginationSkipInput');
    const skip = parseInt(skipInput?.value) || 0;
    allDocuments = [];
    tableFields = [];
    const tableBody = document.getElementById('tableBody');
    const tableHeader = document.getElementById('tableHeader');
    if (tableBody) tableBody.innerHTML = '';
    if (tableHeader) tableHeader.innerHTML = '';
    loadDocuments(dbName, collectionName, null, skip);
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
  initChangeStreamPanel(dbName, collectionName);
  initSqlPanel(dbName, collectionName);
  initViewModeToggle(dbName, collectionName);
  initShellPanel(dbName);

  // Delegated click handler for expandable cells and copyable IDs
  document.addEventListener('click', (e) => {
    // Copy ID on click
    const copyEl = e.target.closest('.cell-id-copy');
    if (copyEl) {
      const text = copyEl.dataset.copy || copyEl.textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied ID to clipboard', 'success', 1500);
      }).catch(() => {});
      return;
    }

    const expandable = e.target.closest('.cell-expandable');
    if (!expandable) return;
    const pre = expandable.querySelector('.cell-expanded-json');
    if (!pre) return;
    e.stopPropagation();
    const isVisible = pre.style.display !== 'none';
    pre.style.display = isVisible ? 'none' : 'block';
    expandable.classList.toggle('cell-expanded', !isVisible);
  });
}

function runQuery(dbName, collectionName) {
  const queryFilterEl = document.getElementById('queryFilter');
  const queryProjectionEl = document.getElementById('queryProjection');
  const querySortEl = document.getElementById('querySort');
  const queryLimitEl = document.getElementById('queryLimit');
  const querySkipEl = document.getElementById('querySkip');

  // Validate JSON-ish inputs client-side BEFORE hitting the server.
  const fieldsToCheck = [
    { el: queryFilterEl, label: 'Filter' },
    { el: queryProjectionEl, label: 'Project' },
    { el: querySortEl, label: 'Sort' },
  ];
  let firstError = null;
  for (const { el, label } of fieldsToCheck) {
    if (!el) continue;
    const err = validateMqlInput(el.value.trim());
    setQueryFieldError(el, err, label);
    if (err && !firstError) firstError = { el, err, label };
  }
  if (firstError) {
    firstError.el.focus();
    if (Number.isInteger(firstError.err.column)) {
      const pos = firstError.err.column - 1;
      try { firstError.el.setSelectionRange(pos, pos); } catch (_) {}
    }
    showToast(`${firstError.label}: ${firstError.err.message}`, 'error', 4500);
    return;
  }

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
    tableBody.innerHTML = renderTableSkeleton(8);
    allDocuments = [];
    allAvailableFields = [];
    selectedDocIds.clear();
    updateBulkBar();
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

    // Apply any active quick filters to newly appended rows.
    if (Object.values(quickFilters).some((v) => v && v.trim())) {
      applyQuickFilters();
    }

    // Render alternative views
    renderCurrentView(dbName, collectionName);

    // Ensure table header is rendered
    if (tableFields.length > 0 && tableHeader.innerHTML.trim() === '') {
      renderTableHeader();
    }

    // Pagination
    const jumpEl = document.getElementById('paginationJump');
    if (hasMore) {
      pagination.style.display = 'flex';
      document.getElementById('loadMoreBtn').style.display = 'block';
      const hasActiveQuery = currentSearchTerm || currentFilter;
      if (hasActiveQuery) {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ${formatCount(totalCount)} results`;
      } else {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ~${formatCount(totalCount)}`;
      }
      if (jumpEl) jumpEl.style.display = 'flex';
    } else {
      pagination.style.display = allDocuments.length > 0 ? 'flex' : 'none';
      document.getElementById('loadMoreBtn').style.display = 'none';
      const hasActiveQuery = currentSearchTerm || currentFilter;
      if (hasActiveQuery) {
        document.getElementById('paginationInfo').textContent = `Showing all ${allDocuments.length} result${allDocuments.length !== 1 ? 's' : ''}`;
      } else {
        document.getElementById('paginationInfo').textContent = `Showing all ${allDocuments.length} documents`;
      }
      if (jumpEl) jumpEl.style.display = 'none';
    }

    if (documents.length === 0 && !cursor) {
      const filterEl = document.getElementById('queryFilter');
      const searchEl = document.getElementById('searchInput');
      const hasFilter = (filterEl && filterEl.value.trim()) || (searchEl && searchEl.value.trim());
      const empty = hasFilter
        ? renderEmptyState({
            title: 'No matching documents',
            message: 'Nothing in this collection matches your filter or search. Try widening the criteria or clearing them.',
            actions: [
              { id: 'clearFilter', label: 'Clear filter', primary: true },
            ],
          })
        : renderEmptyState({
            icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
            title: 'This collection is empty',
            message: 'Add the first document to see it here. You can also import a JSON or CSV file.',
            actions: [
              { id: 'addDoc', label: 'Add document', primary: true },
              { id: 'importDocs', label: 'Import' },
            ],
          });
      tableBody.innerHTML = `<tr><td colspan="100" style="padding:0">${empty}</td></tr>`;
      tableBody.querySelectorAll('[data-empty-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.emptyAction;
          if (id === 'clearFilter') {
            if (filterEl) filterEl.value = '';
            if (searchEl) searchEl.value = '';
            document.getElementById('queryRunBtn')?.click();
          } else if (id === 'addDoc') {
            document.getElementById('addDocBtn')?.click();
          } else if (id === 'importDocs') {
            document.getElementById('importBtn')?.click();
          }
        });
      });
    }
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="100">${renderEmptyState({
      icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      title: 'Could not load documents',
      message: err.message,
    })}</td></tr>`;
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

// ─── Quick filter row (per-column type-to-filter, client side) ────────────────

const quickFilters = {}; // { field: 'substring' }

function renderQuickFilterRow() {
  const row = document.getElementById('tableQuickFilterRow');
  if (!row) return;
  if (!tableFields.length) { row.innerHTML = ''; return; }
  const blank = '<th class="th-select"></th>';
  const cells = tableFields
    .map((f) => {
      const id = `qf-${sanitizeId(f)}`;
      const v = quickFilters[f] || '';
      return `<th class="quick-filter-cell">
        <input type="search" class="quick-filter-input" id="${id}" data-field="${escapeHtml(f)}" placeholder="filter…" value="${escapeHtml(v)}" autocomplete="off" spellcheck="false">
      </th>`;
    })
    .join('');
  row.innerHTML = blank + cells + '<th></th><th class="quick-filter-clear-cell">' +
    (Object.keys(quickFilters).some((k) => quickFilters[k])
      ? `<button class="btn btn-sm btn-ghost quick-filter-clear-all" title="Clear all column filters">Clear</button>`
      : '') +
    '</th>';

  row.querySelectorAll('.quick-filter-input').forEach((input) => {
    let timer = null;
    input.addEventListener('input', () => {
      const field = input.dataset.field;
      quickFilters[field] = input.value;
      if (!input.value) delete quickFilters[field];
      clearTimeout(timer);
      timer = setTimeout(applyQuickFilters, 120);
    });
  });
  row.querySelector('.quick-filter-clear-all')?.addEventListener('click', () => {
    Object.keys(quickFilters).forEach((k) => delete quickFilters[k]);
    applyQuickFilters();
    renderQuickFilterRow();
  });
}

function quickFilterMatches(value, needle) {
  if (!needle) return true;
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') {
    try { return JSON.stringify(value).toLowerCase().includes(needle.toLowerCase()); }
    catch { return false; }
  }
  return String(value).toLowerCase().includes(needle.toLowerCase());
}

function applyQuickFilters() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  const activeFilters = Object.entries(quickFilters).filter(([, v]) => v && v.trim());
  let visible = 0;
  let hidden = 0;
  tbody.querySelectorAll('tr').forEach((tr) => {
    if (tr.classList.contains('loading-row') || tr.classList.contains('skeleton-row')) return;
    const docId = tr.dataset.docId;
    if (!docId) return;
    const doc = allDocuments.find((d) => String(d._id?.$oid || d._id) === docId);
    if (!doc) return;
    const passes = activeFilters.every(([f, v]) => quickFilterMatches(doc[f], v));
    tr.style.display = passes ? '' : 'none';
    if (passes) visible++; else hidden++;
  });
  // Reflect filtered count in pagination info if present.
  const info = document.getElementById('paginationInfo');
  if (info && hidden > 0) {
    info.dataset.originalText = info.dataset.originalText || info.textContent;
    info.textContent = `${visible} of ${allDocuments.length} match (${hidden} hidden by column filters)`;
  } else if (info && info.dataset.originalText) {
    info.textContent = info.dataset.originalText;
    delete info.dataset.originalText;
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
  
  const selectAll = `<th class="th-select"><input type="checkbox" id="selectAllDocs" title="Select all"></th>`;
  tableHeader.innerHTML = selectAll + headerCells + '<th>Extra Fields</th><th>Actions</th>';

  renderQuickFilterRow();

  document.getElementById('selectAllDocs')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    if (checked) {
      allDocuments.forEach(doc => {
        const id = doc._id?.$oid || doc._id;
        if (id) selectedDocIds.add(String(id));
      });
    } else {
      selectedDocIds.clear();
    }
    document.querySelectorAll('.doc-select-cb').forEach(cb => { cb.checked = checked; });
    updateBulkBar();
  });
  
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
  tr.dataset.docId = String(docId);

  // Right-click context menu
  tr.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.doc-select-cb')) return; // let checkbox use default menu
    e.preventDefault();
    openRowContextMenu(e, doc, dbName, collectionName);
  });

  // Checkbox column
  const selectTd = document.createElement('td');
  selectTd.className = 'td-select';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'doc-select-cb';
  cb.checked = selectedDocIds.has(String(docId));
  cb.addEventListener('change', () => {
    if (cb.checked) { selectedDocIds.add(String(docId)); }
    else { selectedDocIds.delete(String(docId)); }
    updateBulkBar();
  });
  selectTd.appendChild(cb);
  tr.appendChild(selectTd);

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

// ─── Bulk Operations ─────────────────────────────────────────────────────────

function updateBulkBar() {
  let bar = document.getElementById('bulkBar');
  if (selectedDocIds.size === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulkBar';
    bar.className = 'bulk-bar';
    const tableContainer = document.getElementById('tableViewContainer');
    if (tableContainer) tableContainer.parentNode.insertBefore(bar, tableContainer);
  }

  bar.style.display = 'flex';
  bar.innerHTML = `
    <span class="bulk-count">${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''} selected</span>
    <button class="btn btn-sm btn-danger" id="bulkDeleteBtn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
      Delete Selected
    </button>
    <button class="btn btn-sm btn-ghost" id="bulkClearBtn">Clear Selection</button>
  `;

  document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
    const ok = await ui.confirm({
      title: 'Delete selected documents?',
      message: `This will permanently delete ${selectedDocIds.size} document${selectedDocIds.size !== 1 ? 's' : ''}. This action cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (ok) bulkDelete();
  });

  document.getElementById('bulkClearBtn')?.addEventListener('click', () => {
    selectedDocIds.clear();
    document.querySelectorAll('.doc-select-cb').forEach(cb => { cb.checked = false; });
    const selectAll = document.getElementById('selectAllDocs');
    if (selectAll) selectAll.checked = false;
    updateBulkBar();
  });
}

async function bulkDelete() {
  const ids = Array.from(selectedDocIds);
  const dbName = currentDbName;
  const collectionName = currentCollectionName;
  let deleted = 0;
  let errors = 0;

  showToast(`Deleting ${ids.length} documents...`, 'info', 2000);

  for (const id of ids) {
    try {
      const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) deleted++;
      else errors++;
    } catch {
      errors++;
    }
  }

  selectedDocIds.clear();
  const selectAll = document.getElementById('selectAllDocs');
  if (selectAll) selectAll.checked = false;
  updateBulkBar();

  if (errors > 0) {
    showToast(`Deleted ${deleted} documents, ${errors} failed`, 'warning');
  } else {
    showToast(`Deleted ${deleted} documents`, 'success');
  }

  // Reload
  currentCursor = null;
  currentNextSkip = null;
  allDocuments = [];
  loadDocuments(dbName, collectionName);
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
  if (isReadOnly()) return;
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

  let nextDirection = null; // 'next' | 'prev' | 'down' | null

  const focusAdjacent = (direction) => {
    // Find next editable cell in the same row (Tab) or same column (Enter for non-complex).
    if (!direction) return;
    if (direction === 'next' || direction === 'prev') {
      const row = td.parentElement;
      if (!row) return;
      const cells = Array.from(row.querySelectorAll('td.cell-editable'));
      const idx = cells.indexOf(td);
      if (idx === -1) return;
      const target = direction === 'next' ? cells[idx + 1] : cells[idx - 1];
      if (target) setTimeout(() => target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 0);
    } else if (direction === 'down') {
      const tbody = td.closest('tbody');
      if (!tbody) return;
      const row = td.parentElement;
      const colIdx = Array.from(row.children).indexOf(td);
      const nextRow = row.nextElementSibling;
      if (!nextRow) return;
      const targetCell = nextRow.children[colIdx];
      if (targetCell && targetCell.classList.contains('cell-editable')) {
        setTimeout(() => targetCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 0);
      }
    }
  };

  let isSaving = false;
  const wrappedSave = async () => {
    if (isSaving) return;
    isSaving = true;
    try { await save(); } finally { focusAdjacent(nextDirection); }
  };

  input.addEventListener('blur', wrappedSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isComplex) {
      e.preventDefault();
      nextDirection = e.shiftKey ? null : 'down';
      input.blur();
    } else if (e.key === 'Enter' && isComplex && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      nextDirection = e.shiftKey ? 'prev' : 'next';
      input.blur();
    } else if (e.key === 'Escape') {
      td.innerHTML = originalHtml;
    }
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
    return `<span class="cell-id cell-id-copy" title="Click to copy" data-copy="${value.$oid}">${value.$oid}</span>`;
  }

  if (typeof value === 'object') {
    if (value.$oid) return `<span class="cell-id">${value.$oid}</span>`;
    if (value.$date) return `<span class="cell-value">${new Date(value.$date).toLocaleString()}</span>`;
    const jsonStr = JSON.stringify(value, null, 2);
    const escapedJson = escapeHtml(jsonStr);
    if (Array.isArray(value)) {
      return `<span class="cell-object cell-expandable" title="Click to expand">[${value.length} items]<pre class="cell-expanded-json" style="display:none">${escapedJson}</pre></span>`;
    }
    return `<span class="cell-object cell-expandable" title="Click to expand">{...}<pre class="cell-expanded-json" style="display:none">${escapedJson}</pre></span>`;
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

function openTemplatePickerMenu(anchor, dbName, collectionName) {
  if (!allDocuments.length) {
    showToast('Load some documents first to use them as templates', 'info', 2400);
    return;
  }
  const rect = anchor.getBoundingClientRect();
  const x = rect.right;
  const y = rect.bottom + 4;
  const items = allDocuments.slice(0, 12).map((doc) => {
    const id = String(doc._id?.$oid || doc._id || '').slice(0, 16);
    const fields = Object.keys(doc).filter((k) => k !== '_id').slice(0, 2).join(', ');
    return {
      id: 'tpl-' + id,
      label: id || '(unknown)',
      shortcut: fields,
      action: () => openDocModalFromTemplate(dbName, collectionName, doc),
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    };
  });
  showContextMenu(x - 280, y, [
    { id: 'header', label: 'Use a loaded document as a template', disabled: true },
    { divider: true },
    ...items,
  ]);
}

// Open the new-document modal pre-filled with another doc's contents
// (as a template). _id is stripped so the server assigns a fresh one.
function openDocModalFromTemplate(dbName, collectionName, sourceDoc) {
  if (isReadOnly()) {
    showToast('Read-only mode — toggle off to insert.', 'warning');
    return;
  }
  const clone = JSON.parse(JSON.stringify(sourceDoc));
  delete clone._id;
  // Open the regular new-doc modal then overwrite the editor body so the
  // schema-derived form is bypassed in favor of the template JSON.
  openDocModal(dbName, collectionName, null).then(() => {
    const formContainer = document.getElementById('docFormContainer');
    const formToggle = document.getElementById('formToggle');
    if (formContainer) formContainer.style.display = 'none';
    if (formToggle) formToggle.style.display = 'none';
    const wrap = cmEditors['docEditor']?.getWrapperElement();
    if (wrap) wrap.style.display = '';
    setEditorValue('docEditor', JSON.stringify(clone, null, 2));
    useFormMode = false;
    showToast('Pre-filled from template — edit and save', 'info', 2200);
  });
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

    recordRecentDocument(dbName, collectionName, docId, data.document);

    // Pin button reflects current pinned state
    const pinBtn = document.getElementById('pinDocBtn');
    const pinIcon = document.getElementById('pinDocIcon');
    const pinLabel = document.getElementById('pinDocLabel');
    function refreshPinUi() {
      const pinned = isDocumentPinned(dbName, collectionName, docId);
      if (pinBtn) pinBtn.classList.toggle('btn-active', pinned);
      if (pinIcon) pinIcon.setAttribute('fill', pinned ? 'currentColor' : 'none');
      if (pinLabel) pinLabel.textContent = pinned ? 'Pinned' : 'Pin';
    }
    refreshPinUi();
    pinBtn?.addEventListener('click', () => {
      const nowPinned = toggleDocumentPin(dbName, collectionName, docId, data.document);
      refreshPinUi();
      showToast(nowPinned ? 'Pinned to top of recents' : 'Unpinned', 'success', 1600);
    });

    document.getElementById('shareDocBtn')?.addEventListener('click', async () => {
      const url = window.location.origin + window.location.pathname;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Document link copied to clipboard', 'success', 2200);
      } catch {
        showToast('Could not access clipboard', 'error');
      }
    });

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

    // J / K navigation between recently viewed docs in the same collection.
    setupDocPageJkNav(dbName, collectionName, docId);
  } catch (err) {
    treeEl.innerHTML = `<div style="color: var(--danger);">Error: ${err.message}</div>`;
  }
}

function setupDocPageJkNav(dbName, collectionName, currentId) {
  const cleanId = String(currentId).replace(/^"|"$/g, '');
  const handler = (e) => {
    // Ignore if user is typing in an input/textarea/contenteditable.
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    if (k !== 'j' && k !== 'k') return;

    const recents = getRecentDocuments(dbName, collectionName);
    if (recents.length < 2) {
      showToast('Open a few documents first to enable J/K navigation', 'info', 2200);
      return;
    }
    const idx = recents.findIndex((r) => r.id === cleanId);
    if (idx === -1) return;
    const nextIdx = k === 'j' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= recents.length) {
      showToast(k === 'j' ? 'End of recents' : 'Top of recents', 'info', 1500);
      return;
    }
    e.preventDefault();
    const target = recents[nextIdx];
    window.location.href = `/browse/${encodeURIComponent(target.db)}/${encodeURIComponent(target.collection)}/${encodeURIComponent(target.id)}`;
  };
  document.addEventListener('keydown', handler);
}

function renderJsonTree(obj, indent = 0, path = '') {
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
    const items = obj.map((item, i) => {
      const childPath = path ? `${path}.${i}` : String(i);
      const rendered = renderJsonTree(item, indent + 1, childPath);
      return `${innerSpaces}${rendered}`;
    }).join(',\n');
    return `<span class="json-bracket">[</span>\n${items}\n${spaces}<span class="json-bracket">]</span>`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return '<span class="json-bracket">{}</span>';

  const entries = keys.map(key => {
    const childPath = path ? `${path}.${key}` : key;
    const rendered = renderJsonTree(obj[key], indent + 1, childPath);
    return `${innerSpaces}<span class="json-key" data-path="${escapeHtml(childPath)}" title="Click to copy field path">"${escapeHtml(key)}"</span>: ${rendered}`;
  }).join(',\n');

  return `<span class="json-bracket">{</span>\n${entries}\n${spaces}<span class="json-bracket">}</span>`;
}

// Single delegated listener for copy-on-click on any json key in the doc page.
document.addEventListener('click', async (e) => {
  const key = e.target.closest('.json-key[data-path]');
  if (!key) return;
  const path = key.dataset.path;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    showToast(`Copied field path: ${path}`, 'success', 1800);
    key.classList.add('json-key-copied');
    setTimeout(() => key.classList.remove('json-key-copied'), 600);
  } catch {
    showToast('Could not access clipboard', 'error');
  }
});

let editOriginalDoc = null;

function openEditModal(doc) {
  const modal = document.getElementById('editModal');
  const editorEl = document.getElementById('editDocEditor');

  // Initialize CodeMirror if not yet created
  if (!cmEditors['editDocEditor'] && editorEl) {
    createJsonEditor('editDocEditor');
  }

  editOriginalDoc = JSON.parse(JSON.stringify(doc));
  setEditorValue('editDocEditor', JSON.stringify(doc, null, 2));
  document.getElementById('editError').style.display = 'none';
  const diffView = document.getElementById('diffView');
  if (diffView) { diffView.style.display = 'none'; diffView.innerHTML = ''; }
  const diffToggle = document.getElementById('editDiffToggle');
  if (diffToggle) diffToggle.textContent = 'Preview Changes';
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

  const diffToggle = document.getElementById('editDiffToggle');

  const closeModal = () => modal.style.display = 'none';

  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  diffToggle?.addEventListener('click', () => {
    const diffView = document.getElementById('diffView');
    if (!diffView) return;

    if (diffView.style.display !== 'none') {
      diffView.style.display = 'none';
      diffToggle.textContent = 'Preview Changes';
      return;
    }

    try {
      const currentText = getEditorValue('editDocEditor');
      const currentDoc = JSON.parse(currentText);
      const originalText = JSON.stringify(editOriginalDoc, null, 2);
      const newText = JSON.stringify(currentDoc, null, 2);

      diffView.innerHTML = renderDiff(originalText, newText);
      diffView.style.display = 'block';
      diffToggle.textContent = 'Hide Diff';
    } catch (e) {
      diffView.innerHTML = `<div style="color:var(--danger);padding:12px">Invalid JSON: ${e.message}</div>`;
      diffView.style.display = 'block';
    }
  });

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

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      resolve(file || null);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

function exportSavedQueries(dbName, collectionName) {
  const queries = getSavedQueries(dbName, collectionName);
  if (!queries.length) {
    showToast('Nothing to export — save a query first.', 'warning');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonFile(`mongodb-dashboard-queries-${dbName}-${collectionName}-${stamp}.json`, {
    app: 'mongodb-dashboard',
    kind: 'saved-queries',
    version: 1,
    db: dbName,
    collection: collectionName,
    exportedAt: new Date().toISOString(),
    queries,
  });
  showToast(`Exported ${queries.length} saved quer${queries.length === 1 ? 'y' : 'ies'}`, 'success');
}

async function importSavedQueries(dbName, collectionName) {
  const file = await pickJsonFile();
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.queries;
    if (!Array.isArray(incoming)) throw new Error('File is not a saved-queries export');

    const cleaned = incoming
      .map((q) => {
        if (!q || typeof q !== 'object') return null;
        const name = typeof q.name === 'string' && q.name.trim() ? q.name : 'Imported query';
        return {
          name,
          filter: typeof q.filter === 'string' ? q.filter : '',
          projection: typeof q.projection === 'string' ? q.projection : '',
          sort: typeof q.sort === 'string' ? q.sort : '',
          limit: Number.isFinite(q.limit) ? q.limit : 50,
          skip: Number.isFinite(q.skip) ? q.skip : 0,
        };
      })
      .filter(Boolean);
    if (!cleaned.length) {
      showToast('File contained no usable queries.', 'warning');
      return;
    }

    const sourceLabel =
      data.db && data.collection ? ` from ${data.db}.${data.collection}` : '';
    const ok = await ui.confirm({
      title: `Import ${cleaned.length} quer${cleaned.length === 1 ? 'y' : 'ies'}?`,
      message: `These will be added to your saved queries for ${dbName}.${collectionName}${sourceLabel}.`,
      confirmText: 'Import',
    });
    if (!ok) return;

    const existing = getSavedQueries(dbName, collectionName);
    const merged = [...cleaned, ...existing].slice(0, 50);
    localStorage.setItem(savedQueriesKey(dbName, collectionName), JSON.stringify(merged));
    showToast(`Imported ${cleaned.length} quer${cleaned.length === 1 ? 'y' : 'ies'}`, 'success');
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

function exportSavedPipelines(dbName, collectionName) {
  const pipelines = getSavedPipelines(dbName, collectionName);
  if (!pipelines.length) {
    showToast('Nothing to export — save a pipeline first.', 'warning');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonFile(`mongodb-dashboard-pipelines-${dbName}-${collectionName}-${stamp}.json`, {
    app: 'mongodb-dashboard',
    kind: 'saved-pipelines',
    version: 1,
    db: dbName,
    collection: collectionName,
    exportedAt: new Date().toISOString(),
    pipelines,
  });
  showToast(`Exported ${pipelines.length} pipeline${pipelines.length === 1 ? '' : 's'}`, 'success');
}

async function importSavedPipelines(dbName, collectionName) {
  const file = await pickJsonFile();
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.pipelines;
    if (!Array.isArray(incoming)) throw new Error('File is not a saved-pipelines export');
    const cleaned = incoming
      .map((p) => {
        if (!p || typeof p !== 'object' || !Array.isArray(p.stages)) return null;
        return {
          name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Imported pipeline',
          stages: p.stages,
        };
      })
      .filter(Boolean);
    if (!cleaned.length) {
      showToast('File contained no usable pipelines.', 'warning');
      return;
    }

    const ok = await ui.confirm({
      title: `Import ${cleaned.length} pipeline${cleaned.length === 1 ? '' : 's'}?`,
      message: `These will be added to your saved pipelines for ${dbName}.${collectionName}.`,
      confirmText: 'Import',
    });
    if (!ok) return;

    const key = `mongodb_dashboard_pipelines_${dbName}_${collectionName}`;
    const existing = getSavedPipelines(dbName, collectionName);
    const merged = [...cleaned, ...existing].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(merged));
    showToast(`Imported ${cleaned.length} pipeline${cleaned.length === 1 ? '' : 's'}`, 'success');
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
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

  // Toolbar (export / import) handlers
  dropdown.querySelectorAll('[data-action="export-queries"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportSavedQueries(dbName, collectionName);
    });
  });
  dropdown.querySelectorAll('[data-action="import-queries"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      importSavedQueries(dbName, collectionName).then(() => {
        renderSavedQueriesDropdown(dbName, collectionName, dropdown);
      });
    });
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
  const toolbar = `
    <div class="saved-queries-toolbar">
      <button class="saved-queries-action" data-action="export-queries" title="Export saved queries to JSON">Export</button>
      <button class="saved-queries-action" data-action="import-queries" title="Import saved queries from JSON">Import</button>
    </div>`;
  if (queries.length === 0)
    return toolbar + '<div class="saved-queries-empty">No saved queries yet.</div>';
  return (
    toolbar +
    queries.map((q, i) => `
      <div class="saved-query-item" data-index="${i}">
        <div class="saved-query-info">
          <div class="saved-query-name">${escapeHtml(q.name)}</div>
          <div class="saved-query-preview">${escapeHtml(q.filter || '{}')}</div>
        </div>
        <button class="saved-query-delete" data-index="${i}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('')
  );
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

      ${buildStorageChart(data)}

      <div style="margin-top:24px">
        <h3 style="font-size:14px;margin-bottom:12px;color:var(--text-primary)">Field Type Distribution</h3>
        <div id="fieldTypeChart" class="stats-chart-placeholder">
          <button class="btn btn-ghost btn-sm" id="analyzeFieldTypes">Analyze Field Types</button>
        </div>
      </div>
    `;

    document.getElementById('analyzeFieldTypes')?.addEventListener('click', async () => {
      await loadFieldTypeDistribution(dbName, collectionName);
    });
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);padding:20px">Error: ${err.message}</div>`;
  }
}

function buildStorageChart(data) {
  const total = (data.storageSize || 0) + (data.totalIndexSize || 0) + (data.freeStorageSize || 0);
  if (total === 0) return '';

  const dataPct = ((data.storageSize || 0) / total * 100).toFixed(1);
  const indexPct = ((data.totalIndexSize || 0) / total * 100).toFixed(1);
  const freePct = ((data.freeStorageSize || 0) / total * 100).toFixed(1);

  return `
    <div style="margin-top:24px">
      <h3 style="font-size:14px;margin-bottom:12px;color:var(--text-primary)">Storage Breakdown</h3>
      <div class="storage-bar">
        <div class="storage-bar-seg storage-bar-data" style="width:${Math.max(1, dataPct)}%" title="Data: ${formatBytes(data.storageSize)}"></div>
        <div class="storage-bar-seg storage-bar-index" style="width:${Math.max(1, indexPct)}%" title="Indexes: ${formatBytes(data.totalIndexSize)}"></div>
        <div class="storage-bar-seg storage-bar-free" style="width:${Math.max(1, freePct)}%" title="Free: ${formatBytes(data.freeStorageSize)}"></div>
      </div>
      <div class="storage-legend">
        <span class="storage-legend-item"><span class="storage-dot storage-dot-data"></span>Data ${dataPct}%</span>
        <span class="storage-legend-item"><span class="storage-dot storage-dot-index"></span>Indexes ${indexPct}%</span>
        <span class="storage-legend-item"><span class="storage-dot storage-dot-free"></span>Free ${freePct}%</span>
      </div>
    </div>`;
}

async function loadFieldTypeDistribution(dbName, collectionName) {
  const container = document.getElementById('fieldTypeChart');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch(`/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/schema-analysis?sampleSize=200`);
    const schema = await res.json();
    if (!res.ok) throw new Error(schema.error);

    const typeCounts = {};
    const fields = schema.fields || {};
    Object.values(fields).forEach(f => {
      Object.entries(f.types || {}).forEach(([t, count]) => {
        typeCounts[t] = (typeCounts[t] || 0) + count;
      });
    });

    const entries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxCount = entries[0]?.[1] || 1;

    const typeColors = {
      String: '#3c82f6', Number: '#f59e0b', Boolean: '#10b981', ObjectId: '#8b5cf6',
      Date: '#ec4899', Array: '#06b6d4', Object: '#6366f1', Null: '#6b7280',
      Double: '#f97316', Int32: '#eab308', Long: '#84cc16', Decimal128: '#14b8a6',
    };

    if (entries.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No fields found in sample.</div>';
      return;
    }

    container.innerHTML = `
      <div class="field-type-bars">
        ${entries.map(([type, count]) => `
          <div class="field-type-row">
            <span class="field-type-label">${escapeHtml(type)}</span>
            <div class="field-type-bar-wrap">
              <div class="field-type-bar" style="width:${(count / maxCount * 100)}%;background:${typeColors[type] || 'var(--accent)'}"></div>
            </div>
            <span class="field-type-count">${count} field${count !== 1 ? 's' : ''}</span>
          </div>
        `).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);font-size:13px">Error: ${err.message}</div>`;
  }
}

// ─── Change Stream Viewer ─────────────────────────────────────────────────────

let csEventSource = null;
let csEventCount = 0;

function initChangeStreamPanel(dbName, collectionName) {
  const toggle = document.getElementById('csToggle');
  const clearBtn = document.getElementById('csClear');
  const opFilter = document.getElementById('csOpFilter');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    if (csEventSource) {
      stopChangeStream();
    } else {
      startChangeStream(dbName, collectionName);
    }
  });

  clearBtn?.addEventListener('click', () => {
    csEventCount = 0;
    const container = document.getElementById('csEvents');
    if (container) {
      container.innerHTML = `
        <div class="cs-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <p>Click <strong>Start Watching</strong> to listen for real-time changes on this collection.</p>
          <p class="cs-hint">Requires a replica set or MongoDB Atlas. Changes from inserts, updates, and deletes will appear here live.</p>
        </div>`;
    }
  });

  opFilter?.addEventListener('change', () => {
    if (csEventSource) {
      stopChangeStream();
      startChangeStream(dbName, collectionName);
    }
  });
}

function startChangeStream(dbName, collectionName) {
  const toggle = document.getElementById('csToggle');
  const opFilter = document.getElementById('csOpFilter');
  const container = document.getElementById('csEvents');
  if (!container) return;

  const opType = opFilter?.value || 'all';
  const url = `/api/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/watch?operationType=${opType}`;

  // Clear empty state on first start
  if (csEventCount === 0) {
    container.innerHTML = '';
  }

  csEventSource = new EventSource(url);
  toggle.textContent = 'Stop Watching';
  toggle.classList.remove('btn-primary');
  toggle.classList.add('btn-danger');

  // Add status indicator
  const statusEl = document.createElement('div');
  statusEl.className = 'cs-status cs-status-live';
  statusEl.id = 'csStatus';
  statusEl.innerHTML = '<span class="cs-status-dot"></span> Watching for changes...';
  container.prepend(statusEl);

  csEventSource.addEventListener('change', (e) => {
    try {
      const data = JSON.parse(e.data);
      csEventCount++;
      appendChangeEvent(container, data);
    } catch (err) {
      console.error('Failed to parse change event:', err);
    }
  });

  csEventSource.addEventListener('error', (e) => {
    const statusDot = document.getElementById('csStatus');
    if (statusDot) {
      statusDot.className = 'cs-status cs-status-error';
      statusDot.innerHTML = '<span class="cs-status-dot"></span> Connection lost. Change streams require a replica set.';
    }
    stopChangeStream(true);
  });
}

function stopChangeStream(keepStatus) {
  if (csEventSource) {
    csEventSource.close();
    csEventSource = null;
  }
  const toggle = document.getElementById('csToggle');
  if (toggle) {
    toggle.textContent = 'Start Watching';
    toggle.classList.remove('btn-danger');
    toggle.classList.add('btn-primary');
  }
  if (!keepStatus) {
    const statusEl = document.getElementById('csStatus');
    if (statusEl) {
      statusEl.className = 'cs-status cs-status-stopped';
      statusEl.innerHTML = '<span class="cs-status-dot"></span> Stopped';
    }
  }
}

function appendChangeEvent(container, data) {
  const el = document.createElement('div');
  el.className = `cs-event cs-event-${data.operationType || 'unknown'}`;

  const opBadge = {
    insert: { label: 'INSERT', cls: 'cs-badge-insert' },
    update: { label: 'UPDATE', cls: 'cs-badge-update' },
    replace: { label: 'REPLACE', cls: 'cs-badge-update' },
    delete: { label: 'DELETE', cls: 'cs-badge-delete' },
    drop: { label: 'DROP', cls: 'cs-badge-delete' },
    rename: { label: 'RENAME', cls: 'cs-badge-update' },
  }[data.operationType] || { label: (data.operationType || 'EVENT').toUpperCase(), cls: 'cs-badge-default' };

  const time = data.wallTime ? new Date(data.wallTime).toLocaleTimeString() : new Date().toLocaleTimeString();
  const docKey = data.documentKey?._id?.$oid || data.documentKey?._id || '';

  let details = '';
  if (data.fullDocument) {
    details = `<pre class="cs-event-doc">${escapeHtml(JSON.stringify(data.fullDocument, null, 2))}</pre>`;
  } else if (data.updateDescription) {
    const parts = [];
    if (data.updateDescription.updatedFields) {
      parts.push(`Updated: ${Object.keys(data.updateDescription.updatedFields).join(', ')}`);
    }
    if (data.updateDescription.removedFields?.length) {
      parts.push(`Removed: ${data.updateDescription.removedFields.join(', ')}`);
    }
    details = `<div class="cs-event-update-info">${escapeHtml(parts.join(' | '))}</div>`;
  }

  el.innerHTML = `
    <div class="cs-event-header">
      <span class="cs-badge ${opBadge.cls}">${opBadge.label}</span>
      <span class="cs-event-key" title="${escapeHtml(docKey)}">${docKey ? escapeHtml(docKey.substring(0, 24)) : '—'}</span>
      <span class="cs-event-time">${time}</span>
      <button class="cs-event-toggle btn-ghost" title="Toggle details">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
    <div class="cs-event-details" style="display:none">${details}</div>
  `;

  el.querySelector('.cs-event-toggle')?.addEventListener('click', () => {
    const det = el.querySelector('.cs-event-details');
    if (det) det.style.display = det.style.display === 'none' ? 'block' : 'none';
  });

  // Insert after status element
  const statusEl = document.getElementById('csStatus');
  if (statusEl && statusEl.nextSibling) {
    container.insertBefore(el, statusEl.nextSibling);
  } else {
    container.appendChild(el);
  }

  // Limit to last 200 events
  const events = container.querySelectorAll('.cs-event');
  if (events.length > 200) {
    events[events.length - 1].remove();
  }
}

// ─── Diff Viewer ──────────────────────────────────────────────────────────────

function renderDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple line-by-line diff using LCS
  const lcs = computeLcs(oldLines, newLines);
  const result = [];
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length && oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
      result.push({ type: 'same', line: oldLines[oi] });
      oi++; ni++; li++;
    } else if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
      result.push({ type: 'add', line: newLines[ni] });
      ni++;
    } else if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
      result.push({ type: 'remove', line: oldLines[oi] });
      oi++;
    }
  }

  if (result.every(r => r.type === 'same')) {
    return '<div class="diff-no-changes">No changes detected</div>';
  }

  let lineNum = 0;
  const html = result.map(r => {
    const prefix = r.type === 'add' ? '+' : r.type === 'remove' ? '-' : ' ';
    const cls = r.type === 'add' ? 'diff-line-add' : r.type === 'remove' ? 'diff-line-remove' : 'diff-line-same';
    if (r.type !== 'remove') lineNum++;
    return `<div class="${cls}"><span class="diff-prefix">${prefix}</span><span class="diff-text">${escapeHtml(r.line)}</span></div>`;
  }).join('');

  return `<div class="diff-header">Changes Preview</div>${html}`;
}

function computeLcs(a, b) {
  const m = a.length, n = b.length;
  // Optimization: limit to reasonable size
  if (m * n > 1000000) {
    // Fallback: just find common lines in order
    const result = [];
    let j = 0;
    for (let i = 0; i < m && j < n; i++) {
      for (let k = j; k < n; k++) {
        if (a[i] === b[k]) {
          result.push(a[i]);
          j = k + 1;
          break;
        }
      }
    }
    return result;
  }

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

// ─── SQL to MQL Translator ────────────────────────────────────────────────────

function initSqlPanel(dbName, collectionName) {
  const convertBtn = document.getElementById('sqlConvertBtn');
  const runBtn = document.getElementById('sqlRunBtn');
  const sqlInput = document.getElementById('sqlInput');
  const sqlOutput = document.getElementById('sqlOutput');
  if (!convertBtn || !sqlInput) return;

  // Replace "collection" in example buttons with actual collection name
  document.querySelectorAll('.sql-example-btn').forEach(btn => {
    const sql = btn.dataset.sql.replace(/collection/g, collectionName);
    btn.dataset.sql = sql;
    btn.addEventListener('click', () => {
      sqlInput.value = sql;
      convertBtn.click();
    });
  });

  convertBtn.addEventListener('click', () => {
    try {
      const result = sqlToMql(sqlInput.value.trim(), collectionName);
      sqlOutput.value = result.code;
      runBtn.style.display = result.canRun ? '' : 'none';
      runBtn._mqlQuery = result.canRun ? result : null;
    } catch (err) {
      sqlOutput.value = `// Error: ${err.message}`;
      runBtn.style.display = 'none';
    }
  });

  runBtn.addEventListener('click', async () => {
    const mql = runBtn._mqlQuery;
    if (!mql) return;

    if (mql.type === 'find') {
      const queryInput = document.getElementById('queryInput') || document.querySelector('[name="query"]');
      if (queryInput) {
        const tabBtn = document.querySelector('.collection-tab[data-tab="documents"]');
        tabBtn?.click();
        queryInput.value = JSON.stringify(mql.filter || {});
        document.getElementById('runQuery')?.click();
      }
    } else if (mql.type === 'aggregate') {
      const tabBtn = document.querySelector('.collection-tab[data-tab="aggregation"]');
      tabBtn?.click();
    }
  });

  // Convert on Ctrl/Cmd + Enter
  sqlInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      convertBtn.click();
    }
  });
}

function sqlToMql(sql, collectionName) {
  if (!sql) throw new Error('Please enter a SQL query');

  const normalized = sql.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  if (upper.startsWith('SELECT')) return parseSqlSelect(normalized, collectionName);
  if (upper.startsWith('INSERT')) return parseSqlInsert(normalized, collectionName);
  if (upper.startsWith('UPDATE')) return parseSqlUpdate(normalized, collectionName);
  if (upper.startsWith('DELETE')) return parseSqlDelete(normalized, collectionName);

  throw new Error('Unsupported SQL statement. Supported: SELECT, INSERT, UPDATE, DELETE');
}

function parseSqlSelect(sql, collName) {
  const upper = sql.toUpperCase();

  // Extract parts using regex
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+/i);
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|\s+HAVING|\s*$)/i);
  const groupMatch = sql.match(/GROUP\s+BY\s+(.*?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
  const havingMatch = sql.match(/HAVING\s+(.*?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*$)/i);
  const orderMatch = sql.match(/ORDER\s+BY\s+(.*?)(?:\s+LIMIT|\s*$)/i);
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);

  const fields = selectMatch ? selectMatch[1].trim() : '*';
  const collection = fromMatch ? fromMatch[1] : collName;

  // Check if this is an aggregation (GROUP BY or aggregate functions)
  const hasAggFuncs = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(fields);
  const hasGroupBy = !!groupMatch;

  if (hasAggFuncs || hasGroupBy) {
    return buildAggregation(fields, collection, whereMatch, groupMatch, havingMatch, orderMatch, limitMatch);
  }

  // Simple find query
  const projection = {};
  if (fields !== '*') {
    fields.split(',').map(f => f.trim()).forEach(f => {
      const alias = f.match(/\s+AS\s+(\w+)/i);
      const name = f.replace(/\s+AS\s+\w+/i, '').trim();
      projection[name] = 1;
    });
  }

  const filter = whereMatch ? parseWhereClause(whereMatch[1].trim()) : {};

  const sort = {};
  if (orderMatch) {
    orderMatch[1].split(',').forEach(part => {
      const p = part.trim();
      const desc = /\s+DESC$/i.test(p);
      const field = p.replace(/\s+(ASC|DESC)$/i, '').trim();
      sort[field] = desc ? -1 : 1;
    });
  }

  const limit = limitMatch ? parseInt(limitMatch[1]) : null;
  const skip = offsetMatch ? parseInt(offsetMatch[1]) : null;

  let code = `db.${collection}.find(\n  ${JSON.stringify(filter, null, 2)}`;
  if (Object.keys(projection).length > 0) {
    code += `,\n  ${JSON.stringify(projection, null, 2)}`;
  }
  code += '\n)';
  if (Object.keys(sort).length > 0) code += `.sort(${JSON.stringify(sort)})`;
  if (skip) code += `.skip(${skip})`;
  if (limit) code += `.limit(${limit})`;

  return { type: 'find', code, filter, projection, sort, limit, skip, canRun: true };
}

function buildAggregation(fields, collection, whereMatch, groupMatch, havingMatch, orderMatch, limitMatch) {
  const pipeline = [];

  // $match stage from WHERE
  if (whereMatch) {
    pipeline.push({ $match: parseWhereClause(whereMatch[1].trim()) });
  }

  // Parse GROUP BY and aggregate fields
  const groupFields = groupMatch ? groupMatch[1].split(',').map(f => f.trim()) : [];
  const groupId = {};
  groupFields.forEach(f => { groupId[f] = `$${f}`; });

  const accumulator = {};
  fields.split(',').map(f => f.trim()).forEach(f => {
    const aggMatch = f.match(/(\w+)\s*\(\s*(\*|\w+)\s*\)\s*(?:AS\s+(\w+))?/i);
    if (aggMatch) {
      const func = aggMatch[1].toUpperCase();
      const arg = aggMatch[2];
      const alias = aggMatch[3] || `${func.toLowerCase()}_${arg}`;
      if (func === 'COUNT') accumulator[alias] = arg === '*' ? { $sum: 1 } : { $sum: { $cond: [{ $ne: [`$${arg}`, null] }, 1, 0] } };
      else if (func === 'SUM') accumulator[alias] = { $sum: `$${arg}` };
      else if (func === 'AVG') accumulator[alias] = { $avg: `$${arg}` };
      else if (func === 'MIN') accumulator[alias] = { $min: `$${arg}` };
      else if (func === 'MAX') accumulator[alias] = { $max: `$${arg}` };
    }
  });

  pipeline.push({
    $group: {
      _id: Object.keys(groupId).length === 1 ? Object.values(groupId)[0] : (Object.keys(groupId).length > 0 ? groupId : null),
      ...accumulator
    }
  });

  // $match from HAVING
  if (havingMatch) {
    pipeline.push({ $match: parseWhereClause(havingMatch[1].trim()) });
  }

  // $sort from ORDER BY
  if (orderMatch) {
    const sort = {};
    orderMatch[1].split(',').forEach(part => {
      const p = part.trim();
      const desc = /\s+DESC$/i.test(p);
      const field = p.replace(/\s+(ASC|DESC)$/i, '').trim();
      sort[field] = desc ? -1 : 1;
    });
    pipeline.push({ $sort: sort });
  }

  // $limit
  if (limitMatch) {
    pipeline.push({ $limit: parseInt(limitMatch[1]) });
  }

  const code = `db.${collection}.aggregate(${JSON.stringify(pipeline, null, 2)})`;
  return { type: 'aggregate', code, pipeline, canRun: false };
}

function parseWhereClause(where) {
  // Handle AND/OR
  const orParts = splitOnKeyword(where, ' OR ');
  if (orParts.length > 1) {
    return { $or: orParts.map(p => parseWhereClause(p.trim())) };
  }

  const andParts = splitOnKeyword(where, ' AND ');
  if (andParts.length > 1) {
    const conditions = andParts.map(p => parseWhereClause(p.trim()));
    const merged = {};
    conditions.forEach(c => Object.assign(merged, c));
    return merged;
  }

  // Parse single condition
  return parseSingleCondition(where.trim());
}

function splitOnKeyword(str, keyword) {
  const upper = str.toUpperCase();
  const parts = [];
  let start = 0;
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    else if (depth === 0 && upper.substring(i, i + keyword.length) === keyword.toUpperCase()) {
      parts.push(str.substring(start, i));
      start = i + keyword.length;
      i += keyword.length - 1;
    }
  }
  parts.push(str.substring(start));
  return parts;
}

function parseSingleCondition(cond) {
  // IN
  let m = cond.match(/^(\w+)\s+IN\s*\((.*)\)$/i);
  if (m) return { [m[1]]: { $in: m[2].split(',').map(v => parseValue(v.trim())) } };

  // NOT IN
  m = cond.match(/^(\w+)\s+NOT\s+IN\s*\((.*)\)$/i);
  if (m) return { [m[1]]: { $nin: m[2].split(',').map(v => parseValue(v.trim())) } };

  // BETWEEN
  m = cond.match(/^(\w+)\s+BETWEEN\s+(.*?)\s+AND\s+(.*?)$/i);
  if (m) return { [m[1]]: { $gte: parseValue(m[2].trim()), $lte: parseValue(m[3].trim()) } };

  // LIKE
  m = cond.match(/^(\w+)\s+LIKE\s+'(.*)'$/i);
  if (m) {
    let pattern = m[2].replace(/%/g, '.*').replace(/_/g, '.');
    return { [m[1]]: { $regex: `^${pattern}$`, $options: 'i' } };
  }

  // IS NULL / IS NOT NULL
  m = cond.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
  if (m) return { [m[1]]: { $ne: null } };
  m = cond.match(/^(\w+)\s+IS\s+NULL$/i);
  if (m) return { [m[1]]: null };

  // Comparison operators
  m = cond.match(/^(\w+)\s*(!=|<>|>=|<=|>|<|=)\s*(.+)$/);
  if (m) {
    const field = m[1];
    const op = m[2];
    const val = parseValue(m[3].trim());
    const opMap = { '=': '$eq', '!=': '$ne', '<>': '$ne', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte' };
    if (op === '=') return { [field]: val };
    return { [field]: { [opMap[op]]: val } };
  }

  return {};
}

function parseValue(val) {
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1);
  }
  if (val.toUpperCase() === 'TRUE') return true;
  if (val.toUpperCase() === 'FALSE') return false;
  if (val.toUpperCase() === 'NULL') return null;
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

function parseSqlInsert(sql, collName) {
  const m = sql.match(/INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/i);
  if (!m) throw new Error('Invalid INSERT syntax. Use: INSERT INTO table (col1, col2) VALUES (val1, val2)');

  const collection = m[1];
  const cols = m[2].split(',').map(c => c.trim());
  const vals = m[3].split(',').map(v => parseValue(v.trim()));

  const doc = {};
  cols.forEach((c, i) => { doc[c] = vals[i] !== undefined ? vals[i] : null; });

  const code = `db.${collection}.insertOne(${JSON.stringify(doc, null, 2)})`;
  return { type: 'insertOne', code, canRun: false };
}

function parseSqlUpdate(sql, collName) {
  const m = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/i);
  if (!m) throw new Error('Invalid UPDATE syntax. Use: UPDATE table SET col = val WHERE condition');

  const collection = m[1];
  const setParts = m[2].split(',');
  const updateFields = {};
  setParts.forEach(p => {
    const [key, ...rest] = p.split('=');
    updateFields[key.trim()] = parseValue(rest.join('=').trim());
  });

  const filter = m[3] ? parseWhereClause(m[3].trim()) : {};
  const code = `db.${collection}.updateMany(\n  ${JSON.stringify(filter, null, 2)},\n  { $set: ${JSON.stringify(updateFields, null, 2)} }\n)`;
  return { type: 'updateMany', code, canRun: false };
}

function parseSqlDelete(sql, collName) {
  const m = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*))?$/i);
  if (!m) throw new Error('Invalid DELETE syntax. Use: DELETE FROM table WHERE condition');

  const collection = m[1];
  const filter = m[2] ? parseWhereClause(m[2].trim()) : {};
  const code = `db.${collection}.deleteMany(${JSON.stringify(filter, null, 2)})`;
  return { type: 'deleteMany', code, canRun: false };
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
  const ok = await ui.confirm({
    title: 'Kill running operation?',
    message: `Operation ${opid} will be terminated. Anything it was doing in the database stops immediately.`,
    confirmText: 'Kill operation',
    danger: true,
  });
  if (!ok) return;
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
    changes: document.getElementById('panel-changes'),
    sql: document.getElementById('panel-sql'),
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
    if (tabName !== 'changes' && csEventSource) stopChangeStream();
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

  tbody.innerHTML = renderTableSkeleton(4, 5);

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
  document.getElementById('aggSave')?.addEventListener('click', async () => {
    if (aggStages.length === 0) { showToast('Add at least one stage to save.', 'warning'); return; }
    const name = await ui.prompt({
      title: 'Save aggregation pipeline',
      message: 'Pipelines are saved per collection so you can rerun them later.',
      placeholder: 'e.g. Daily revenue rollup',
      confirmText: 'Save pipeline',
    });
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
  const toolbar = `
    <div class="saved-queries-toolbar">
      <button class="saved-queries-action" data-action="export-pipelines">Export</button>
      <button class="saved-queries-action" data-action="import-pipelines">Import</button>
    </div>`;
  if (pipelines.length === 0) {
    dropdown.innerHTML = toolbar + '<div class="saved-queries-empty">No saved pipelines.</div>';
  } else {
    dropdown.innerHTML = toolbar + pipelines.map((p, i) => `
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
  }

  dropdown.querySelector('[data-action="export-pipelines"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportSavedPipelines(dbName, collectionName);
  });
  dropdown.querySelector('[data-action="import-pipelines"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    importSavedPipelines(dbName, collectionName).then(() =>
      renderAggSavedDropdown(dbName, collectionName, dropdown)
    );
  });

  if (pipelines.length === 0) return;

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

  const pipeJson = JSON.stringify(pipeline, null, 2);
  const pipeIndented = pipeJson.split('\n').join('\n  ');
  const langTitles = { js: 'JavaScript (mongosh)', nodejs: 'Node.js Driver', python: 'Python (pymongo)', java: 'Java Driver', csharp: 'C# (.NET Driver)', go: 'Go Driver' };

  let code = '';
  if (lang === 'js') {
    code = `// MongoDB Aggregation Pipeline\n// Database: ${dbName}, Collection: ${collectionName}\n\ndb.getCollection('${collectionName}').aggregate([\n${pipeline.map(s => '  ' + JSON.stringify(s, null, 2).split('\n').join('\n  ')).join(',\n')}\n]);`;
  } else if (lang === 'nodejs') {
    code = `// MongoDB Aggregation Pipeline - Node.js Driver\nconst { MongoClient } = require('mongodb');\n\nasync function run() {\n  const client = new MongoClient('mongodb://localhost:27017/');\n  await client.connect();\n  const db = client.db('${dbName}');\n  const collection = db.collection('${collectionName}');\n\n  const pipeline = ${pipeIndented};\n\n  const results = await collection.aggregate(pipeline).toArray();\n  console.log(results);\n  await client.close();\n}\n\nrun().catch(console.error);`;
  } else if (lang === 'python') {
    code = `# MongoDB Aggregation Pipeline - Python (pymongo)\nfrom pymongo import MongoClient\n\nclient = MongoClient("mongodb://localhost:27017/")\ndb = client["${dbName}"]\ncollection = db["${collectionName}"]\n\npipeline = ${pipeIndented}\n\nresults = list(collection.aggregate(pipeline))\nfor doc in results:\n    print(doc)`;
  } else if (lang === 'java') {
    const stages = pipeline.map(s => `    new Document(${JSON.stringify(s).replace(/"/g, '\\"')})`).join(',\n');
    code = `// MongoDB Aggregation Pipeline - Java Driver\nimport com.mongodb.client.*;\nimport org.bson.Document;\nimport java.util.*;\n\npublic class Aggregation {\n  public static void main(String[] args) {\n    MongoClient client = MongoClients.create("mongodb://localhost:27017/");\n    MongoDatabase db = client.getDatabase("${dbName}");\n    MongoCollection<Document> collection = db.getCollection("${collectionName}");\n\n    List<Document> pipeline = Arrays.asList(\n${stages}\n    );\n\n    collection.aggregate(pipeline)\n      .forEach(doc -> System.out.println(doc.toJson()));\n    client.close();\n  }\n}`;
  } else if (lang === 'csharp') {
    code = `// MongoDB Aggregation Pipeline - C# (.NET Driver)\nusing MongoDB.Driver;\nusing MongoDB.Bson;\n\nvar client = new MongoClient("mongodb://localhost:27017/");\nvar db = client.GetDatabase("${dbName}");\nvar collection = db.GetCollection<BsonDocument>("${collectionName}");\n\nvar pipeline = new BsonDocument[] {\n${pipeline.map(s => '  BsonDocument.Parse(@"' + JSON.stringify(s).replace(/"/g, '""') + '")').join(',\n')}\n};\n\nvar results = await collection.Aggregate<BsonDocument>(\n  PipelineDefinition<BsonDocument, BsonDocument>.Create(pipeline)\n).ToListAsync();\n\nforeach (var doc in results)\n  Console.WriteLine(doc);`;
  } else if (lang === 'go') {
    code = `// MongoDB Aggregation Pipeline - Go Driver\npackage main\n\nimport (\n  "context"\n  "fmt"\n  "go.mongodb.org/mongo-driver/bson"\n  "go.mongodb.org/mongo-driver/mongo"\n  "go.mongodb.org/mongo-driver/mongo/options"\n)\n\nfunc main() {\n  client, _ := mongo.Connect(context.TODO(),\n    options.Client().ApplyURI("mongodb://localhost:27017/"))\n  defer client.Disconnect(context.TODO())\n\n  collection := client.Database("${dbName}").Collection("${collectionName}")\n\n  pipeline := mongo.Pipeline{\n${pipeline.map(s => `    bson.D{${JSON.stringify(Object.entries(s)[0]).replace(/\["/g, '{"').replace(/",/g, '",').replace(/\]/g, '}')}}`).join(',\n')}\n  }\n\n  cursor, _ := collection.Aggregate(context.TODO(), pipeline)\n  var results []bson.M\n  cursor.All(context.TODO(), &results)\n  for _, doc := range results {\n    fmt.Println(doc)\n  }\n}`;
  }

  document.getElementById('aggExportTitle').textContent = `Export — ${langTitles[lang] || lang}`;

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
      const confirmInput = document.getElementById('dropDbConfirmInput');
      const confirmBtn = document.getElementById('dropDbConfirm');
      if (confirmInput) { confirmInput.value = ''; }
      if (confirmBtn) { confirmBtn.disabled = true; }
      dropDbModal.style.display = 'flex';
      confirmInput?.focus();
    });
  });

  document.getElementById('dropDbConfirmInput')?.addEventListener('input', (e) => {
    const confirmBtn = document.getElementById('dropDbConfirm');
    if (confirmBtn) {
      confirmBtn.disabled = e.target.value !== dropTarget;
    }
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
      const confirmInput = document.getElementById('dropColConfirmInput');
      const confirmBtn = document.getElementById('dropColConfirm');
      if (confirmInput) { confirmInput.value = ''; }
      if (confirmBtn) { confirmBtn.disabled = true; }
      dropColModal.style.display = 'flex';
      confirmInput?.focus();
    });
  });

  document.getElementById('dropColConfirmInput')?.addEventListener('input', (e) => {
    const confirmBtn = document.getElementById('dropColConfirm');
    if (confirmBtn) {
      confirmBtn.disabled = e.target.value !== dropColTarget;
    }
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

const THEME_VARIANTS = [
  { id: 'system', label: 'System', swatches: ['#e6edf3', '#0d1117', '#58a6ff'] },
  { id: 'light', label: 'Light', swatches: ['#ffffff', '#f6f8fa', '#0969da'] },
  { id: 'dark', label: 'Dark', swatches: ['#0d1117', '#161b22', '#58a6ff'] },
  { id: 'dracula', label: 'Dracula', swatches: ['#282a36', '#44475a', '#bd93f9'] },
  { id: 'nord', label: 'Nord', swatches: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'solarized-dark', label: 'Solarized Dark', swatches: ['#002b36', '#073642', '#268bd2'] },
  { id: 'solarized-light', label: 'Solarized Light', swatches: ['#fdf6e3', '#eee8d5', '#268bd2'] },
];

function ensureThemeDropdownVariants() {
  const dropdown = document.querySelector('.theme-dropdown');
  if (!dropdown) return;
  if (dropdown.dataset.variantsInjected) return;
  dropdown.dataset.variantsInjected = '1';

  // Clear existing markup and rebuild from THEME_VARIANTS so all themes get a swatch row.
  dropdown.innerHTML = THEME_VARIANTS.map((t) => `
    <div class="theme-option" data-theme="${t.id}">
      <span class="theme-option-swatches" aria-hidden="true">
        ${t.swatches.map((c) => `<span class="theme-option-swatch" style="background:${c}"></span>`).join('')}
      </span>
      <span>${escapeHtml(t.label)}</span>
    </div>
  `).join('');
}

function updateThemeToggleUI(theme) {
  const btn = document.querySelector('.theme-toggle-btn');
  if (!btn) return;
  const icon = btn.querySelector('svg');
  const text = btn.querySelector('.theme-toggle-text');
  const variant = THEME_VARIANTS.find((v) => v.id === theme) || THEME_VARIANTS[0];
  if (text) text.textContent = variant.label;

  if (icon) {
    if (theme === 'light' || theme === 'solarized-light') {
      icon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>';
    } else if (theme === 'system') {
      icon.innerHTML = '<path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>';
    } else {
      icon.innerHTML = '<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>';
    }
  }
}

function initThemeToggle() {
  // Inject the extended theme list before applying (so the active marker lands on a real DOM node).
  ensureThemeDropdownVariants();

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

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-toggle')) {
        dropdown.classList.remove('show');
      }
    });

    dropdown.querySelectorAll('.theme-option').forEach(option => {
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
