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
let allDocuments = [];
let tableFields = [];
let allAvailableFields = [];
let currentSearchTerm = '';
let currentDbName = '';
let currentCollectionName = '';
let arrayFilters = {}; // Store filters for array columns: { fieldName: { type: 'empty' | 'gte', value: number } }

function initBrowser(dbName, collectionName) {
  currentCursor = null;
  allDocuments = [];
  tableFields = [];
  allAvailableFields = [];
  currentSearchTerm = '';
  currentDbName = dbName;
  currentCollectionName = collectionName;
  arrayFilters = {}; // Reset filters when switching collections

  loadDocuments(dbName, collectionName);
  
  // Search input
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  let searchTimeout = null;

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
        currentCursor = null;
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
        currentCursor = null;
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
      currentCursor = null;
      allDocuments = [];
      loadDocuments(dbName, collectionName);
    });
  }
  
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

  // Columns button
  document.getElementById('columnsBtn')?.addEventListener('click', () => {
    openColumnsModal(dbName, collectionName);
  });

  // Load more button
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
    loadDocuments(dbName, collectionName, currentCursor);
  });

  // Modal handlers
  setupModalHandlers();
  setupColumnsModalHandlers();
  setupViewModalHandlers();
}

async function loadDocuments(dbName, collectionName, cursor = null) {
  const tableBody = document.getElementById('tableBody');
  const tableHeader = document.getElementById('tableHeader');
  const pagination = document.getElementById('pagination');
  const docCount = document.getElementById('docCount');

  if (!cursor) {
    tableBody.innerHTML = '<tr class="loading-row"><td colspan="100"><div class="loading-spinner"></div></td></tr>';
    allDocuments = [];
    allAvailableFields = [];
  }

  try {
    let url = `/api/${dbName}/${collectionName}?limit=50`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    if (currentSearchTerm) url += `&search=${encodeURIComponent(currentSearchTerm)}`;
    
    // Add array filters to URL
    if (Object.keys(arrayFilters).length > 0) {
      url += `&arrayFilters=${encodeURIComponent(JSON.stringify(arrayFilters))}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    const { documents, nextCursor, hasMore, totalCount } = data;
    
    currentCursor = nextCursor;
    allDocuments = allDocuments.concat(documents);

    // Update count
    if (currentSearchTerm) {
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
      if (!cursor) {
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
    if (!cursor) {
      tableBody.innerHTML = '';
    }
    
    documents.forEach(doc => {
      const row = createDocumentRow(doc, dbName, collectionName);
      tableBody.appendChild(row);
    });

    // Ensure table header is rendered
    if (tableFields.length > 0 && tableHeader.innerHTML.trim() === '') {
      renderTableHeader();
    }

    // Pagination
    if (hasMore) {
      pagination.style.display = 'flex';
      document.getElementById('loadMoreBtn').style.display = 'block';
      if (currentSearchTerm) {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ${formatCount(totalCount)} results`;
      } else {
        document.getElementById('paginationInfo').textContent = `Showing ${allDocuments.length} of ~${formatCount(totalCount)}`;
      }
    } else {
      pagination.style.display = allDocuments.length > 0 ? 'flex' : 'none';
      document.getElementById('loadMoreBtn').style.display = 'none';
      if (currentSearchTerm) {
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
      alert('Please select at least one column to display.');
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
      alert('Failed to copy to clipboard');
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
    alert('Please select a filter type');
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
      alert('Please enter a valid number (>= 0)');
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
  
  // Reload documents with new filter
  currentCursor = null;
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
  
  // Reload documents without filter
  currentCursor = null;
  allDocuments = [];
  loadDocuments(currentDbName, currentCollectionName);
}

// Functions are called via event listeners, but keep them globally available for debugging
window.applyArrayFilter = applyArrayFilter;
window.clearArrayFilter = clearArrayFilter;

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
