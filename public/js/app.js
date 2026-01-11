// MongoDB Dashboard - Client-side JavaScript

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

function getConnections() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveConnection(connectionString) {
  const connections = getConnections().filter(c => c !== connectionString);
  connections.unshift(connectionString);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections.slice(0, 5)));
}

function removeConnection(connectionString) {
  const connections = getConnections().filter(c => c !== connectionString);
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
      // Successfully reconnected, redirect to databases
      window.location.href = '/databases';
      return;
    }
  } else if (status.connected) {
    // Already connected, redirect to databases
    window.location.href = '/databases';
    return;
  }

  // Reconnection failed or no saved connection - show the form
  reconnectLoading.style.display = 'none';
  connectContent.style.display = 'block';

  // Show recent connections
  const connections = getConnections();
  if (connections.length > 0) {
    recentEl.style.display = 'block';
    recentList.innerHTML = connections.map(conn => `
      <li data-conn="${encodeURIComponent(conn)}">
        <span class="recent-host">${maskConnectionString(conn)}</span>
        <span class="recent-remove" data-remove="${encodeURIComponent(conn)}">×</span>
      </li>
    `).join('');

    recentList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.recent-remove');
      if (removeBtn) {
        e.stopPropagation();
        const conn = decodeURIComponent(removeBtn.dataset.remove);
        removeConnection(conn);
        removeBtn.closest('li').remove();
        if (getConnections().length === 0) {
          recentEl.style.display = 'none';
        }
        return;
      }

      const li = e.target.closest('li');
      if (li) {
        input.value = decodeURIComponent(li.dataset.conn);
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  // Handle form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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

      // Redirect to databases page
      window.location.href = '/databases';
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
let allDocuments = [];
let tableFields = [];

function initBrowser(dbName, collectionName) {
  currentCursor = null;
  allDocuments = [];
  tableFields = [];

  loadDocuments(dbName, collectionName);
  
  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    currentCursor = null;
    allDocuments = [];
    loadDocuments(dbName, collectionName);
  });

  // Add document button
  document.getElementById('addDocBtn')?.addEventListener('click', () => {
    openDocModal(dbName, collectionName, null);
  });

  // Load more button
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
    loadDocuments(dbName, collectionName, currentCursor);
  });

  // Modal handlers
  setupModalHandlers();
}

async function loadDocuments(dbName, collectionName, cursor = null) {
  const tableBody = document.getElementById('tableBody');
  const tableHeader = document.getElementById('tableHeader');
  const pagination = document.getElementById('pagination');
  const docCount = document.getElementById('docCount');

  if (!cursor) {
    tableBody.innerHTML = '<tr class="loading-row"><td colspan="100"><div class="loading-spinner"></div></td></tr>';
    allDocuments = [];
  }

  try {
    let url = `/api/${dbName}/${collectionName}?limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    const { documents, nextCursor, hasMore, totalCount } = data;
    
    currentCursor = nextCursor;
    allDocuments = allDocuments.concat(documents);

    // Update count
    docCount.textContent = `${formatCount(totalCount)} documents`;

    // Determine table fields from first document
    if (tableFields.length === 0 && documents.length > 0) {
      tableFields = extractFields(documents[0]);
      tableHeader.innerHTML = tableFields.map(f => `<th>${f}</th>`).join('') + '<th>Extra Fields</th><th>Actions</th>';
    }

    // Render documents
    if (!cursor) {
      tableBody.innerHTML = '';
    }
    
    documents.forEach(doc => {
      const row = createDocumentRow(doc, dbName, collectionName);
      tableBody.appendChild(row);
    });

    // Pagination
    if (hasMore) {
      pagination.style.display = 'flex';
      document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ~${formatCount(totalCount)}`;
    } else {
      pagination.style.display = allDocuments.length > 0 ? 'flex' : 'none';
      document.getElementById('loadMoreBtn').style.display = 'none';
      document.getElementById('paginationInfo').textContent = `Showing all ${allDocuments.length} documents`;
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

function createDocumentRow(doc, dbName, collectionName) {
  const tr = document.createElement('tr');
  
  tableFields.forEach(field => {
    const td = document.createElement('td');
    td.innerHTML = formatCellValue(doc[field], field);
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

  // Get document ID for actions
  const docId = doc._id?.$oid || doc._id;

  // Actions column
  const actionsTd = document.createElement('td');
  actionsTd.innerHTML = `
    <div class="cell-actions">
      <button class="action-btn view" title="View" onclick="window.location.href='/browse/${dbName}/${collectionName}/${docId}'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
      <button class="action-btn edit" title="Edit" data-doc='${JSON.stringify(doc).replace(/'/g, "\\'")}'>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="action-btn delete" title="Delete" data-id="${docId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `;

  // Edit button handler
  actionsTd.querySelector('.edit').addEventListener('click', (e) => {
    const doc = JSON.parse(e.currentTarget.dataset.doc);
    openDocModal(dbName, collectionName, doc);
  });

  // Delete button handler
  actionsTd.querySelector('.delete').addEventListener('click', (e) => {
    openDeleteModal(dbName, collectionName, e.currentTarget.dataset.id);
  });

  tr.appendChild(actionsTd);
  return tr;
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
    document.getElementById('docEditor').style.display = 'none';
    document.getElementById('docFormContainer').style.display = 'block';
    document.getElementById('useFormBtn').classList.add('active');
    document.getElementById('useJsonBtn').classList.remove('active');
  });

  document.getElementById('useJsonBtn')?.addEventListener('click', () => {
    useFormMode = false;
    const formContainer = document.getElementById('docFormContainer');
    const editor = document.getElementById('docEditor');
    
    // Convert form data to JSON
    if (currentSchema) {
      const formData = getFormData(formContainer);
      editor.value = JSON.stringify(formData, null, 2);
    }
    
    editor.style.display = 'block';
    formContainer.style.display = 'none';
    document.getElementById('useFormBtn').classList.remove('active');
    document.getElementById('useJsonBtn').classList.add('active');
    editor.focus();
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
  const editor = document.getElementById('docEditor');
  const formContainer = document.getElementById('docFormContainer');
  const formToggle = document.getElementById('formToggle');
  const deleteBtn = document.getElementById('modalDelete');
  const errorEl = document.getElementById('editorError');

  currentModalDoc = doc;
  currentModalDb = dbName;
  currentModalCol = collectionName;

  if (doc) {
    title.textContent = 'Edit Document';
    deleteBtn.style.display = 'block';
    editor.value = JSON.stringify(doc, null, 2);
    // For editing, always use JSON mode
    useFormMode = false;
    formToggle.style.display = 'none';
    formContainer.style.display = 'none';
    editor.style.display = 'block';
  } else {
    title.textContent = 'New Document';
    deleteBtn.style.display = 'none';
    
    // Try to fetch schema for new documents
    try {
      const res = await fetch(`/api/${dbName}/${collectionName}/schema`);
      const data = await res.json();
      
      console.log('Schema response:', data);
      
      if (res.ok && data.schema && !data.schema.isEmpty && Object.keys(data.schema.fields || {}).length > 0) {
        currentSchema = data.schema;
        useFormMode = true;
        formToggle.style.display = 'flex';
        console.log('Rendering form with schema fields:', data.schema.fields);
        renderFormFromSchema(formContainer, currentSchema.fields);
        formContainer.style.display = 'block';
        editor.style.display = 'none';
      } else {
        console.log('No schema available or empty collection, using JSON editor');
        // No schema available, use JSON
        currentSchema = null;
        useFormMode = false;
        formToggle.style.display = 'none';
        formContainer.style.display = 'none';
        editor.style.display = 'block';
        editor.value = '{\n  \n}';
      }
    } catch (err) {
      // Fallback to JSON on error
      currentSchema = null;
      useFormMode = false;
      formToggle.style.display = 'none';
      formContainer.style.display = 'none';
      editor.style.display = 'block';
      editor.value = '{\n  \n}';
    }
  }

  errorEl.style.display = 'none';
  modal.style.display = 'flex';
  
  if (useFormMode && formContainer.style.display !== 'none') {
    const firstInput = formContainer.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  } else {
    editor.focus();
  }
}

async function saveDocument() {
  const editor = document.getElementById('docEditor');
  const formContainer = document.getElementById('docFormContainer');
  const errorEl = document.getElementById('editorError');
  const saveBtn = document.getElementById('modalSave');

  let doc;
  try {
    if (useFormMode && formContainer.style.display !== 'none' && currentSchema) {
      doc = getFormData(formContainer);
    } else {
      doc = JSON.parse(editor.value);
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
    alert('Delete failed: ' + err.message);
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
  const editor = document.getElementById('editDocEditor');
  
  editor.value = JSON.stringify(doc, null, 2);
  document.getElementById('editError').style.display = 'none';
  modal.style.display = 'flex';
  editor.focus();
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
    const editor = document.getElementById('editDocEditor');
    const errorEl = document.getElementById('editError');

    let doc;
    try {
      doc = JSON.parse(editor.value);
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
      alert('Delete failed: ' + err.message);
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

// Global initialization - check connection status on all pages except connect page
async function initGlobalConnectionCheck() {
  // Skip on connect page (it handles its own reconnection)
  if (window.location.pathname === '/' || window.location.pathname === '/connect') {
    return;
  }

  try {
    const status = await checkConnectionStatus();
    if (!status.connected) {
      // Try to auto-reconnect
      const reconnected = await autoReconnect();
      if (reconnected) {
        // Successfully reconnected, reload the page
        window.location.reload();
      } else {
        // Failed to reconnect, redirect to connect page
        window.location.href = '/';
      }
    }
  } catch (err) {
    // On error, try to reconnect
    const reconnected = await autoReconnect();
    if (!reconnected) {
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
