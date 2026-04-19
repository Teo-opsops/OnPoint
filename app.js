/* ══════════════════════════════════════════════════════════
   Notes App — Core Logic
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Storage Keys ──
  const STORAGE_KEY = 'notesAppData'; // legacy localStorage key (for migration)
  const IDB_NAME = 'NotesAppLocalDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'appData';
  const IDB_DATA_KEY = 'notes'; // key within the object store

  // ── State ──
  let items = [];
  let currentFolderId = null; // null = root
  let currentEditingNoteId = null;
  let contextMenuItemId = null;
  let saveTimeout = null;
  let _db = null; // IndexedDB reference

  // ── DOM References ──
  const topBarBack = document.getElementById('top-bar-back');
  const topBarTitle = document.getElementById('top-bar-title');
  const breadcrumbEl = document.getElementById('breadcrumb');
  const contentArea = document.getElementById('content-area');
  const itemList = document.getElementById('item-list');
  const emptyState = document.getElementById('empty-state');

  const fabNewFolder = document.getElementById('fab-new-folder');
  const fabNewNote = document.getElementById('fab-new-note');

  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalInput = document.getElementById('modal-input');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');

  const contextOverlay = document.getElementById('context-overlay');
  const contextTitle = document.getElementById('context-title');
  const contextType = document.getElementById('context-type');
  const contextRename = document.getElementById('context-rename');
  const contextPin = document.getElementById('context-pin');
  const contextPinText = document.getElementById('context-pin-text');
  const contextMove = document.getElementById('context-move');
  const contextDownload = document.getElementById('context-download');
  const contextShare = document.getElementById('context-share');
  const contextDelete = document.getElementById('context-delete');

  const editorView = document.getElementById('editor-view');
  const editorBackBtn = document.getElementById('editor-back-btn');
  const editorTitleInput = document.getElementById('editor-title-input');
  const editorTextarea = document.getElementById('editor-textarea');
  const editorTextareaContainer = document.getElementById('editor-textarea-container');
  const editorCharCount = document.getElementById('editor-char-count');

  // ── Utility ──
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function now() {
    return new Date().toISOString();
  }

  function formatDate(isoString) {
    const d = new Date(isoString);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return 'Oggi, ' + time;
    if (isYesterday) return 'Ieri, ' + time;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ', ' + time;
  }

  // ══════════════════════════════════════════════════════════
  //  Local Persistence — IndexedDB
  //  I dati delle note vengono salvati in un database locale
  //  (IndexedDB) separato dalla cache del browser e da Google.
  //  Questo garantisce che i dati persistano anche quando si
  //  cancella la cache del browser.
  // ══════════════════════════════════════════════════════════

  // Open (or create) the IndexedDB database
  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }
      var request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = function (e) {
        _db = e.target.result;
        resolve(_db);
      };
      request.onerror = function (e) {
        console.warn('IndexedDB open error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // Read data from IndexedDB
  function readFromIDB() {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var store = tx.objectStore(IDB_STORE);
        var request = store.get(IDB_DATA_KEY);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // Write data to IndexedDB
  function writeToIDB(data) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        var request = store.put(data, IDB_DATA_KEY);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  // ── Persistence ──
  function loadData() {
    return readFromIDB().then(function (data) {
      if (data && data.items) {
        items = data.items;
        console.log('Notes: loaded ' + items.length + ' items from IndexedDB');
      } else {
        // Check for legacy localStorage data and migrate
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            var parsed = JSON.parse(raw);
            items = parsed.items || [];
            if (items.length > 0) {
              console.log('Notes: migrating ' + items.length + ' items from localStorage to IndexedDB');
              // Save to IndexedDB immediately
              writeToIDB({ items: items }).then(function () {
                // Remove from localStorage after successful migration
                localStorage.removeItem(STORAGE_KEY);
                console.log('Notes: migration complete, localStorage cleaned');
              });
            }
          }
        } catch (e) {
          console.warn('Notes: failed to migrate from localStorage', e);
        }
      }
    }).catch(function (err) {
      console.warn('Notes: IndexedDB load failed, falling back to localStorage', err);
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          items = parsed.items || [];
        }
      } catch (e) {
        console.warn('Notes: localStorage fallback also failed', e);
      }
    });
  }

  function saveData() {
    // Write to IndexedDB (async, fire-and-forget for speed)
    writeToIDB({ items: items }).catch(function (err) {
      console.warn('Notes: IndexedDB save failed, falling back to localStorage', err);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items }));
      } catch (e) {
        console.warn('Notes: localStorage fallback also failed', e);
      }
    });
  }

  function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveData, 300);
  }

  // ── Data Helpers ──
  let _itemsMap = new Map();
  let _lastItemsRef = null;
  let _lastItemsLen = -1;

  function getItem(id) {
    if (items !== _lastItemsRef || items.length !== _lastItemsLen) {
      _itemsMap.clear();
      const len = items.length;
      for (let i = 0; i < len; i++) {
        _itemsMap.set(items[i].id, items[i]);
      }
      _lastItemsRef = items;
      _lastItemsLen = len;
    }
    return _itemsMap.get(id);
  }

  function getChildren(parentId) {
    return items.filter(function (i) { return i.parentId === parentId; });
  }

  function getSortedChildren(parentId) {
    const active = getChildren(parentId).filter(function (i) { return !i.deleted; });
    const sortType = localStorage.getItem('notesAppSortType') || 'alpha';

    function getPriority(item) {
      if (item.pinned) {
        return item.type === 'folder' ? 4 : 3;
      }
      return item.type === 'folder' ? 2 : 1;
    }

    return active.sort(function(a, b) {
      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pB - pA;

      if (sortType === 'alpha') {
        const titleA = a.type === 'folder' ? (a.name || '') : getNoteTitle(a);
        const titleB = b.type === 'folder' ? (b.name || '') : getNoteTitle(b);
        return titleA.localeCompare(titleB);
      } else if (sortType === 'date-updated') {
        const da = a.updatedAt || 0;
        const db = b.updatedAt || 0;
        return db > da ? 1 : (db < da ? -1 : 0);
      } else if (sortType === 'date-created') {
        const da = a.createdAt || 0;
        const db = b.createdAt || 0;
        return db > da ? 1 : (db < da ? -1 : 0);
      }
      return 0;
    });
  }

  function getAncestors(folderId) {
    const ancestors = [];
    let current = folderId;
    while (current) {
      const item = getItem(current);
      if (!item) break;
      ancestors.unshift(item);
      current = item.parentId;
    }
    return ancestors;
  }

  function deleteRecursive(idOrIds, permanent) {
    if (permanent) {
      const toDeleteIds = new Set(Array.isArray(idOrIds) ? idOrIds : [idOrIds]);

      let added = true;
      while (added) {
        added = false;
        const len = items.length;
        for (let i = 0; i < len; i++) {
          if (!toDeleteIds.has(items[i].id) && toDeleteIds.has(items[i].parentId)) {
            toDeleteIds.add(items[i].id);
            added = true;
          }
        }
      }

      items = items.filter(function (i) { return !toDeleteIds.has(i.id); });
    } else {
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      ids.forEach(function(id) {
        const item = getItem(id);
        if (item) {
          item.deleted = true;
          item.deletedAt = now();
          item.updatedAt = now();
        }
      });
    }
  }

  function getNoteTitle(item) {
    if (item.name && item.name.trim()) return item.name;
    if (item.content && item.content.trim()) {
      const text = item.content.trim();
      const firstNewline = text.indexOf('\n');
      return firstNewline === -1 ? text : text.substring(0, firstNewline).trim();
    }
    return 'Nota senza titolo';
  }

  function getNotePreview(content) {
    if (!content) return '';
    const text = content.trim();
    const firstNewline = text.indexOf('\n');
    if (firstNewline === -1) return '';
    
    // Limits extraction to characters without spanning the whole text memory
    return text.substring(firstNewline + 1, firstNewline + 151)
               .replace(/\s+/g, ' ')
               .trim()
               .substring(0, 100);
  }

  // ── SVG Icons ──
  const ICONS = {
    folder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    note: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    folderPlus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    notePlus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    rename: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    emptyFolder: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
  };

  // ── Render Breadcrumb ──
  function renderBreadcrumb() {
    breadcrumbEl.innerHTML = '';

    // Home
    const homeBtn = document.createElement('button');
    homeBtn.className = 'breadcrumb-item' + (currentFolderId === null ? ' active' : '');
    homeBtn.textContent = 'Notes';
    if (currentFolderId !== null) {
      homeBtn.addEventListener('click', function () {
        navigateToFolder(null);
      });
    }
    breadcrumbEl.appendChild(homeBtn);

    // Ancestors
    const ancestors = getAncestors(currentFolderId);
    ancestors.forEach(function (ancestor, index) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '›';
      breadcrumbEl.appendChild(sep);

      const btn = document.createElement('button');
      const isLast = index === ancestors.length - 1;
      btn.className = 'breadcrumb-item' + (isLast ? ' active' : '');
      btn.textContent = ancestor.name;
      if (!isLast) {
        btn.addEventListener('click', function () {
          navigateToFolder(ancestor.id);
        });
      }
      breadcrumbEl.appendChild(btn);
    });

    // Scroll to end
    breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth;
  }
  // ══════════════════════════════════════════════════════════
  //  Drag-Move System (Long-Press → Drag to Folder / Back)
  // ══════════════════════════════════════════════════════════
  let _activeDragGhost = null;
  let _activeDragItemId = null;
  let _activeDragWrapper = null;
  let _lastHighlightedWrapper = null;
  let _dragBackTimer = null;

  function startDragMove(e, item, wrapper, card) {
    _activeDragItemId = item.id;
    _activeDragWrapper = wrapper;

    // Dim the original card
    wrapper.classList.add('being-dragged');

    // Create ghost clone
    var ghost = card.cloneNode(true);
    ghost.className = 'item-card drag-ghost';
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.left = (e.clientX - card.offsetWidth / 2) + 'px';
    ghost.style.top = (e.clientY - 30) + 'px';
    document.body.appendChild(ghost);
    _activeDragGhost = ghost;

    // Show the left-side "back" zone only if we are in a subfolder
    var dragBackZone = document.getElementById('drag-back-zone');
    if (currentFolderId !== null && dragBackZone) {
      dragBackZone.classList.add('visible');
      document.body.classList.add('drag-shift-right');
    }

    // Attach global listeners to handle navigation transitions
    window.addEventListener('pointermove', updateDragMove);
    window.addEventListener('pointerup', _onGlobalPointerUp);
    window.addEventListener('pointercancel', _onGlobalPointerUp);
  }

  function _onGlobalPointerUp(e) {
    window.removeEventListener('pointermove', updateDragMove);
    window.removeEventListener('pointerup', _onGlobalPointerUp);
    window.removeEventListener('pointercancel', _onGlobalPointerUp);
    endDragMove(e);
  }

  function updateDragMove(e) {
    if (!_activeDragGhost) return;

    // Move ghost
    _activeDragGhost.style.left = (e.clientX - _activeDragGhost.offsetWidth / 2) + 'px';
    _activeDragGhost.style.top = (e.clientY - 30) + 'px';

    // Check drag-back zone (left side)
    var dragBackZone = document.getElementById('drag-back-zone');
    if (dragBackZone && dragBackZone.classList.contains('visible')) {
      if (e.clientX < 75) {
        dragBackZone.classList.add('drag-over');
        
        // Hover-to-up logic
        if (!_dragBackTimer) {
          _dragBackTimer = setTimeout(function() {
            const currentFolder = getItem(currentFolderId);
            if (currentFolder) {
              navigateToFolder(currentFolder.parentId);
              if (navigator.vibrate) navigator.vibrate([15, 30, 20]);
              // Clear timer to allow it to restart in the new parent folder if still hovering
              _dragBackTimer = null;
            }
          }, 750);
        }
      } else {
        dragBackZone.classList.remove('drag-over');
        if (_dragBackTimer) {
          clearTimeout(_dragBackTimer);
          _dragBackTimer = null;
        }
      }
    }

    // Highlight folder targets under cursor
    var newTarget = null;
    var wrappers = itemList.querySelectorAll('.swipe-wrapper');
    for (var i = 0; i < wrappers.length; i++) {
      var w = wrappers[i];
      if (w.dataset.id === _activeDragItemId) continue; // Skip item being dragged
      var wId = w.dataset.id;
      var wItem = getItem(wId);
      if (!wItem || wItem.type !== 'folder') continue;
      if (isDescendantOf(_activeDragItemId, wId)) continue;

      var rect = w.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        newTarget = w;
        break;
      }
    }

    // Update highlight
    if (_lastHighlightedWrapper && _lastHighlightedWrapper !== newTarget) {
      _lastHighlightedWrapper.classList.remove('drag-target-folder');
    }
    if (newTarget) {
      newTarget.classList.add('drag-target-folder');
    }
    _lastHighlightedWrapper = newTarget;
  }

  function endDragMove(e) {
    if (!_activeDragItemId) return;

    if (_dragBackTimer) {
      clearTimeout(_dragBackTimer);
      _dragBackTimer = null;
    }

    var item = getItem(_activeDragItemId);
    var wrapper = _activeDragWrapper;

    // Remove ghost
    if (_activeDragGhost) {
      _activeDragGhost.remove();
      _activeDragGhost = null;
    }

    // Remove dim from original
    if (wrapper) wrapper.classList.remove('being-dragged');

    // Check drop targets
    var moved = false;
    if (!item) return;

    // 1) Check left "back" zone
    var dragBackZone = document.getElementById('drag-back-zone');
    if (dragBackZone && dragBackZone.classList.contains('drag-over')) {
      // Move to parent of current folder
      var currentFolder = getItem(currentFolderId);
      var newParentId = currentFolder ? currentFolder.parentId : null;
      item.parentId = newParentId;
      item.updatedAt = now();
      saveData();
      moved = true;
      if (navigator.vibrate) navigator.vibrate(15);
    }

    // 2) Check if dropped on a folder
    if (!moved && _lastHighlightedWrapper) {
      var targetId = _lastHighlightedWrapper.dataset.id;
      var targetItem = getItem(targetId);
      if (targetItem && targetItem.type === 'folder' && targetId !== item.id) {
        item.parentId = targetId;
        item.updatedAt = now();
        saveData();
        moved = true;
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }

    // Cleanup highlights
    if (_lastHighlightedWrapper) {
      _lastHighlightedWrapper.classList.remove('drag-target-folder');
      _lastHighlightedWrapper = null;
    }

    // Hide drag zones
    if (dragBackZone) {
      dragBackZone.classList.remove('visible');
      dragBackZone.classList.remove('drag-over');
    }
    document.body.classList.remove('drag-shift-right');

    _activeDragItemId = null;
    _activeDragWrapper = null;

    if (moved) {
      renderAll();
    }
  }

  // ── Render Item List ──
  function renderItems() {
    const sorted = getSortedChildren(currentFolderId);

    itemList.innerHTML = '';

    if (sorted.length === 0) {
      emptyState.style.display = 'flex';
      itemList.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      itemList.style.display = 'flex';

      const childCounts = {};
      const itemsLen = items.length;
      for (let i = 0; i < itemsLen; i++) {
        if (!items[i].deleted && items[i].parentId !== null) {
          childCounts[items[i].parentId] = (childCounts[items[i].parentId] || 0) + 1;
        }
      }

      const fragment = document.createDocumentFragment();

      sorted.forEach(function (item) {
        // Wrapper for swipe/drag
        const wrapper = document.createElement('div');
        wrapper.className = 'swipe-wrapper';
        wrapper.dataset.id = item.id;
        
        // If this item is currently being dragged, maintain the dim state
        if (_activeDragItemId === item.id) {
          wrapper.classList.add('being-dragged');
          _activeDragWrapper = wrapper;
        }

        // Background for swipe
        const swipeBg = document.createElement('div');
        swipeBg.className = 'swipe-bg';
        swipeBg.innerHTML = '<div class="icon-left">' + ICONS.trash + '</div><div class="icon-right">' + ICONS.trash + '</div>';
        
        // Main Card
        const card = document.createElement('div');
        card.className = 'item-card';

        // Icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'item-icon';
        iconDiv.innerHTML = item.type === 'folder' ? ICONS.folder : ICONS.note;

        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'item-name';
        nameEl.textContent = item.type === 'folder' ? item.name : getNoteTitle(item);
        infoDiv.appendChild(nameEl);

        if (item.type === 'note') {
          const preview = getNotePreview(item.content);
          if (preview) {
            const previewEl = document.createElement('div');
            previewEl.className = 'item-preview';
            previewEl.textContent = preview;
            infoDiv.appendChild(previewEl);
          }
        }

        if (item.type === 'folder') {
          const count = childCounts[item.id] || 0;
          if (count > 0) {
            const previewEl = document.createElement('div');
            previewEl.className = 'item-preview';
            previewEl.textContent = count + (count === 1 ? ' elemento' : ' elementi');
            infoDiv.appendChild(previewEl);
          }
        }

        const dateEl = document.createElement('div');
        dateEl.className = 'item-date';
        dateEl.textContent = formatDate(item.updatedAt);
        infoDiv.appendChild(dateEl);

        card.appendChild(iconDiv);
        card.appendChild(infoDiv);

        // Pencil & Chevron for folders
        if (item.type === 'folder') {
          const renameDiv = document.createElement('div');
          renameDiv.className = 'item-rename-icon';
          renameDiv.innerHTML = ICONS.rename;
          renameDiv.addEventListener('click', function (e) {
            e.stopPropagation();
            modalMode = 'rename';
            modalTargetId = item.id;
            modalTitle.textContent = 'Rinomina';
            modalInput.value = item.name;
            modalInput.placeholder = 'Nuovo nome';
            modalConfirm.textContent = 'Salva';
            modalConfirm.className = 'modal-btn modal-btn-confirm';
            showModal();
          });
          card.appendChild(renameDiv);
        }

        const chevronDiv = document.createElement('div');
        chevronDiv.className = 'item-chevron';
        if (item.type === 'folder') {
          chevronDiv.innerHTML = ICONS.chevron;
        }
        card.appendChild(chevronDiv);

        // Interactions (Click, Swipe, Long-Press-Drag)
        let longPressTimer = null;
        let longPressTriggered = false;
        let isDragging = false;
        let startX = 0, startY = 0;
        let isPointerDown = false;
        let isSwiping = false;
        let isScrolling = false;
        let hasCapturedPointer = false;
        let currentX = 0, currentY = 0;
        // Drag-move state
        let isDragMoving = false;
        let dragGhost = null;
        let dragOffsetX = 0, dragOffsetY = 0;
        let lastPointerId = null;

        card.addEventListener('pointerdown', function (e) {
          if (e.target.closest('.item-rename-icon')) return;
          isPointerDown = true;
          isDragging = false;
          isSwiping = false;
          isScrolling = false;
          isDragMoving = false;
          hasCapturedPointer = false;
          startX = e.clientX;
          startY = e.clientY;
          lastPointerId = e.pointerId;

          longPressTriggered = false;
          longPressTimer = setTimeout(function () {
            longPressTriggered = true;
            if (navigator.vibrate) navigator.vibrate(25);
            // Override touch-action so browser doesn't steal the gesture for scrolling
            card.style.touchAction = 'none';
            wrapper.style.touchAction = 'none';
            // Don't open context menu yet — wait for release or drag
          }, 500);
        });

        card.addEventListener('pointermove', function (e) {
          if (!isPointerDown || isScrolling) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;

          // If long press active and user starts moving → enter drag-move mode
          if (longPressTriggered && !isDragMoving) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 8) {
              isDragMoving = true;
              isDragging = true;
              // Capture pointer for drag
              try {
                card.setPointerCapture(e.pointerId);
                hasCapturedPointer = true;
              } catch (err) {}
              // Create floating ghost
              startDragMove(e, item, wrapper, card);
            }
            return;
          }

          if (isDragMoving) {
            // Global listeners handle updateDragMove and endDragMove
            return;
          }

          // Determine gesture direction on first significant movement (pre-longpress)
          if (!isDragging && !longPressTriggered && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            clearTimeout(longPressTimer);

            if (Math.abs(dy) > Math.abs(dx)) {
              // Vertical movement → user wants to scroll, abort our handling
              isScrolling = true;
              isPointerDown = false;
              return;
            }

            // Horizontal movement → it's a swipe, capture pointer now
            isDragging = true;
            isSwiping = true;
            wrapper.classList.add('swiping');
            try {
              card.setPointerCapture(e.pointerId);
              hasCapturedPointer = true;
            } catch (err) {}
          }

          if (isSwiping) {
            currentX = dx;
            card.style.transform = 'translateX(' + currentX + 'px)';
            const iconLeft = swipeBg.querySelector('.icon-left');
            const iconRight = swipeBg.querySelector('.icon-right');
            if (currentX > 0) {
              var progress = Math.min(1, currentX / 100);
              var iconScale = 0.8 + progress * 0.5;
              iconLeft.style.opacity = Math.min(1, currentX / 40);
              iconLeft.style.transform = 'scale(' + iconScale + ')';
              iconRight.style.opacity = '0';
              iconRight.style.transform = 'scale(0.8)';
            } else {
              var progress = Math.min(1, Math.abs(currentX) / 100);
              var iconScale = 0.8 + progress * 0.5;
              iconRight.style.opacity = Math.min(1, Math.abs(currentX) / 40);
              iconRight.style.transform = 'scale(' + iconScale + ')';
              iconLeft.style.opacity = '0';
              iconLeft.style.transform = 'scale(0.8)';
            }
          }
        });

        function handleRelease(e) {
          if (!isPointerDown) return;
          isPointerDown = false;
          clearTimeout(longPressTimer);

          if (hasCapturedPointer) {
            try { card.releasePointerCapture(e.pointerId); } catch (err) {}
            hasCapturedPointer = false;
          }

          if (isDragMoving) {
            // endDragMove handled by global listener
            isDragMoving = false;
            isDragging = false;
            longPressTriggered = false;
            return;
          }

          if (isSwiping) {
            if (Math.abs(currentX) > 80) {
              card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
              card.style.transform = 'translateX(' + (currentX > 0 ? 100 : -100) + '%)';
              wrapper.style.transition = 'height 0.3s ease, opacity 0.3s ease, margin 0.3s ease';
              setTimeout(function() {
                wrapper.style.height = '0px';
                wrapper.style.opacity = '0';
                wrapper.style.marginBottom = '0px';
              }, 150);
              setTimeout(function() {
                deleteRecursive(item.id, false);
                saveData();
                renderAll();
              }, 450);
            } else {
              wrapper.classList.remove('swiping');
              card.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              card.style.transform = '';
              var il = swipeBg.querySelector('.icon-left');
              var ir = swipeBg.querySelector('.icon-right');
              if (il) { il.style.opacity = '0'; il.style.transform = 'scale(0.8)'; }
              if (ir) { ir.style.opacity = '0'; ir.style.transform = 'scale(0.8)'; }
              setTimeout(function() { card.style.transition = ''; }, 300);
            }
          } else if (longPressTriggered && !isDragging) {
            // Long press release without drag → open context menu
            openContextMenu(item.id);
          } else if (!isDragging && !longPressTriggered && e.type !== 'pointercancel') {
             const dx = e.clientX !== undefined ? Math.abs(e.clientX - startX) : 0;
             const dy = e.clientY !== undefined ? Math.abs(e.clientY - startY) : 0;
             
             if (dx < 15 && dy < 15) {
               // Tap: open note/folder
               if (item.type === 'folder') {
                 navigateToFolder(item.id);
               } else {
                 openNoteEditor(item.id);
               }
             }
          }
          currentX = 0;
          currentY = 0;
          isSwiping = false;
          isDragging = false;
          isScrolling = false;
          longPressTriggered = false;
          wrapper.classList.remove('swiping');
          // Restore touch-action for normal scroll behavior
          card.style.touchAction = '';
          wrapper.style.touchAction = '';
        }

        card.addEventListener('pointerup', handleRelease);
        card.addEventListener('pointercancel', handleRelease);

        // Clear entry animation after it completes so JS transforms work for swiping
        card.addEventListener('animationend', function () {
          card.style.animation = 'none';
          card.style.opacity = '1';
        }, { once: true });

        wrapper.appendChild(swipeBg);
        wrapper.appendChild(card);
        fragment.appendChild(wrapper);
      });

      itemList.appendChild(fragment);
    }
  }

  // ── Render Top Bar ──
  function renderTopBar() {
    if (currentFolderId === null) {
      topBarBack.classList.add('hidden');
      topBarTitle.textContent = 'Notes';
    } else {
      topBarBack.classList.remove('hidden');
      const folder = getItem(currentFolderId);
      topBarTitle.textContent = folder ? folder.name : 'Notes';
    }
  }

  // ── Full Render ──
  function renderAll() {
    renderTopBar();
    renderBreadcrumb();
    renderItems();

    // If a drag is active, Ensure the drag-back-zone visibility is updated for the new folder view
    if (_activeDragItemId) {
      var dragBackZone = document.getElementById('drag-back-zone');
      if (dragBackZone) {
        if (currentFolderId !== null) {
          dragBackZone.classList.add('visible');
          document.body.classList.add('drag-shift-right');
        } else {
          dragBackZone.classList.remove('visible');
          document.body.classList.remove('drag-shift-right');
        }
      }
    }
  }

  // ── Top Bar Back Button ──
  topBarBack.addEventListener('click', function () {
    if (currentFolderId !== null) {
      history.back();
    }
  });

  // ── Navigation ──
  function navigateToFolder(folderId) {
    currentFolderId = folderId;

    // Push history state
    if (folderId === null) {
      history.pushState({ view: 'folder', folderId: null }, '');
    } else {
      history.pushState({ view: 'folder', folderId: folderId }, '');
    }

    renderAll();
  }



  // ── Create Folder ──
  let modalMode = null; // 'newFolder' | 'rename'
  let modalTargetId = null;

  fabNewFolder.addEventListener('click', function () {
    modalMode = 'newFolder';
    modalTitle.textContent = 'Nuova Cartella';
    modalInput.value = '';
    modalInput.placeholder = 'Nome cartella';
    modalConfirm.textContent = 'Crea';
    modalConfirm.className = 'modal-btn modal-btn-confirm';
    showModal();
  });

  function showModal() {
    modalOverlay.classList.add('visible');
    history.pushState({ view: 'modal' }, '');
    setTimeout(function () { modalInput.focus(); }, 200);
  }

  function hideModal() {
    modalOverlay.classList.remove('visible');
    modalInput.blur();
  }

  modalCancel.addEventListener('click', function () {
    hideModal();
    history.back();
  });

  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) {
      hideModal();
      history.back();
    }
  });

  modalConfirm.addEventListener('click', function () {
    const value = modalInput.value.trim();
    if (!value) return;

    if (modalMode === 'newFolder') {
      const newFolder = {
        id: generateId(),
        type: 'folder',
        name: value,
        parentId: currentFolderId,
        content: '',
        createdAt: now(),
        updatedAt: now()
      };
      items.push(newFolder);
      saveData();
      renderItems();
    } else if (modalMode === 'rename') {
      const item = getItem(modalTargetId);
      if (item) {
        item.name = value;
        item.updatedAt = now();
        saveData();
        renderAll();
      }
    }

    hideModal();
    history.back();
  });

  // Enter key in modal
  modalInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      modalConfirm.click();
    }
  });

  // ── Create Note ──
  fabNewNote.addEventListener('click', function () {
    const newNote = {
      id: generateId(),
      type: 'note',
      name: '',
      parentId: currentFolderId,
      content: '',
      createdAt: now(),
      updatedAt: now()
    };
    items.push(newNote);
    saveData();
    openNoteEditor(newNote.id, true);
  });

  // ── Note Editor ──
  function openNoteEditor(noteId, isNew = false) {
    const note = getItem(noteId);
    if (!note) return;

    currentEditingNoteId = noteId;
    editorTitleInput.value = note.name || '';
    editorTextarea.value = note.content || '';
    updateCharCount();
    editorView.classList.add('visible');
    document.body.classList.add('editor-open');
    history.pushState({ view: 'editor', noteId: noteId }, '');

    editorTextarea.style.height = 'auto';
    editorTextarea.style.height = editorTextarea.scrollHeight + 'px';
    const wrapper = document.querySelector('.editor-content-wrapper');
    if (wrapper) wrapper.scrollTop = 0;

    if (isNew) {
      setTimeout(function () {
        editorTitleInput.focus();
      }, 350);
    }
  }

  function closeNoteEditor() {
    if (currentEditingNoteId) {
      const note = getItem(currentEditingNoteId);
      if (note) {
        note.name = editorTitleInput.value;
        note.content = editorTextarea.value;
        note.updatedAt = now();
        saveData();
      }
      currentEditingNoteId = null;
    }
    editorView.classList.remove('visible');
    document.body.classList.remove('editor-open');
    editorTitleInput.blur();
    editorTextarea.blur();
    renderItems();
  }

  editorBackBtn.addEventListener('click', function () {
    closeNoteEditor();
    history.back();
  });

  editorTitleInput.addEventListener('input', function () {
    if (currentEditingNoteId) {
      const note = getItem(currentEditingNoteId);
      if (note) {
        note.name = editorTitleInput.value;
        note.updatedAt = now();
        debouncedSave();
      }
    }
  });

  const editorBackdrop = document.getElementById('editor-backdrop');
  function updateBackdrop() {
    if (!editorBackdrop) return;
    const text = editorTextarea.value;
    
    // Testo puro con escape per evitare formattazione non voluta
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Trova URL e assegna classe (la regex intercetta "http://" o "https://")
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    html = html.replace(urlRegex, '<span class="url-link">$1</span>');
    
    if (html.endsWith('\n')) html += '<br>';
    editorBackdrop.innerHTML = html;
  }

  const linkMenu = document.getElementById('link-menu');
  const linkMenuOpen = document.getElementById('link-menu-open');
  let linkMenuTarget = '';

  let taStartX = 0, taStartY = 0;
  let taScrolling = false;

  editorTextarea.addEventListener('pointerdown', function(e) {
    taStartX = e.clientX;
    taStartY = e.clientY;
    taScrolling = false;
    if (linkMenu) linkMenu.style.display = 'none';
  });

  editorTextarea.addEventListener('pointermove', function(e) {
    if (Math.abs(e.clientX - taStartX) > 10 || Math.abs(e.clientY - taStartY) > 10) {
      taScrolling = true;
    }
  });

  // Usiamo click perché il selectionStart s'imposta dopo pointerup, prima del click natively su mobile.
  editorTextarea.addEventListener('click', function(e) {
    if (taScrolling) return;

    const pos = editorTextarea.selectionStart;
    const val = editorTextarea.value;
    if (pos === undefined) return;

    let start = pos;
    while (start > 0 && /\S/.test(val[start - 1])) start--;
    let end = pos;
    while (end < val.length && /\S/.test(val[end])) end++;
    
    let word = val.substring(start, end);
    word = word.replace(/[.,;!?()]+$/, ''); 
    
    if (/^https?:\/\/[^\s]+$/.test(word)) {
      linkMenuTarget = word;
      if (linkMenu) {
        linkMenu.style.display = 'block';
        let x = e.clientX - 50; 
        if (x < 10) x = 10;
        linkMenu.style.left = x + 'px';
        linkMenu.style.top = (e.clientY - 60) + 'px';
      }
    }
  });
  
  if (linkMenuOpen) {
    linkMenuOpen.addEventListener('click', function() {
      window.open(linkMenuTarget, '_blank');
      linkMenu.style.display = 'none';
    });
  }

  editorTextarea.addEventListener('input', function () {
    updateBackdrop();
    if (currentEditingNoteId) {
      const note = getItem(currentEditingNoteId);
      if (note) {
        note.content = editorTextarea.value;
        note.updatedAt = now();
        debouncedSave();
      }
    }
    updateCharCount();
    
    // Auto-expand textarea height
    editorTextarea.style.height = 'auto';
    editorTextarea.style.height = editorTextarea.scrollHeight + 'px';
  });

  function updateCharCount() {
    const count = editorTextarea.value.length;
    editorCharCount.textContent = count + ' caratter' + (count === 1 ? 'e' : 'i');
  }

  // ── Context Menu ──
  function openContextMenu(itemId) {
    const item = getItem(itemId);
    if (!item) return;

    contextMenuItemId = itemId;
    contextTitle.textContent = item.type === 'folder' ? item.name : getNoteTitle(item);
    contextType.textContent = item.type === 'folder' ? 'Cartella' : 'Nota';

    // Set pin text
    if (contextPinText) {
      contextPinText.textContent = item.pinned ? 'Rimuovi da in alto' : 'Fissa in alto';
    }

    // Show/hide rename option (only for folders)
    contextRename.style.display = item.type === 'folder' ? 'flex' : 'none';
    contextDownload.style.display = 'flex';

    contextOverlay.classList.add('visible');
    history.pushState({ view: 'context' }, '');
  }

  function closeContextMenu() {
    contextOverlay.classList.remove('visible');
    contextMenuItemId = null;
  }

  contextOverlay.addEventListener('click', function (e) {
    if (e.target === contextOverlay) {
      closeContextMenu();
      history.back();
    }
  });

  contextRename.addEventListener('click', function () {
    const item = getItem(contextMenuItemId);
    if (!item) return;

    closeContextMenu();
    history.back();

    setTimeout(function () {
      modalMode = 'rename';
      modalTargetId = item.id;
      modalTitle.textContent = 'Rinomina';
      modalInput.value = item.name;
      modalInput.placeholder = 'Nuovo nome';
      modalConfirm.textContent = 'Salva';
      modalConfirm.className = 'modal-btn modal-btn-confirm';
      showModal();
    }, 200);
  });

  contextPin.addEventListener('click', function () {
    const item = getItem(contextMenuItemId);
    if (!item) return;

    item.pinned = !item.pinned;
    item.updatedAt = now();
    saveData();
    renderAll();

    closeContextMenu();
    history.back();
  });

  contextShare.addEventListener('click', function () {
    const item = getItem(contextMenuItemId);
    if (!item) return;

    closeContextMenu();
    history.back();

    setTimeout(function () {
      if (item.type === 'note') {
        if (navigator.share) {
          navigator.share({
            title: getNoteTitle(item),
            text: getNoteContentAsText(item)
          }).catch(console.error);
        } else {
          alert('La condivisione non è supportata su questo browser/dispositivo.');
        }
      } else {
        alert('Puoi condividere solo singole note.');
      }
    }, 200);
  });

  contextDelete.addEventListener('click', function () {
    const item = getItem(contextMenuItemId);
    if (!item) return;

    const isFolder = item.type === 'folder';
    const childCount = isFolder ? getChildren(item.id).length : 0;
    let message = 'Eliminare questa nota?';
    if (isFolder) {
      message = 'Eliminare questa cartella' + (childCount > 0 ? ' e tutto il suo contenuto (' + childCount + ' elementi)' : '') + '?';
    }

    closeContextMenu();
    history.back();

    setTimeout(function () {
      if (confirm(message)) {
        deleteRecursive(item.id);
        saveData();
        renderItems();
      }
    }, 200);
  });

  // ── Download Handling ──
  function getNoteContentAsText(note) {
    let title = getNoteTitle(note);
    let text = '=== ' + title + ' ===\n\n';
    if (note.mode === 'list' && note.checklist && note.checklist.length > 0) {
      text += note.checklist.map(function(item) {
        return (item.checked ? '[x] ' : '[ ] ') + item.text;
      }).join('\n');
    } else {
      text += note.content || '';
    }
    return text;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadNoteText(note) {
    let title = getNoteTitle(note) || 'Nota';
    title = title.replace(/[\/\?<>\\:\*\|":]/g, '').trim() || 'Nota';
    const text = getNoteContentAsText(note);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, title + '.txt');
  }

  function addFolderToZip(zipFolder, folderId) {
    const children = getChildren(folderId);
    children.forEach(function(child) {
      if (child.deleted) return;
      if (child.type === 'note') {
        const text = getNoteContentAsText(child);
        let title = getNoteTitle(child) || 'Nota';
        title = title.replace(/[\/\?<>\\:\*\|":]/g, '').trim() || 'Nota';
        zipFolder.file(title + ' - ' + child.id.substring(0,4) + '.txt', text);
      } else if (child.type === 'folder') {
        let name = child.name || 'Cartella';
        name = name.replace(/[\/\?<>\\:\*\|":]/g, '').trim() || 'Cartella';
        const subFolder = zipFolder.folder(name + ' - ' + child.id.substring(0,4));
        addFolderToZip(subFolder, child.id);
      }
    });
  }

  function downloadFolderZip(folder) {
    if (!window.JSZip) {
      alert("La libreria di download non è ancora pronta. Riprova tra poco.");
      return;
    }
    const zip = new JSZip();
    let name = folder.name || 'Cartella';
    name = name.replace(/[\/\?<>\\:\*\|":]/g, '').trim() || 'Cartella';
    
    const baseFolder = zip.folder(name);
    addFolderToZip(baseFolder, folder.id);

    zip.generateAsync({type:"blob"}).then(function(content) {
        downloadBlob(content, name + '.zip');
    });
  }

  contextDownload.addEventListener('click', function () {
    const item = getItem(contextMenuItemId);
    if (!item) return;

    closeContextMenu();
    history.back();

    setTimeout(function () {
      if (item.type === 'note') {
        downloadNoteText(item);
      } else if (item.type === 'folder') {
        downloadFolderZip(item);
      }
    }, 200);
  });

  // ── Move Picker ──
  const movePickerOverlay = document.getElementById('move-picker-overlay');
  const movePickerPath = document.getElementById('move-picker-path');
  const movePickerList = document.getElementById('move-picker-list');
  const movePickerCancel = document.getElementById('move-picker-cancel');
  const movePickerConfirm = document.getElementById('move-picker-confirm');
  let moveItemId = null;
  let movePickerCurrentFolder = null; // null = root

  function isDescendantOf(itemId, parentId) {
    // Check if parentId is a descendant of itemId (to prevent circular moves)
    let current = parentId;
    while (current) {
      if (current === itemId) return true;
      const item = getItem(current);
      if (!item) break;
      current = item.parentId;
    }
    return false;
  }

  function getMovePickerPath(folderId) {
    if (folderId === null) return '/ Home';
    const ancestors = getAncestors(folderId);
    return '/ Home / ' + ancestors.map(function(a) { return a.name; }).join(' / ');
  }

  function renderMovePicker() {
    movePickerList.innerHTML = '';
    movePickerPath.textContent = getMovePickerPath(movePickerCurrentFolder);

    var fragment = document.createDocumentFragment();

    // Back button (go up) if not at root
    if (movePickerCurrentFolder !== null) {
      var backItem = document.createElement('button');
      backItem.className = 'move-picker-item back-item';
      backItem.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
        '<span>Indietro</span>';
      backItem.addEventListener('click', function() {
        var parent = getItem(movePickerCurrentFolder);
        movePickerCurrentFolder = parent ? parent.parentId : null;
        renderMovePicker();
      });
      fragment.appendChild(backItem);
    }

    // Show subfolders (excluding the item being moved and its descendants)
    var folders = getChildren(movePickerCurrentFolder).filter(function(i) {
      if (i.deleted) return false;
      if (i.type !== 'folder') return false;
      if (i.id === moveItemId) return false;
      if (isDescendantOf(moveItemId, i.id)) return false;
      return true;
    }).sort(function(a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    if (folders.length === 0 && movePickerCurrentFolder === null) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'move-picker-empty';
      emptyEl.textContent = 'Nessuna cartella disponibile';
      fragment.appendChild(emptyEl);
    } else if (folders.length === 0) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'move-picker-empty';
      emptyEl.textContent = 'Nessuna sottocartella';
      fragment.appendChild(emptyEl);
    }

    folders.forEach(function(folder) {
      var row = document.createElement('button');
      row.className = 'move-picker-item';
      var childFolders = getChildren(folder.id).filter(function(c) { return !c.deleted && c.type === 'folder' && c.id !== moveItemId; });
      row.innerHTML = ICONS.folder +
        '<span>' + (folder.name || 'Senza nome') + '</span>' +
        (childFolders.length > 0 ? '<svg class="move-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : '');
      row.addEventListener('click', function() {
        movePickerCurrentFolder = folder.id;
        renderMovePicker();
      });
      fragment.appendChild(row);
    });

    movePickerList.appendChild(fragment);
  }

  function openMovePicker(itemId) {
    moveItemId = itemId;
    var item = getItem(itemId);
    movePickerCurrentFolder = item ? item.parentId : null; // Start at the item's current parent
    renderMovePicker();
    movePickerOverlay.classList.add('visible');
    history.pushState({ view: 'movePicker' }, '');
  }

  function closeMovePicker() {
    movePickerOverlay.classList.remove('visible');
    moveItemId = null;
  }

  if (contextMove) {
    contextMove.addEventListener('click', function () {
      var itemId = contextMenuItemId;
      closeContextMenu();
      history.back();

      setTimeout(function () {
        openMovePicker(itemId);
      }, 200);
    });
  }

  movePickerCancel.addEventListener('click', function() {
    closeMovePicker();
    history.back();
  });

  movePickerConfirm.addEventListener('click', function() {
    if (moveItemId) {
      var item = getItem(moveItemId);
      if (item) {
        // Don't move into itself
        if (movePickerCurrentFolder !== moveItemId && !isDescendantOf(moveItemId, movePickerCurrentFolder)) {
          item.parentId = movePickerCurrentFolder;
          item.updatedAt = now();
          saveData();
          renderAll();
        }
      }
    }
    closeMovePicker();
    history.back();
  });

  movePickerOverlay.addEventListener('click', function(e) {
    if (e.target === movePickerOverlay) {
      closeMovePicker();
      history.back();
    }
  });

  // ── Android Back Button / Browser History ──
  window.addEventListener('popstate', function (e) {
    const state = e.state;

    // Close any open overlays
    if (editorView.classList.contains('visible')) {
      closeNoteEditor();
    }
    if (trashView.classList.contains('visible')) {
      trashView.classList.remove('visible');
    }
    if (contextOverlay.classList.contains('visible')) {
      closeContextMenu();
    }
    if (modalOverlay.classList.contains('visible')) {
      hideModal();
    }
    if (movePickerOverlay.classList.contains('visible')) {
      closeMovePicker();
    }
    if (settingsOverlay.classList.contains('visible')) {
      settingsOverlay.classList.remove('visible');
    }

    // Navigate to the folder indicated by the state
    if (state && state.view === 'folder') {
      currentFolderId = state.folderId;
      renderAll();
    }
  });

  // ── Settings & Theme ──
  const settingsBtn = document.getElementById('settings-btn');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsClose = document.getElementById('settings-close');
  const sortSelect = document.getElementById('sort-select');
  
  // Ensure we have a default value if first time
  if (!localStorage.getItem('notesAppSortType')) {
    localStorage.setItem('notesAppSortType', 'alpha');
  }
  
  const currentSortType = localStorage.getItem('notesAppSortType') || 'alpha';
  if (sortSelect) {
    sortSelect.value = currentSortType;
    sortSelect.addEventListener('change', function() {
      const val = this.value;
      localStorage.setItem('notesAppSortType', val);
      renderAll();
    });
  }

  const ACCENT_COLORS = {
    'white': '#ffffff',
    'blue': '#38bdf8',
    'green': '#10b981',
    'purple': '#a78bfa',
    'orange': '#f59e0b',
    'pink': '#f472b6',
    'red': '#ef4444',
    'teal': '#14b8a6',
    'indigo': '#6366f1'
  };

  let currentAppTheme = localStorage.getItem('notesAppThemeNew') || 'auto';
  let currentAppAccent = localStorage.getItem('notesAppAccentNew') || 'white';

  function applyTheme() {
    let baseTheme = currentAppTheme;
    if (baseTheme === 'auto') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      baseTheme = prefersLight ? 'light' : 'dark';
    }

    document.documentElement.setAttribute('data-theme', baseTheme);
    const accentHex = ACCENT_COLORS[currentAppAccent] || ACCENT_COLORS['white'];
    document.documentElement.style.setProperty('--accent', accentHex);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', baseTheme === 'light' ? '#ffffff' : '#000000');
    }

    syncThemeUI();
  }

  function syncThemeUI() {
    document.querySelectorAll('.theme-option').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === currentAppTheme);
    });
    document.querySelectorAll('.color-swatch').forEach(function(sw) {
      sw.classList.toggle('active', sw.dataset.color === currentAppAccent);
    });
  }

  document.querySelectorAll('.theme-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentAppTheme = this.dataset.theme;
      localStorage.setItem('notesAppThemeNew', currentAppTheme);
      applyTheme();
    });
  });

  document.querySelectorAll('.color-swatch').forEach(function(sw) {
    sw.addEventListener('click', function() {
      currentAppAccent = this.dataset.color;
      localStorage.setItem('notesAppAccentNew', currentAppAccent);
      applyTheme();
    });
  });

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
    if (currentAppTheme === 'auto') {
      applyTheme();
    }
  });

  // Call it immediately on load (in case body onload is not used for this)
  applyTheme();

  settingsBtn.addEventListener('click', function() {
    settingsOverlay.classList.add('visible');
    history.pushState({ view: 'settings' }, '');
  });

  settingsClose.addEventListener('click', function() {
    settingsOverlay.classList.remove('visible');
    history.back();
  });

  settingsOverlay.addEventListener('click', function(e) {
    if (e.target === settingsOverlay) {
      settingsOverlay.classList.remove('visible');
      history.back();
    }
  });

  // ── Backup Data ──
  document.getElementById('export-btn').addEventListener('click', function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({items: items}));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "notes_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  });

  document.getElementById('import-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && Array.isArray(imported.items)) {
          items = imported.items;
          saveData();
          renderAll();
          alert('Dati importati con successo!');
          settingsOverlay.classList.remove('visible');
          history.back();
        }
      } catch (err) {
        alert('File non valido.');
      }
    };
    reader.readAsText(file);
  });

  var resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      if (confirm('Sei sicuro di voler cancellare tutti i dati? Questa azione è irreversibile.')) {
        items = [];
        saveData();
        renderAll();
        settingsOverlay.classList.remove('visible');
        history.back();
      }
    });
  }

  // ── Trash View ──
  const trashView = document.getElementById('trash-view');
  const openTrashBtn = document.getElementById('open-trash-btn');
  const trashBackBtn = document.getElementById('trash-back-btn');
  const emptyTrashBtn = document.getElementById('empty-trash-btn');
  const trashList = document.getElementById('trash-list');
  const trashEmptyState = document.getElementById('trash-empty-state');

  function renderTrashList() {
    trashList.innerHTML = '';
    const deletedItems = items.filter(function(i) { return i.deleted; }).sort(function(a, b) {
      const db = b.deletedAt || b.updatedAt;
      const da = a.deletedAt || a.updatedAt;
      if (!db) return -1;
      if (!da) return 1;
      return db > da ? 1 : (db < da ? -1 : 0);
    });
    if (deletedItems.length === 0) {
      trashEmptyState.style.display = 'flex';
      trashList.style.display = 'none';
      emptyTrashBtn.style.display = 'none';
    } else {
      trashEmptyState.style.display = 'none';
      trashList.style.display = 'flex';
      emptyTrashBtn.style.display = 'flex';

      const fragment = document.createDocumentFragment();
      deletedItems.forEach(function(item) {
        const card = document.createElement('div');
        card.className = 'item-card';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'item-icon';
        iconDiv.innerHTML = item.type === 'folder' ? ICONS.folder : ICONS.note;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'item-name';
        nameEl.textContent = item.type === 'folder' ? item.name : getNoteTitle(item);
        infoDiv.appendChild(nameEl);

        const dateEl = document.createElement('div');
        dateEl.className = 'item-date';
        dateEl.textContent = 'Eliminato il ' + formatDate(item.deletedAt || item.updatedAt);
        infoDiv.appendChild(dateEl);

        card.appendChild(iconDiv);
        card.appendChild(infoDiv);

        // Restore button
        const restoreDiv = document.createElement('div');
        restoreDiv.className = 'item-rename-icon';
        restoreDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11V9a4 4 0 0 1 4-4h14M8 1l-5 4 5 4M21 13v2a4 4 0 0 1-4 4H3M16 23l5-4-5-4"/></svg>';
        restoreDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            item.deleted = false;
            item.deletedAt = null;
            saveData();
            renderTrashList();
            renderAll();
        });

        // Permanent delete
        const permDeleteDiv = document.createElement('div');
        permDeleteDiv.className = 'item-rename-icon';
        permDeleteDiv.innerHTML = ICONS.trash;
        permDeleteDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm("Eliminare definitivamente questo elemento?")) {
                deleteRecursive(item.id, true);
                saveData();
                renderTrashList();
                renderAll();
            }
        });

        card.appendChild(restoreDiv);
        card.appendChild(permDeleteDiv);
        fragment.appendChild(card);
      });
      trashList.appendChild(fragment);
    }
  }

  openTrashBtn.addEventListener('click', function() {
    settingsOverlay.classList.remove('visible');
    history.back(); // Pop settings state
    setTimeout(function() {
      renderTrashList();
      trashView.classList.add('visible');
      history.pushState({ view: 'trash' }, '');
    }, 200);
  });

  trashBackBtn.addEventListener('click', function() {
    trashView.classList.remove('visible');
    history.back();
  });

  emptyTrashBtn.addEventListener('click', function() {
    if (confirm('Sei sicuro di voler svuotare il cestino? Tutti gli elementi al suo interno verranno eliminati permanentemente.')) {
      // Find all top-level deleted items and permanently delete them, so their children go too
      const deletedItems = items.filter(function(i) { return i.deleted; });
      const idsToDelete = deletedItems.map(function(i) { return i.id; });
      if (idsToDelete.length > 0) {
        deleteRecursive(idsToDelete, true);
      }
      saveData();
      renderTrashList();
      renderAll();
    }
  });

  // ══════════════════════════════════════════════════════════
  //  Checklist / List Mode
  // ══════════════════════════════════════════════════════════

  const editorToggleList = document.getElementById('editor-toggle-list');
  const iconChecklist = document.getElementById('icon-checklist');
  const iconPencil = document.getElementById('icon-pencil');
  const checklistContainer = document.getElementById('checklist-container');
  const checklistItemsEl = document.getElementById('checklist-items');
  const checklistCompletedSection = document.getElementById('checklist-completed-section');
  const checklistCompletedItemsEl = document.getElementById('checklist-completed-items');
  const checklistNewInput = document.getElementById('checklist-new-input');

  let isListMode = false;

  // Toggle button handler
  editorToggleList.addEventListener('click', function () {
    const note = getItem(currentEditingNoteId);
    if (!note) return;

    if (!isListMode) {
      // Switch to LIST mode
      switchToListMode(note);
    } else {
      // Switch back to NOTE mode
      switchToNoteMode(note);
    }
  });

  function switchToListMode(note) {
    isListMode = true;
    iconChecklist.style.display = 'none';
    iconPencil.style.display = '';

    // Always sync from textarea to checklist
    const currentText = editorTextarea.value || '';
    const lines = currentText.split('\n').filter(function (l) { return l.trim() !== ''; });
    
    // Preserve state of existing checklist items if their text matches exactly
    const existingChecklist = note.checklist || [];
    const usedIds = {};
    
    note.checklist = lines.map(function (line) {
      // Find a matching item that hasn't been used yet
      const match = existingChecklist.find(function(item) {
        return item.text === line && !usedIds[item.id];
      });
      
      if (match) {
        usedIds[match.id] = true;
        return { id: match.id, text: match.text, checked: match.checked };
      }
      return { id: generateId(), text: line, checked: false };
    });

    note.mode = 'list';
    saveData();

    editorTextareaContainer.style.display = 'none';
    checklistContainer.style.display = '';
    renderChecklist(note);
  }

  function switchToNoteMode(note) {
    isListMode = false;
    iconChecklist.style.display = '';
    iconPencil.style.display = 'none';

    // Always sync from checklist to textarea
    const allItems = note.checklist || [];
    
    // Render order: Pending items first, then Completed items
    const pending = allItems.filter(function(i) { return !i.checked; });
    const completed = allItems.filter(function(i) { return i.checked; });
    const orderedItems = pending.concat(completed);
    
    // Save the ordered checklist so text mode matches the visual list order
    note.checklist = orderedItems;
    note.content = orderedItems.map(function (item) { return item.text; }).join('\n');
    
    note.mode = 'note';
    saveData();

    editorTextareaContainer.style.display = '';
    editorTextarea.value = note.content;
    if (typeof updateBackdrop === 'function') updateBackdrop();
    checklistContainer.style.display = 'none';
    updateCharCount();
  }

  // ── Render Checklist ──
  function renderChecklist(note) {
    if (!note || !note.checklist) return;

    checklistItemsEl.innerHTML = '';
    checklistCompletedItemsEl.innerHTML = '';

    var pending = note.checklist.filter(function (i) { return !i.checked; });
    var completed = note.checklist.filter(function (i) { return i.checked; });

    pending.forEach(function (item) {
      checklistItemsEl.appendChild(createChecklistRow(item, note, false));
    });

    if (completed.length > 0) {
      checklistCompletedSection.style.display = '';
      completed.forEach(function (item) {
        checklistCompletedItemsEl.appendChild(createChecklistRow(item, note, true));
      });
    } else {
      checklistCompletedSection.style.display = 'none';
    }
  }

  function createChecklistRow(item, note, isCompleted) {
    var row = document.createElement('div');
    row.className = 'checklist-row' + (isCompleted ? ' completed' : '');
    row.dataset.itemId = item.id;

    // Checkbox
    var cb = document.createElement('button');
    cb.className = 'checklist-checkbox' + (item.checked ? ' checked' : '');
    cb.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    cb.addEventListener('click', function (e) {
      e.stopPropagation();
      item.checked = !item.checked;
      note.updatedAt = now();
      saveData();
      renderChecklist(note);
    });

    // Text input
    var textEl = document.createElement('input');
    textEl.type = 'text';
    textEl.className = 'checklist-text';
    textEl.value = item.text;
    textEl.placeholder = 'Scrivi qui...';
    if (isCompleted) {
      textEl.readOnly = true;
    }
    textEl.addEventListener('input', function () {
      item.text = this.value;
      note.updatedAt = now();
      debouncedSave();
    });
    // When pressing enter in text field, create new item below
    textEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var newItem = { id: generateId(), text: '', checked: false };
        // Insert after current item
        var idx = note.checklist.indexOf(item);
        note.checklist.splice(idx + 1, 0, newItem);
        note.updatedAt = now();
        saveData();
        renderChecklist(note);
        // Focus new item
        setTimeout(function () {
          var newRow = checklistItemsEl.querySelector('[data-item-id="' + newItem.id + '"]');
          if (newRow) {
            var inp = newRow.querySelector('.checklist-text');
            if (inp) inp.focus();
          }
        }, 50);
      }
      // Backspace on empty field: delete this item and focus previous
      if (e.key === 'Backspace' && this.value === '') {
        e.preventDefault();
        var idx = note.checklist.indexOf(item);
        if (idx > 0 || note.checklist.length > 1) {
          note.checklist.splice(idx, 1);
          note.updatedAt = now();
          saveData();
          renderChecklist(note);
          // Focus previous item
          if (idx > 0) {
            var prevItems = checklistItemsEl.querySelectorAll('.checklist-row');
            var focusIdx = Math.min(idx - 1, prevItems.length - 1);
            if (prevItems[focusIdx]) {
              var inp = prevItems[focusIdx].querySelector('.checklist-text');
              if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
            }
          }
        }
      }
    });

    // Delete button
    var del = document.createElement('button');
    del.className = 'checklist-delete';
    del.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      var idx = note.checklist.indexOf(item);
      if (idx !== -1) {
        note.checklist.splice(idx, 1);
        note.updatedAt = now();
        saveData();
        renderChecklist(note);
      }
    });

    row.appendChild(cb);
    row.appendChild(textEl);
    row.appendChild(del);

    // ── Drag to Reorder (long press) ──
    if (!isCompleted) {
      setupDragReorder(row, item, note);
    }

    return row;
  }

  // ── Drag-to-Reorder Logic ──
  function setupDragReorder(row, item, note) {
    var longPressTimer = null;
    var isDragging = false;
    var startY = 0;
    var currentY = 0;
    var rowRect = null;
    var allRows = [];
    var originalIndex = -1;

    row.addEventListener('pointerdown', function (e) {
      // Don't interfere with checkbox or delete button
      if (e.target.closest('.checklist-checkbox') ||
          e.target.closest('.checklist-delete')) {
        return;
      }

      startY = e.clientY;
      var pointerId = e.pointerId;

      longPressTimer = setTimeout(function () {
        isDragging = true;
        if (navigator.vibrate) navigator.vibrate(25);

        row.classList.add('dragging');
        row.setPointerCapture(pointerId);
        rowRect = row.getBoundingClientRect();
        originalIndex = getPendingIndex(item, note);

        // Get all pending rows for reorder reference
        allRows = Array.prototype.slice.call(checklistItemsEl.querySelectorAll('.checklist-row'));
        
        // If the element focused was the input, blur it so the virtual keyboard doesn't mess with dragging
        const activeItem = document.activeElement;
        if (activeItem && activeItem.classList.contains('checklist-text')) {
          activeItem.blur();
        }
      }, 400);
    });

    row.addEventListener('pointermove', function (e) {
      if (!isDragging) {
        // If moved too much before long press, cancel
        if (longPressTimer && Math.abs(e.clientY - startY) > 15) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        return;
      }

      var dy = e.clientY - startY;
      row.style.transform = 'translateY(' + dy + 'px)';

      // Determine which row we're hovering over
      var hoveredIndex = -1;
      allRows.forEach(function (r, i) {
        if (r === row) return;
        var rect = r.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        if (e.clientY > midY - 10 && e.clientY < midY + 10) {
          hoveredIndex = i;
        }
      });

      // Visual hint: shift rows
      allRows.forEach(function (r, i) {
        if (r === row) return;
        var rect = r.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        if (e.clientY < midY && i < originalIndex) {
          r.style.transform = 'translateY(' + (rowRect.height + 4) + 'px)';
        } else if (e.clientY > midY && i > originalIndex) {
          r.style.transform = 'translateY(-' + (rowRect.height + 4) + 'px)';
        } else {
          r.style.transform = '';
        }
      });
    });

    function handleDragEnd(e) {
      clearTimeout(longPressTimer);
      longPressTimer = null;

      if (!isDragging) return;
      isDragging = false;

      row.classList.remove('dragging');
      row.style.transform = '';
      allRows.forEach(function (r) { r.style.transform = ''; });

      // Calculate new index based on position
      var pendingItems = note.checklist.filter(function (i) { return !i.checked; });
      var oldIdx = pendingItems.indexOf(item);
      var newIdx = oldIdx;

      // Find where the row was dropped relative to other rows
      allRows.forEach(function (r, i) {
        if (r === row) return;
        var rect = r.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        if (e.clientY < midY && i <= oldIdx) {
          newIdx = Math.min(newIdx, i);
        } else if (e.clientY > midY && i >= oldIdx) {
          newIdx = Math.max(newIdx, i);
        }
      });

      if (newIdx !== oldIdx) {
        // Remove from checklist and reinsert
        var fullIdx = note.checklist.indexOf(item);
        note.checklist.splice(fullIdx, 1);

        // Find position in the full array corresponding to the new pending index
        var pendingCount = 0;
        var insertAt = 0;
        for (var i = 0; i < note.checklist.length; i++) {
          if (!note.checklist[i].checked) {
            if (pendingCount === newIdx) {
              insertAt = i;
              break;
            }
            pendingCount++;
          }
          insertAt = i + 1;
        }
        note.checklist.splice(insertAt, 0, item);
        note.updatedAt = now();
        saveData();
      }

      renderChecklist(note);
    }

    row.addEventListener('pointerup', handleDragEnd);
    row.addEventListener('pointercancel', handleDragEnd);
  }

  function getPendingIndex(item, note) {
    var pending = note.checklist.filter(function (i) { return !i.checked; });
    return pending.indexOf(item);
  }

  // ── Add New Checklist Item ──
  checklistNewInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var text = this.value.trim();
      if (!text) return;
      var note = getItem(currentEditingNoteId);
      if (!note) return;
      if (!note.checklist) note.checklist = [];
      var newItem = { id: generateId(), text: text, checked: false };
      // Insert before completed items (at end of pending)
      var lastPendingIdx = -1;
      for (var i = note.checklist.length - 1; i >= 0; i--) {
        if (!note.checklist[i].checked) { lastPendingIdx = i; break; }
      }
      note.checklist.splice(lastPendingIdx + 1, 0, newItem);
      note.updatedAt = now();
      saveData();
      this.value = '';
      renderChecklist(note);
      // Focus the new item text
      setTimeout(function () {
        var newRow = checklistItemsEl.querySelector('[data-item-id="' + newItem.id + '"]');
        if (newRow) newRow.classList.add('animate-in');
      }, 10);
    }
  });

  // ── Update openNoteEditor to handle list mode + attachments ──
  var _originalOpenNoteEditor = openNoteEditor;

  const editorAttachBtn = document.getElementById('editor-attach-btn');
  const editorFileInput = document.getElementById('editor-file-input');
  const attachmentsSection = document.getElementById('attachments-section');
  const attachmentsList = document.getElementById('attachments-list');

  openNoteEditor = function (noteId, isNew) {
    var note = getItem(noteId);
    if (!note) return;

    currentEditingNoteId = noteId;
    editorTitleInput.value = note.name || '';

    // Determine mode
    if (note.mode === 'list') {
      isListMode = true;
      iconChecklist.style.display = 'none';
      iconPencil.style.display = '';
      editorTextareaContainer.style.display = 'none';
      checklistContainer.style.display = '';
      editorTextarea.value = note.content || '';
      renderChecklist(note);
    } else {
      isListMode = false;
      iconChecklist.style.display = '';
      iconPencil.style.display = 'none';
      editorTextareaContainer.style.display = '';
      checklistContainer.style.display = 'none';
      editorTextarea.value = note.content || '';
    }

    if (typeof updateBackdrop === 'function') updateBackdrop();

    updateCharCount();
    renderAttachments(note);
    editorView.classList.add('visible');
    document.body.classList.add('editor-open');
    history.pushState({ view: 'editor', noteId: noteId }, '');

    // Adjust textarea height and scroll to top
    if (!isListMode) {
      editorTextarea.style.height = 'auto';
      editorTextarea.style.height = editorTextarea.scrollHeight + 'px';
    }
    const wrapper = document.querySelector('.editor-content-wrapper');
    if (wrapper) wrapper.scrollTop = 0;

    if (isNew) {
      setTimeout(function () {
        editorTitleInput.focus();
      }, 350);
    }
  };

  // ── Update closeNoteEditor to handle list mode + attachments ──
  var _originalCloseNoteEditor = closeNoteEditor;

  closeNoteEditor = function () {
    if (currentEditingNoteId) {
      var note = getItem(currentEditingNoteId);
      if (note) {
        note.name = editorTitleInput.value;
        if (isListMode) {
          if (note.checklist && note.checklist.length > 0) {
            note.content = note.checklist.map(function (i) { return i.text; }).join('\n');
          }
        } else {
          note.content = editorTextarea.value;
        }
        note.updatedAt = now();
        saveData();
      }
      currentEditingNoteId = null;
    }

    // Reset list mode state
    isListMode = false;
    iconChecklist.style.display = '';
    iconPencil.style.display = 'none';
    editorTextareaContainer.style.display = '';
    checklistContainer.style.display = 'none';

    // Reset attachments
    attachmentsSection.style.display = 'none';
    attachmentsList.innerHTML = '';

    editorView.classList.remove('visible');
    document.body.classList.remove('editor-open');
    editorTitleInput.blur();
    editorTextarea.blur();
    renderItems();
  };

  // ══════════════════════════════════════════════════════════
  //  File Attachments
  // ══════════════════════════════════════════════════════════

  editorAttachBtn.addEventListener('click', function () {
    editorFileInput.click();
  });

  editorFileInput.addEventListener('change', function (e) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    var note = getItem(currentEditingNoteId);
    if (!note) return;
    if (!note.attachments) note.attachments = [];

    var filesProcessed = 0;
    var totalFiles = files.length;

    for (var i = 0; i < totalFiles; i++) {
      (function (file) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          note.attachments.push({
            id: generateId(),
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: ev.target.result,
            addedAt: now()
          });
          filesProcessed++;
          if (filesProcessed === totalFiles) {
            note.updatedAt = now();
            saveData();
            renderAttachments(note);
          }
        };
        reader.readAsDataURL(file);
      })(files[i]);
    }

    // Reset input so the same file can be selected again
    editorFileInput.value = '';
  });

  function renderAttachments(note) {
    if (!note || !note.attachments || note.attachments.length === 0) {
      attachmentsSection.style.display = 'none';
      attachmentsList.innerHTML = '';
      return;
    }

    attachmentsSection.style.display = '';
    attachmentsList.innerHTML = '';

    note.attachments.forEach(function (att) {
      var item = document.createElement('div');
      item.className = 'attachment-item';

      var isImage = att.type && att.type.startsWith('image/');

      if (isImage) {
        // Image preview
        var imgWrapper = document.createElement('div');
        imgWrapper.className = 'attachment-image-wrapper';

        var img = document.createElement('img');
        img.className = 'attachment-image';
        img.src = att.data;
        img.alt = att.name;
        img.loading = 'lazy';
        imgWrapper.appendChild(img);

        var imgName = document.createElement('div');
        imgName.className = 'attachment-image-name';
        imgName.textContent = att.name;

        item.appendChild(imgWrapper);
        item.appendChild(imgName);
      } else {
        // File block
        var fileDiv = document.createElement('div');
        fileDiv.className = 'attachment-file';

        var iconDiv = document.createElement('div');
        iconDiv.className = 'attachment-file-icon';
        iconDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

        var infoDiv = document.createElement('div');
        infoDiv.className = 'attachment-file-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'attachment-file-name';
        nameEl.textContent = att.name;

        var extEl = document.createElement('div');
        extEl.className = 'attachment-file-ext';
        var ext = att.name.split('.').pop();
        extEl.textContent = ext !== att.name ? '.' + ext + ' — ' + formatFileSize(att.size) : formatFileSize(att.size);

        infoDiv.appendChild(nameEl);
        infoDiv.appendChild(extEl);
        fileDiv.appendChild(iconDiv);
        fileDiv.appendChild(infoDiv);
        item.appendChild(fileDiv);
      }

      // Delete button
      var delBtn = document.createElement('button');
      delBtn.className = 'attachment-delete';
      delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = note.attachments.indexOf(att);
        if (idx !== -1) {
          note.attachments.splice(idx, 1);
          note.updatedAt = now();
          saveData();
          renderAttachments(note);
        }
      });
      item.appendChild(delBtn);

      attachmentsList.appendChild(item);
    });
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ══════════════════════════════════════════════════════════
  //  Google Auth & Drive Sync
  // ══════════════════════════════════════════════════════════

  // ⚠️ REPLACE THIS with your actual Google Cloud OAuth Client ID
  var GOOGLE_CLIENT_ID = '662885517517-vub0f92dpv1765ckf02nn3ubpgqtpa25.apps.googleusercontent.com';
  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var DRIVE_FILE_NAME = 'notes_app_data.json';

  // DOM refs
  var googleSignedOut = document.getElementById('google-signed-out');
  var googleSignedIn = document.getElementById('google-signed-in');
  var googleSigninBtn = document.getElementById('google-signin-btn');
  var googleSignoutBtn = document.getElementById('google-signout-btn');
  var profileAvatar = document.getElementById('profile-avatar');
  var profileName = document.getElementById('profile-name');
  var profileEmail = document.getElementById('profile-email');
  var syncNowBtn = document.getElementById('sync-now-btn');
  var syncStatusEl = document.getElementById('sync-status');
  var syncIndicator = document.getElementById('sync-status-btn');

  var googleAccessToken = null;
  var googleUser = null;
  var driveFileId = null;
  var isSyncing = false;
  var tokenClient = null;

  // ── Sync Diagnostic Log ──
  var syncLog = [];
  function logSyncEvent(msg, type) {
    syncLog.push({ time: new Date().toLocaleTimeString('it-IT'), msg: msg, type: type || 'info' });
    if (syncLog.length > 30) syncLog.shift();
    renderSyncLog();
  }
  function renderSyncLog() {
    var el = document.getElementById('sync-details-log');
    if (!el) return;
    if (syncLog.length === 0) {
      el.innerHTML = '<div class="sync-log-empty">Nessun evento recente</div>';
      return;
    }
    var html = '';
    for (var i = syncLog.length - 1; i >= 0; i--) {
      var e = syncLog[i];
      var cls = e.type === 'error' ? 'sync-log-error' : e.type === 'success' ? 'sync-log-success' : 'sync-log-info';
      html += '<div class="sync-log-entry ' + cls + '"><span class="sync-log-time">' + e.time + '</span>' + e.msg + '</div>';
    }
    el.innerHTML = html;
  }
  window.toggleSyncDetails = function() {
    var el = document.getElementById('sync-details-log');
    var chevron = document.getElementById('sync-details-chevron');
    if (!el) return;
    var isHidden = el.style.display === 'none' || !el.style.display;
    el.style.display = isHidden ? 'block' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
  };

  // ── Token Persistence Helpers ──
  function saveTokenToStorage(accessToken, expiresIn) {
    var expiryTime = Date.now() + (expiresIn * 1000) - 60000; // 1 min margin
    localStorage.setItem('notesGoogleToken', JSON.stringify({
      token: accessToken,
      expiry: expiryTime
    }));
  }

  function loadTokenFromStorage(returnFullData) {
    try {
      var saved = localStorage.getItem('notesGoogleToken');
      if (!saved) return null;
      var parsed = JSON.parse(saved);
      if (parsed.token && parsed.expiry && Date.now() < parsed.expiry) {
        return returnFullData === true ? parsed : parsed.token;
      }
      // Token expired, clean up
      localStorage.removeItem('notesGoogleToken');
      return null;
    } catch (e) {
      localStorage.removeItem('notesGoogleToken');
      return null;
    }
  }

  function clearTokenFromStorage() {
    localStorage.removeItem('notesGoogleToken');
  }


  // ══════════════════════════════════════════════════════════
  //  Token Refresh via GIS (Google Identity Services)
  //  The old gapi.auth.authorize({ immediate: true }) API is
  //  DEPRECATED and broken in modern browsers (third-party
  //  cookies are blocked). We now use the GIS tokenClient
  //  exclusively for obtaining tokens. When the user has
  //  already granted consent, requestAccessToken({ prompt: '' })
  //  opens a popup that auto-closes near-instantly.
  // ══════════════════════════════════════════════════════════

  // Pending token request: only one at a time.
  // Stores { resolve, reject } from the Promise so the
  // handleTokenResponse callback can fulfil it.
  var _pendingTokenRequest = null;

  // Request a fresh token via GIS tokenClient.
  // If prompt is '' and user already consented, the popup
  // auto-closes in <1s. Returns a Promise with the token.
  function requestTokenSilently() {
    if (_pendingTokenRequest) {
      // Already in flight — return the same promise
      return _pendingTokenRequest.promise;
    }
    var p = new Promise(function (resolve, reject) {
      _pendingTokenRequest = { resolve: resolve, reject: reject };

      if (!tokenClient) {
        _pendingTokenRequest = null;
        reject(new Error('tokenClient non inizializzato'));
        return;
      }

      // Timeout: if nothing comes back within 15s, give up
      _pendingTokenRequest.timeout = setTimeout(function () {
        if (_pendingTokenRequest) {
          var rej = _pendingTokenRequest.reject;
          _pendingTokenRequest = null;
          rej(new Error('Token request timeout'));
        }
      }, 15000);

      try {
        tokenClient.requestAccessToken({
          prompt: '',
          login_hint: googleUser ? googleUser.email : ''
        });
        logSyncEvent('Richiesta token a Google...', 'info');
      } catch (err) {
        clearTimeout(_pendingTokenRequest.timeout);
        _pendingTokenRequest = null;
        reject(err);
      }
    });
    _pendingTokenRequest.promise = p;
    return p;
  }

  var tokenRefreshTimer = null;
  function schedulePredictiveTokenRefresh(expiresInSec) {
    if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
    var refreshDelayMs = (expiresInSec - 300) * 1000; 
    if (refreshDelayMs <= 0) refreshDelayMs = 10000;
    
    tokenRefreshTimer = setTimeout(function() {
      if (googleUser && googleUser.email) {
        requestTokenSilently()
          .then(function (accessToken) {
            logSyncEvent('Token rinnovato preventivamente', 'success');
          })
          .catch(function () {
            logSyncEvent('Refresh preventivo fallito, retry tra 60s', 'error');
            // Retry in 60s instead of giving up
            schedulePredictiveTokenRefresh(360);
          });
      }
    }, refreshDelayMs);
  }

  // ── Initialize Google Auth ──
  var _googleAuthInitRetries = 0;
  function initGoogleAuth() {
    // Check if GIS library is loaded
    if (typeof google === 'undefined' || !google.accounts) {
      var gScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (gScript && !gScript.dataset.hooked) {
        gScript.dataset.hooked = 'true';
        gScript.addEventListener('load', initGoogleAuth);
      }
      // Always add polling fallback — the load event may have already fired
      _googleAuthInitRetries++;
      if (_googleAuthInitRetries < 75) { // retry up to ~15s (75 × 200ms)
        setTimeout(initGoogleAuth, 200);
      }
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: handleTokenResponse,
      error_callback: function (err) {
        console.warn('GIS token error:', err);
        logSyncEvent('Errore richiesta token: ' + (err.type || err.message || JSON.stringify(err)), 'error');
        // Reject the pending request if any
        if (_pendingTokenRequest) {
          clearTimeout(_pendingTokenRequest.timeout);
          var rej = _pendingTokenRequest.reject;
          _pendingTokenRequest = null;
          rej(new Error(err.type || 'Token request error'));
        }
      }
    });

    logSyncEvent('Libreria Google caricata', 'info');

    // Check if we have a saved session
    var savedUser = localStorage.getItem('notesGoogleUser');
    if (savedUser) {
      try {
        googleUser = JSON.parse(savedUser);
        showSignedInUI();

        // Try to restore token from localStorage (no popup, no network call)
        var storedTokenObj = loadTokenFromStorage(true);
        if (storedTokenObj && storedTokenObj.token) {
          // Token is still valid — use it directly, completely silently
          googleAccessToken = storedTokenObj.token;
          logSyncEvent('Token valido ripristinato dalla cache', 'success');
          
          var timeToExpireSec = Math.floor((storedTokenObj.expiry - Date.now()) / 1000);
          schedulePredictiveTokenRefresh(timeToExpireSec);

          if (localStorage.getItem('notesLastSync')) {
            performStartupSync();
          } else {
            firstSyncCheck();
          }
        } else {
          // Token expired — request a new one via GIS
          logSyncEvent('Token scaduto, rinnovo via GIS...', 'info');
          updateSyncStatus('Rinnovo token...', 'syncing');
          requestTokenSilently().then(function () {
            logSyncEvent('Token ottenuto, avvio sync', 'success');
            if (localStorage.getItem('notesLastSync')) {
              performStartupSync();
            } else {
              firstSyncCheck();
            }
          }).catch(function (err) {
            console.log('Notes: silent token refresh failed —', err.message || err);
            logSyncEvent('Rinnovo token fallito: ' + (err.message || err), 'error');
            updateSyncStatus('Tocca Sincronizza per aggiornare', '');
          });
        }
      } catch (e) {
        localStorage.removeItem('notesGoogleUser');
        clearTokenFromStorage();
      }
    }
  }

  // ── Sign In ──
  googleSigninBtn.addEventListener('click', function () {
    if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com') {
      alert('⚠️ Client ID non configurato.\n\nPer attivare il login Google, inserisci il tuo Client ID OAuth nella variabile GOOGLE_CLIENT_ID in app.js.');
      return;
    }
    if (!tokenClient) {
      if (typeof google !== 'undefined' && google.accounts) {
        initGoogleAuth();
      }
      if (!tokenClient) {
        alert('Connessione in corso... Assicurati di avere internet (o disattiva eventuali AdBlock) e riprova a premere tra 2 secondi.');
        
        var oldGsi = document.querySelectorAll('script[src*="accounts.google.com/gsi/client"]');
        for (var i = 0; i < oldGsi.length; i++) oldGsi[i].remove();
        var oldGapi = document.querySelectorAll('script[src*="apis.google.com/js/api.js"]');
        for (var k = 0; k < oldGapi.length; k++) oldGapi[k].remove();

        var s = document.createElement('script');
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true; s.defer = true;
        s.onload = initGoogleAuth;
        var s2 = document.createElement('script');
        s2.src = "https://apis.google.com/js/api.js";
        s2.async = true; s2.defer = true;
        document.body.appendChild(s);
        document.body.appendChild(s2);

        return;
      }
    }
    tokenClient.requestAccessToken();
  });

  // ── Handle Token Response (user-initiated sign-in only) ──
  function handleTokenResponse(response) {
    if (response.error) {
      if (_pendingTokenRequest) {
        clearTimeout(_pendingTokenRequest.timeout);
        var rej = _pendingTokenRequest.reject;
        _pendingTokenRequest = null;
        rej(new Error(response.error));
      }
      console.error('Google auth error:', response);
      updateSyncStatus('Errore di autenticazione', 'error');
      return;
    }

    googleAccessToken = response.access_token;
    saveTokenToStorage(response.access_token, response.expires_in || 3600);
    schedulePredictiveTokenRefresh(response.expires_in || 3600);

    // If this was triggered by requestTokenSilently(), resolve the promise
    // and let the caller handle sync. No need to fetch user info again.
    if (_pendingTokenRequest) {
      clearTimeout(_pendingTokenRequest.timeout);
      var res = _pendingTokenRequest.resolve;
      _pendingTokenRequest = null;
      res(response.access_token);
      return;
    }

    // Fetch user profile
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': 'Bearer ' + googleAccessToken }
    })
    .then(function (res) { return res.json(); })
    .then(function (user) {
      googleUser = { name: user.name, email: user.email, picture: user.picture };
      localStorage.setItem('notesGoogleUser', JSON.stringify(googleUser));
      showSignedInUI();

      // Parallelize: Convert Avatar to Base64 (zero-latency future loads) without waiting
      if (user.picture) {
        var img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
          var cvs = document.createElement('canvas');
          cvs.width = img.width; cvs.height = img.height;
          cvs.getContext('2d').drawImage(img, 0, 0);
          try {
            googleUser.picture = cvs.toDataURL('image/jpeg', 0.8);
            localStorage.setItem('notesGoogleUser', JSON.stringify(googleUser));
            if (profileAvatar) profileAvatar.src = googleUser.picture;
          } catch (e) {}
        };
        img.src = user.picture;
      }

      // Parallelize: Launch initial sync detached from parsing flows
      setTimeout(function() {
        if (localStorage.getItem('notesLastSync')) {
          performStartupSync();
        } else {
          firstSyncCheck();
        }
      }, 0);
    })
    .catch(function (err) {
      console.error('Failed to fetch user info:', err);
    });
  }

  // ── Sign Out ──
  googleSignoutBtn.addEventListener('click', function () {
    if (googleAccessToken) {
      google.accounts.oauth2.revoke(googleAccessToken, function () {
        console.log('Token revoked');
      });
    }
    googleAccessToken = null;
    googleUser = null;
    driveFileId = null;
    localStorage.removeItem('notesGoogleUser');
    clearTokenFromStorage();
    localStorage.removeItem('notesLastSync');
    localStorage.removeItem('notesDriveFileId');
    showSignedOutUI();
  });

  // ── UI State ──
  function showSignedInUI() {
    googleSignedOut.style.display = 'none';
    googleSignedIn.style.display = '';
    if (googleUser) {
      profileName.textContent = googleUser.name || '';
      profileAvatar.src = googleUser.picture || '';
      profileAvatar.style.display = googleUser.picture ? '' : 'none';
    }
  }

  function showSignedOutUI() {
    googleSignedOut.style.display = '';
    googleSignedIn.style.display = 'none';
    if (syncIndicator) syncIndicator.style.display = 'none';
    updateSyncStatus('Non sincronizzato', '');
  }

  function updateSyncStatus(text, state) {
    if (!syncStatusEl) return;
    syncStatusEl.textContent = text;
    
    // Clean states: syncing, success, error, or neutral
    let className = 'sync-status-compact';
    if (state === 'syncing') className += ' syncing';
    else if (state === 'success') className += ' success';
    else if (state === 'error') className += ' error';
    
    syncStatusEl.className = className;
  }

  // ── Ensure we have a valid token (auto-refreshes if expired) ──
  function ensureToken() {
    return new Promise(function (resolve, reject) {
      // 1. Check in-memory token via local expiry timestamp
      var validToken = loadTokenFromStorage();
      if (validToken) {
        googleAccessToken = validToken;
        resolve(validToken);
        return;
      }

      // 2. Token expired or missing — attempt silent refresh
      googleAccessToken = null;
      if (googleUser && googleUser.email) {
        requestTokenSilently()
          .then(function (accessToken) {
            console.log('Notes: token auto-refreshed during ensureToken');
            logSyncEvent('Token auto-rinnovato', 'success');
            resolve(accessToken);
          })
          .catch(function (err) {
            console.warn('Notes: token refresh in ensureToken failed —', err.message);
            logSyncEvent('Token scaduto, rinnovo fallito', 'error');
            reject(new Error('Token scaduto. Tocca Sincronizza per aggiornare.'));
          });
      } else {
        reject(new Error('Nessun token disponibile. Accedi a Google.'));
      }
    });
  }

  function driveFetch(url, options, _isRetry) {
    options = options || {};
    options.headers = options.headers || {};
    // Always use the CURRENT token (critical for retries after refresh)
    options.headers['Authorization'] = 'Bearer ' + googleAccessToken;

    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status + ' ' + res.statusText);
        err.status = res.status;
        throw err;
      }
      return res;
    }).catch(function (err) {
      // On auth errors (401/403), try refreshing the token and retry once
      if (!_isRetry && err.status && (err.status === 401 || err.status === 403) && googleUser && googleUser.email) {
        logSyncEvent('Errore auth ' + err.status + ', retry con token aggiornato...', 'info');
        return requestTokenSilently().then(function (newToken) {
          // Re-create options to ensure fresh Authorization header
          var retryOpts = JSON.parse(JSON.stringify(options));
          retryOpts.headers['Authorization'] = 'Bearer ' + newToken;
          if (options.body) retryOpts.body = options.body;
          return driveFetch(url, retryOpts, true);
        });
      }
      // Convert raw network errors into user-friendly message
      var errMsg = (err.message || '').toLowerCase();
      if (errMsg.indexOf('failed to fetch') !== -1 || errMsg.indexOf('network') !== -1 || errMsg.indexOf('load failed') !== -1 || errMsg.indexOf('type error') !== -1) {
        logSyncEvent('Errore di rete (connessione assente)', 'error');
        throw new Error('Errore di rete. Controlla la connessione.');
      }
      throw err;
    });
  }

  function findDriveFile() {
    if (driveFileId) {
      return Promise.resolve({ id: driveFileId });
    }
    var savedId = localStorage.getItem('notesDriveFileId');
    if (savedId) {
      driveFileId = savedId;
      return Promise.resolve({ id: driveFileId });
    }

    return driveFetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27' +
      DRIVE_FILE_NAME + '%27&fields=files(id,modifiedTime)'
    )
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.files && data.files.length > 0) {
        driveFileId = data.files[0].id;
        localStorage.setItem('notesDriveFileId', driveFileId);
        return { id: driveFileId, modifiedTime: data.files[0].modifiedTime };
      }
      return null;
    });
  }

  // Read file content from Drive (with stale fileId recovery)
  function readDriveFile(fileId) {
    return driveFetch(
      'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media'
    )
    .then(function (res) { return res.json(); })
    .catch(function (err) {
      // File was deleted or account changed — clear stale cache and re-discover
      if (err.status === 404) {
        logSyncEvent('File cloud non trovato, ricerca...', 'info');
        driveFileId = null;
        localStorage.removeItem('notesDriveFileId');
      }
      throw err;
    });
  }

  // Create or update file on Drive
  function writeDriveFile(data) {
    var jsonStr = JSON.stringify(data);

    if (driveFileId) {
      // Opt. 1: Ultra-fast Media Upload for PATCH (payload halved by skipping metadata + boundaries)
      return driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=media&fields=id,modifiedTime', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr
      })
      .then(function (res) { return res.json(); })
      .then(function(file) {
        if (file && file.modifiedTime) localStorage.setItem('notesCloudModifiedTime', file.modifiedTime);
        return file;
      })
      .catch(function (err) {
        // File was deleted → clear stale ID and fall through to create
        if (err.status === 404) {
          logSyncEvent('File PATCH 404, ricreazione...', 'info');
          driveFileId = null;
          localStorage.removeItem('notesDriveFileId');
          return writeDriveFile(data);
        }
        throw err;
      });
    }

    // POST requires multipart to assign name and parents concurrently
    var boundary = '---notesapp' + Date.now();
    var metadata = {
      name: DRIVE_FILE_NAME,
      mimeType: 'application/json',
      parents: ['appDataFolder']
    };

    var body =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      jsonStr + '\r\n' +
      '--' + boundary + '--';

    return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    })
    .then(function (res) { return res.json(); })
    .then(function (file) {
      driveFileId = file.id;
      localStorage.setItem('notesDriveFileId', driveFileId);
      if (file.modifiedTime) localStorage.setItem('notesCloudModifiedTime', file.modifiedTime);
      return file;
    });
  }

  // ── First Sync Check (conflict detection) ──
  var syncConflictOverlay = document.getElementById('sync-conflict-overlay');
  var syncUseCloud = document.getElementById('sync-use-cloud');
  var syncUseLocal = document.getElementById('sync-use-local');
  var syncLocalCount = document.getElementById('sync-local-count');
  var syncCloudCount = document.getElementById('sync-cloud-count');
  var pendingDriveData = null;

  function firstSyncCheck() {
    ensureToken()
    .then(findDriveFile)
    .then(function (fileInfo) {
      var localCount = items.filter(function (i) { return !i.deleted; }).length;

      if (!fileInfo) {
        // No file on Drive
        if (localCount > 0) {
          // Local has data but no cloud file → show dialog (cloud = 0)
          pendingDriveData = { items: [] };
          syncLocalCount.textContent = localCount + ' element' + (localCount === 1 ? 'o' : 'i');
          syncCloudCount.textContent = '0 elementi';
          syncConflictOverlay.classList.add('visible');
          return;
        }
        // Both empty → nothing to ask
        localStorage.setItem('notesLastSync', now());
        updateSyncStatus('Sincronizzato ✓', '');
        return;
      }

      // Drive has data → read it
      return readDriveFile(fileInfo.id).then(function (driveData) {
        var cloudItems = driveData && driveData.items ? driveData.items : [];
        var cloudCount = cloudItems.filter(function (i) { return !i.deleted; }).length;

        if (localCount === 0 && cloudCount === 0) {
          // Both empty → nothing to ask
          localStorage.setItem('notesLastSync', now());
          updateSyncStatus('Sincronizzato ✓', '');
          return;
        }

        // At least one side has data → always ask the user
        pendingDriveData = driveData;
        syncLocalCount.textContent = localCount + ' element' + (localCount === 1 ? 'o' : 'i');
        syncCloudCount.textContent = cloudCount + ' element' + (cloudCount === 1 ? 'o' : 'i');
        syncConflictOverlay.classList.add('visible');
      });
    })
    .catch(function (err) {
      console.error('First sync check error:', err);
      logSyncEvent('Errore primo check: ' + (err ? err.message : ''), 'error');
    });
  }

  // ── Conflict Dialog Handlers ──
  syncUseCloud.addEventListener('click', function () {
    if (pendingDriveData && pendingDriveData.items) {
      items = pendingDriveData.items;
      _originalSaveData();
      renderAll();
      localStorage.setItem('notesLastSync', now());
      updateSyncStatus('Sincronizzato ✓', '');
    }
    pendingDriveData = null;
    syncConflictOverlay.classList.remove('visible');
  });

  syncUseLocal.addEventListener('click', function () {
    syncConflictOverlay.classList.remove('visible');
    pendingDriveData = null;
    // Upload local data to Drive, overwriting cloud
    writeDriveFile({ items: items }).then(function () {
      localStorage.setItem('notesLastSync', now());
      updateSyncStatus('Sincronizzato ✓', '');
    }).catch(function (err) {
      console.error('Upload error:', err);
    });
  });

  // ── Shared merge logic (used by startup sync and manual sync) ──
  function mergeItems(driveData) {
    if (!driveData || !driveData.items) return false;
    var mergedMap = {};
    driveData.items.forEach(function (item) {
      mergedMap[item.id] = item;
    });
    items.forEach(function (item) {
      var driveItem = mergedMap[item.id];
      if (!driveItem || item.updatedAt > driveItem.updatedAt) {
        mergedMap[item.id] = item;
      }
    });
    items = Object.keys(mergedMap).map(function (key) { return mergedMap[key]; });
    _originalSaveData();
    renderAll();
    return true;
  }

  // ── Startup Sync (silent but updates status) ──
  function performStartupSync() {
    if (isSyncing || !googleUser) return;
    isSyncing = true;
    logSyncEvent('Sync automatica avvio...', 'info');

    ensureToken()
    .then(findDriveFile)
    .then(function (fileInfo) {
      if (fileInfo) {
        var lastDriveTime = localStorage.getItem('notesCloudModifiedTime');
        if (lastDriveTime && fileInfo.modifiedTime === lastDriveTime && !hasPendingChanges) {
           return Promise.resolve(); // Skip sync entirely: Cloud matches local exactly!
        }
        return readDriveFile(fileInfo.id).then(function (driveData) {
          mergeItems(driveData);
          if (fileInfo.modifiedTime) localStorage.setItem('notesCloudModifiedTime', fileInfo.modifiedTime);
          return writeDriveFile({ items: items });
        });
      } else {
        return writeDriveFile({ items: items });
      }
    })
    .then(function () {
      localStorage.setItem('notesLastSync', now());
      hasPendingChanges = false;
      updateSyncStatus('Sincronizzato ✓', '');
      logSyncEvent('Sync completata ✓', 'success');
    })
    .catch(function (err) {
      console.error('Startup sync error:', err);
      logSyncEvent('Errore sync avvio: ' + (err.message || err), 'error');
      updateSyncStatus('Errore sync iniziale', 'error');
    })
    .finally(function () {
      isSyncing = false;
    });
  }

  // ── Main Sync Logic (reuses shared mergeItems) ──
  function syncWithDrive(silent) {
    if (isSyncing || !googleUser) return;
    isSyncing = true;
    if (!silent) updateSyncStatus('Sincronizzazione...', 'syncing');

    ensureToken()
    .then(findDriveFile)
    .then(function (fileInfo) {
      if (fileInfo) {
        var lastDriveTime = localStorage.getItem('notesCloudModifiedTime');
        if (lastDriveTime && fileInfo.modifiedTime === lastDriveTime && !hasPendingChanges) {
           return Promise.resolve(); // Skip sync entirely: Cloud matches local exactly!
        }
        return readDriveFile(fileInfo.id).then(function (driveData) {
          mergeItems(driveData);
          if (fileInfo.modifiedTime) localStorage.setItem('notesCloudModifiedTime', fileInfo.modifiedTime);
          return writeDriveFile({ items: items });
        });
      } else {
        return writeDriveFile({ items: items });
      }
    })
    .then(function () {
      localStorage.setItem('notesLastSync', now());
      hasPendingChanges = false;
      updateSyncStatus('Sincronizzato ✓', '');
      if (!silent) {
        updateSyncStatus('Ultima sync: adesso', 'success');
        setTimeout(function () {
          if (!isSyncing) updateSyncStatus('Sincronizzato ✓', '');
        }, 3000);
      }
    })
    .catch(function (err) {
      console.error('Sync error:', err);
      var errMsg = err && err.message ? err.message : 'Errore di sync';
      logSyncEvent('Errore sync: ' + errMsg, 'error');
      if (!silent) updateSyncStatus(errMsg, 'error');
    })
    .finally(function () {
      isSyncing = false;
    });
  }

  // Sync Now button (manual = visible feedback)
  syncNowBtn.addEventListener('click', function () {
    if (!googleAccessToken && googleUser) {
      // No valid token — request one (user-initiated, popup is acceptable)
      tokenClient.requestAccessToken({
        prompt: '',
        login_hint: googleUser.email || ''
      });
      return;
    }
    syncWithDrive(false);
  });

  // Fast auto-sync: Directly PATCH the drive file without reading first.
  // This takes ~150ms instead of 2 seconds, and fires almost instantly.
  var fastSyncTimer = null;
  function scheduleFastSync() {
    if (!googleUser || !googleAccessToken || !driveFileId) return;
    clearTimeout(fastSyncTimer);
    fastSyncTimer = setTimeout(function() {
      if (isSyncing) {
        // Block busy-waiting loop. The finally block below guarantees to pick up subsequent changes.
        return;
      }
      isSyncing = true;
      hasPendingChanges = false; // Mark false beforehand so new typing during upload sets it true again
      updateSyncStatus('Salvataggio...', 'syncing');
      writeDriveFile({ items: items })
        .then(function() {
          localStorage.setItem('notesLastSync', now());
          if (!hasPendingChanges) updateSyncStatus('Sincronizzato ✓', '');
        })
        .catch(function(err) {
          console.error('Fast sync error:', err);
          // If the error is an auth/token issue, try to refresh and retry once
          var isAuthError = (err && err.status && (err.status === 401 || err.status === 403));
          if (isAuthError) {
            ensureToken().then(function() {
              scheduleFastSync(); // retry with refreshed token
            }).catch(function() {
              updateSyncStatus('Sessione scaduta', 'error');
            });
            return;
          }
          updateSyncStatus('Errore di salvataggio', 'error');
        })
        .finally(function() {
          isSyncing = false;
          // If the user typed something WHILE we were uploading, trigger another sync cleanly.
          if (hasPendingChanges) scheduleFastSync();
        });
    }, 500); // Trigger upload 500ms after the change
  }

  // Auto-sync after data changes
  var hasPendingChanges = false;
  var _originalSaveData = saveData;
  saveData = function () {
    _originalSaveData();
    hasPendingChanges = true;
    
    if (googleUser && googleAccessToken) {
      if (driveFileId) {
        // We know the file exists, do a fast direct overwrite (~150ms)
        scheduleFastSync();
      } else {
        // We don't have the file ID yet, do a full sync (finds/creates the file)
        // Debounce to avoid flooding if user is making rapid changes
        clearTimeout(fastSyncTimer);
        fastSyncTimer = setTimeout(function () {
          syncWithDrive(true);
        }, 2000);
      }
    }
  };

  // Fire-and-forget sync for when the app is closing
  // Fallbacks to the Service Worker via postMessage to bypass keepalive/CORS constraints.
  function syncOnClose() {
    if (!driveFileId || isSyncing) return;
    hasPendingChanges = false;
    clearTimeout(fastSyncTimer);
    
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_ON_CLOSE',
        payload: { items: items },
        token: googleAccessToken,
        fileId: driveFileId
      });
    } else {
      writeDriveFile({ items: items }).catch(function(){}); // fallback
    }
    localStorage.setItem('notesLastSync', now());
  }

  // Sync when app is closed/hidden — ONLY if there are pending changes AND we have a token
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && hasPendingChanges && googleUser && googleAccessToken) {
      syncOnClose();
    }
  });
  window.addEventListener('beforeunload', function () {
    if (hasPendingChanges && googleUser && googleAccessToken) {
      syncOnClose();
    }
  });

  // ── Init ──
  function init() {
    applyTheme();

    // Load data from IndexedDB (async) then render
    loadData().then(function () {
      // Set initial history state
      history.replaceState({ view: 'folder', folderId: null }, '');

      renderAll();

      // Initialize Google Auth immediately (no delay)
      initGoogleAuth();
    });
  }

  // ── Register Service Worker ──
  if ('serviceWorker' in navigator) {
    // Only reload on SW updates, not on first install.
    // If a controller already exists, any future controllerchange means an update.
    var hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js').then(function (registration) {
      // Check for updates on every page load
      registration.update();
      
      // Look for updates every 10 minutes (600000ms)
      setInterval(function() {
        registration.update();
      }, 600000);
    }).catch(function (e) {
      console.warn('SW registration failed:', e);
    });

    // When the service worker is updated and takes control, reload the page
    if (hadController) {
      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }

  init();
})();
