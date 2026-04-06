// ══════════════════════════════════════════════════════════
// OnPoint — App Logic (Notes-Style Rewrite)
// ══════════════════════════════════════════════════════════

const todoList = document.getElementById('todo-list');
const willdoList = document.getElementById('willdo-list');

const addTodoBtn = document.getElementById('add-todo-btn');
const addWilldoBtn = document.getElementById('add-willdo-btn');

const modal = document.getElementById('task-modal');
const taskInput = document.getElementById('task-input');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const modalTitle = document.getElementById('modal-title');

let targetListForNewTask = 'todo';
let currentEditId = null;

// === INDEXEDDB DEFINITION ===
const STORAGE_KEY = 'onPointTasks'; // legacy
const IDB_NAME = 'OnPointLocalDB';
const IDB_VERSION = 1;
const IDB_STORE = 'appData';
const IDB_DATA_KEY = 'tasks';

let _db = null;

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

// Data store
let tasks = {
  todo: [],
  willdo: [],
  deleted: []
};

function loadData() {
  return readFromIDB().then(function (data) {
    if (data && data.todo && data.willdo) {
      tasks.todo = data.todo;
      tasks.willdo = data.willdo;
      tasks.deleted = data.deleted || [];
    } else {
      // Legacy migration
      try {
        var savedTasks = localStorage.getItem(STORAGE_KEY);
        if (savedTasks) {
          var parsed = JSON.parse(savedTasks);
          tasks.todo = parsed.todo || [];
          tasks.willdo = parsed.willdo || [];
          tasks.deleted = parsed.deleted || [];

          if (tasks.todo.length > 0 || tasks.willdo.length > 0) {
            writeToIDB(tasks).then(function () {
              localStorage.removeItem(STORAGE_KEY);
            });
          }
        }
      } catch (e) { }
    }
  }).catch(function () {
    // Fallback
    try {
      var savedTasks = localStorage.getItem(STORAGE_KEY);
      if (savedTasks) {
        var parsed = JSON.parse(savedTasks);
        tasks.todo = parsed.todo || [];
        tasks.willdo = parsed.willdo || [];
        tasks.deleted = parsed.deleted || [];
      }
    } catch (e) { }
  });
}

// === THEME & AMOLED ===
var savedTheme = localStorage.getItem('onPointTheme') || 'white';
var savedAmoled = localStorage.getItem('onPointAmoled');
if (savedAmoled === null) savedAmoled = 'true';

function applyTheme(theme) {
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  document.body.classList.add('theme-' + theme);
  savedTheme = theme;
  localStorage.setItem('onPointTheme', theme);
  var dots = document.querySelectorAll('.theme-dot');
  dots.forEach(function (d) { d.classList.toggle('active', d.dataset.theme === theme); });
}

function applyAmoled(on) {
  if (on) {
    document.body.classList.add('amoled');
  } else {
    document.body.classList.remove('amoled');
  }
  localStorage.setItem('onPointAmoled', on ? 'true' : 'false');
  var toggle = document.getElementById('amoled-toggle');
  if (toggle) toggle.checked = on;
}

applyTheme(savedTheme);
applyAmoled(savedAmoled === 'true');

// Theme picker clicks
document.addEventListener('DOMContentLoaded', function () {
  var picker = document.getElementById('theme-picker');
  if (picker) picker.addEventListener('click', function (e) {
    var dot = e.target.closest('.theme-dot');
    if (dot) applyTheme(dot.dataset.theme);
  });
  var aToggle = document.getElementById('amoled-toggle');
  if (aToggle) aToggle.addEventListener('change', function () {
    applyAmoled(this.checked);
  });
  applyTheme(savedTheme);
});

function saveState() {
  var newTodo = [];
  var newWilldo = [];
  var seenIds = {};

  var todoNodes = todoList.children;
  for (var i = 0; i < todoNodes.length; i++) {
    var id = todoNodes[i].dataset.id;
    if (!id || seenIds[id]) continue;
    seenIds[id] = true;

    var textEl = todoNodes[i].querySelector('.task-text');
    var itemEl = todoNodes[i].querySelector('.task-item');
    if (!textEl || !itemEl) continue;
    newTodo.push({
      id: id,
      text: textEl.textContent,
      priority: itemEl.classList.contains('priority')
    });
  }

  var willdoNodes = willdoList.children;
  for (var i = 0; i < willdoNodes.length; i++) {
    var id = willdoNodes[i].dataset.id;
    if (!id || seenIds[id]) continue;
    seenIds[id] = true;

    var textEl = willdoNodes[i].querySelector('.task-text');
    var itemEl = willdoNodes[i].querySelector('.task-item');
    if (!textEl || !itemEl) continue;
    newWilldo.push({
      id: id,
      text: textEl.textContent,
      priority: itemEl.classList.contains('priority')
    });
  }

  tasks.todo = newTodo;
  tasks.willdo = newWilldo;
  // Write to IDB with fallback
  writeToIDB(tasks).catch(function () {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  });
  updateCounters();
}

function addToHistory(taskData) {
  var data = JSON.parse(JSON.stringify(taskData));
  data.deleted = true;
  tasks.deleted.unshift(data);
  if (tasks.deleted.length > 20) tasks.deleted.pop();
  renderHistory();
  saveState();
}

function renderHistory() {
  var historyList = document.getElementById('history-list');
  historyList.innerHTML = '';
  tasks.deleted.forEach(function (task) {
    historyList.appendChild(renderTask(task));
  });
}

function rewindTask(id) {
  var index = tasks.deleted.findIndex(function (t) { return t.id === id; });
  if (index !== -1) {
    var task = tasks.deleted.splice(index, 1)[0];
    task.deleted = false;
    // Push the item to the list it belongs to, default to todo if undefined
    var targetList = task.listType || 'todo';
    if (tasks[targetList]) {
      tasks[targetList].push(task);
    } else {
      tasks.todo.push(task);
    }
    renderAll();
    saveState();
  }
}

// === STATE MANAGEMENT (Android Back Button) ===
let currentState = null;

function pushAppState(stateName) {
  if (currentState === stateName) return;
  currentState = stateName;
  history.pushState({ appState: stateName }, '');
}

window.onpopstate = function (event) {
  var state = event.state ? event.state.appState : null;
  currentState = state;

  if (state !== 'history') {
    document.getElementById('history-modal').classList.remove('visible');
  }
  if (state !== 'settings') {
    document.getElementById('settings-modal').classList.remove('visible');
  }
  if (state !== 'search') {
    var searchBar = document.getElementById('search-bar');
    if (searchBar) {
      searchBar.classList.remove('visible');
      document.getElementById('search-input').blur();
      document.body.classList.remove('searching');
      document.querySelectorAll('.task-wrapper').forEach(function (w) { w.classList.remove('search-match'); });
    }
  }
  if (state !== 'taskModal') {
    document.getElementById('task-modal').classList.remove('visible');
    taskInput.blur();
  }
};

// === HISTORY ===
function openHistory() {
  document.getElementById('history-modal').classList.add('visible');
  pushAppState('history');
}
function closeHistory() {
  document.getElementById('history-modal').classList.remove('visible');
  if (currentState === 'history') history.back();
}
document.getElementById('history-toggle').onclick = openHistory;
document.getElementById('close-history-btn').onclick = closeHistory;

// === SEARCH ===
var searchBar = document.getElementById('search-bar');
var searchInput = document.getElementById('search-input');

function openSearch() {
  searchBar.classList.add('visible');
  pushAppState('search');
  setTimeout(function () { searchInput.focus(); }, 100);
}
function closeSearch() {
  searchBar.classList.remove('visible');
  searchInput.value = '';
  searchInput.blur();
  document.body.classList.remove('searching');
  document.querySelectorAll('.task-wrapper').forEach(function (w) { w.classList.remove('search-match'); });
  if (currentState === 'search') history.back();
}

document.getElementById('search-toggle').onclick = openSearch;
document.getElementById('search-close').onclick = closeSearch;

searchInput.addEventListener('input', function (e) {
  var term = e.target.value.toLowerCase().trim();
  if (!term) {
    document.body.classList.remove('searching');
    document.querySelectorAll('.task-wrapper').forEach(function (w) { w.classList.remove('search-match'); });
    return;
  }
  document.body.classList.add('searching');
  document.querySelectorAll('.task-wrapper').forEach(function (w) {
    var tText = w.querySelector('.task-text');
    if (tText && tText.textContent.toLowerCase().includes(term)) {
      w.classList.add('search-match');
    } else {
      w.classList.remove('search-match');
    }
  });
});

// === SETTINGS ===
function openSettings() {
  document.getElementById('settings-modal').classList.add('visible');
  pushAppState('settings');
}
function closeSettings() {
  document.getElementById('settings-modal').classList.remove('visible');
  if (currentState === 'settings') history.back();
}
document.getElementById('settings-toggle').onclick = openSettings;
document.getElementById('close-settings-btn').onclick = closeSettings;

// Settings: Export
document.getElementById('settings-export').onclick = function () {
  saveState();
  var dataStr = JSON.stringify(tasks, null, 2);
  var blob = new Blob([dataStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'onpoint_backup_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Settings: Import
document.getElementById('import-file-input').onchange = function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (event) {
    try {
      var imported = JSON.parse(event.target.result);
      if (imported.todo && imported.willdo) {
        tasks.todo = imported.todo;
        tasks.willdo = imported.willdo;
        tasks.deleted = imported.deleted || [];
        writeToIDB(tasks).catch(function () {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        });
        renderAll();
        updateCounters();
        closeSettings();
      } else {
        alert('File non valido.');
      }
    } catch (err) {
      alert('Errore: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// Settings: Clear All
document.getElementById('settings-clear').onclick = function () {
  if (confirm('Sei sicuro? Questa azione cancellerà definitivamente TUTTE le tasks.')) {
    tasks = { todo: [], willdo: [], deleted: [] };
    writeToIDB(tasks).catch(function () {
      localStorage.removeItem(STORAGE_KEY);
    });
    renderAll();
    closeSettings();
  }
};



// ══════════════════════════════════════════════════════════
// RENDER TASK — Notes-style swipe cards
// ══════════════════════════════════════════════════════════

function renderTask(task) {
  var wrapper = document.createElement('div');
  wrapper.className = 'task-wrapper';
  wrapper.dataset.id = task.id;

  // Swipe background
  var swipeBg = document.createElement('div');
  swipeBg.className = 'swipe-bg';
  var iconLeft = document.createElement('div');
  iconLeft.className = 'icon-left';
  iconLeft.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  var iconRight = document.createElement('div');
  iconRight.className = 'icon-right';
  iconRight.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  swipeBg.appendChild(iconLeft);
  swipeBg.appendChild(iconRight);

  var div = document.createElement('div');
  div.className = 'task-item' + (task.priority ? ' priority' : '');



  var priorityBtn = document.createElement('button');
  priorityBtn.className = 'priority-btn';
  priorityBtn.onclick = function (e) {
    e.stopPropagation();
    togglePriority(task.id, div, wrapper);
  };

  var textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  var escapedText = task.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  textSpan.innerHTML = escapedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'task-actions';

  if (task.deleted) {
    var rewindBtn = document.createElement('div');
    rewindBtn.className = 'rewind-btn';
    rewindBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
    rewindBtn.onclick = function (e) {
      e.stopPropagation();
      rewindTask(task.id);
    };
    actionsDiv.appendChild(rewindBtn);

    priorityBtn.style.display = 'none';
  } else {
    var editBtn = document.createElement('div');
    editBtn.className = 'edit-btn';
    editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    editBtn.onclick = function (e) {
      e.stopPropagation();
      openEditModal(task.id);
    };
    actionsDiv.appendChild(editBtn);
  }

  div.appendChild(priorityBtn);
  div.appendChild(textSpan);
  div.appendChild(actionsDiv);

  wrapper.appendChild(swipeBg);
  wrapper.appendChild(div);

  // === SWIPE TO DELETE (Notes-style) ===
  if (!task.deleted) {
    var startX = 0, startY = 0, currentX = 0;
    var isPointerDown = false, isSwiping = false, isDragging = false, isScrolling = false, hasCapturedPointer = false;

    div.addEventListener('pointerdown', function (e) {
      if (window.isSortableActive) return;
      if (e.target.closest('.priority-btn') || e.target.closest('.task-actions') || e.target.closest('a')) return;
      isPointerDown = true;
      isDragging = false;
      isSwiping = false;
      isScrolling = false;
      hasCapturedPointer = false;
      startX = e.clientX;
      startY = e.clientY;
      // Do NOT capture pointer here — allow native vertical scrolling
    });

    div.addEventListener('pointermove', function (e) {
      if (window.isSortableActive) {
        if (isPointerDown) handleRelease(e);
        return;
      }
      if (!isPointerDown || isScrolling || wrapper.classList.contains('sortable-drag') || wrapper.classList.contains('sortable-ghost')) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      // Determine gesture direction on first significant movement
      if (!isDragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical movement -> user wants to scroll, abort our handling
          isScrolling = true;
          isPointerDown = false;
          return;
        }

        // Horizontal movement -> it's a swipe, capture pointer now
        isDragging = true;
        isSwiping = true;
        wrapper.classList.add('swiping');
        try {
          div.setPointerCapture(e.pointerId);
          hasCapturedPointer = true;
        } catch (err) { }
      }

      if (isSwiping) {
        currentX = dx;
        div.style.transform = 'translateX(' + currentX + 'px)';
        var iconLeft = swipeBg.querySelector('.icon-left');
        var iconRight = swipeBg.querySelector('.icon-right');
        if (currentX > 0) {
          var progress = Math.min(1, currentX / 100);
          var iconScale = 0.8 + progress * 0.5;
          if (iconLeft) {
            iconLeft.style.opacity = Math.min(1, currentX / 40);
            iconLeft.style.transform = 'scale(' + iconScale + ')';
          }
          if (iconRight) {
            iconRight.style.opacity = '0';
            iconRight.style.transform = 'scale(0.8)';
          }
        } else {
          var progress = Math.min(1, Math.abs(currentX) / 100);
          var iconScale = 0.8 + progress * 0.5;
          if (iconRight) {
            iconRight.style.opacity = Math.min(1, Math.abs(currentX) / 40);
            iconRight.style.transform = 'scale(' + iconScale + ')';
          }
          if (iconLeft) {
            iconLeft.style.opacity = '0';
            iconLeft.style.transform = 'scale(0.8)';
          }
        }
      }
    });

    function handleRelease(e) {
      if (!isPointerDown) return;
      isPointerDown = false;

      if (hasCapturedPointer) {
        try { div.releasePointerCapture(e.pointerId); } catch (err) { }
        hasCapturedPointer = false;
      }

      if (isSwiping) {
        if (Math.abs(currentX) > 80) {
          div.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
          div.style.transform = 'translateX(' + (currentX > 0 ? 100 : -100) + '%)';
          wrapper.style.transition = 'height 0.3s ease, opacity 0.3s ease, margin 0.3s ease';
          setTimeout(function () {
            wrapper.style.height = '0px';
            wrapper.style.opacity = '0';
            wrapper.style.marginBottom = '0px';
          }, 150);
          setTimeout(function () {
            var tId = wrapper.dataset.id;
            var listType = tasks.todo.some(function (t) { return t.id === tId; }) ? 'todo' : 'willdo';
            var taskData = tasks.todo.find(function (t) { return t.id === tId; }) || tasks.willdo.find(function (t) { return t.id === tId; });
            if (taskData) {
              taskData.listType = listType;
              addToHistory(taskData);
            }
            if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            saveState();
          }, 450);
        } else {
          wrapper.classList.remove('swiping');
          div.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          div.style.transform = '';
          var il = swipeBg.querySelector('.icon-left');
          var ir = swipeBg.querySelector('.icon-right');
          if (il) { il.style.opacity = '0'; il.style.transform = 'scale(0.8)'; }
          if (ir) { ir.style.opacity = '0'; ir.style.transform = 'scale(0.8)'; }
          setTimeout(function () { div.style.transition = ''; }, 300);
        }
      }

      currentX = 0;
      isSwiping = false;
      isDragging = false;
      isScrolling = false;
      wrapper.classList.remove('swiping');
    }

    div.addEventListener('pointerup', handleRelease);
    div.addEventListener('pointercancel', handleRelease);

    // Clear entry animation after it completes so JS transforms work for swiping
    div.addEventListener('animationend', function () {
      div.style.animation = 'none';
      div.style.opacity = '1';
    }, { once: true });
  }

  return wrapper;
}

// ══════════════════════════════════════════════════════════
// RENDER, COUNTERS, MODALS
// ══════════════════════════════════════════════════════════

function renderAll() {
  todoList.innerHTML = '';
  willdoList.innerHTML = '';
  tasks.todo.forEach(function (task) { todoList.appendChild(renderTask(task)); });
  tasks.willdo.forEach(function (task) { willdoList.appendChild(renderTask(task)); });
  renderHistory();
  updateCounters();
}

function updateCounters() {
  document.getElementById('todo-counter').textContent = tasks.todo.length;
  document.getElementById('willdo-counter').textContent = tasks.willdo.length;
}

// === SORTABLE INITIALIZATION ===
var sortableOptions = {
  group: 'tasks',
  animation: 200,
  delay: 300, // Shortened long press duration
  delayOnTouchOnly: false, // Apply delay to both mouse and touch, so swipe can execute
  touchStartThreshold: 10, // Pixels to move before drag is cancelled on touch (allow slight wiggles during long press)
  fallbackTolerance: 10, // Same thing for mouse movements
  ghostClass: 'sortable-ghost',
  dragClass: 'sortable-drag',
  onChoose: function (evt) {
    window.isSortableActive = true;
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50); // Haptic feedback strictly synchronized with end of delay
    }
  },
  onUnchoose: function (evt) {
    window.isSortableActive = false;
  },
  onEnd: function () {
    window.isSortableActive = false;
    setTimeout(function() { saveState(); }, 50);
  }
};

if (typeof Sortable !== 'undefined') {
  Sortable.create(todoList, sortableOptions);
  Sortable.create(willdoList, sortableOptions);
}


function openEditModal(id) {
  var task = tasks.todo.find(function (t) { return t.id === id; }) || tasks.willdo.find(function (t) { return t.id === id; });
  if (!task) return;
  currentEditId = id;
  modalTitle.textContent = 'Modifica Task';
  taskInput.value = task.text;
  modal.classList.add('visible');
  pushAppState('taskModal');
  setTimeout(function () { taskInput.focus(); }, 100);
}

function togglePriority(id, element, parentWrapper) {
  var task = tasks.todo.find(function (t) { return t.id === id; }) || tasks.willdo.find(function (t) { return t.id === id; });
  if (!task) return;

  task.priority = !task.priority;
  if (task.priority) element.classList.add('priority');
  else element.classList.remove('priority');

  saveState();
}

addTodoBtn.onclick = function () { openModal('todo'); };
addWilldoBtn.onclick = function () { openModal('willdo'); };

cancelBtn.onclick = closeModal;

function openModal(listType) {
  targetListForNewTask = listType;
  currentEditId = null;
  modalTitle.textContent = listType === 'todo' ? 'Nuova Task — To Do' : 'Nuova Task — Will Do';
  taskInput.value = '';
  modal.classList.add('visible');
  pushAppState('taskModal');
  setTimeout(function () { taskInput.focus(); }, 100);
}

function closeModal() {
  modal.classList.remove('visible');
  taskInput.blur();
  if (currentState === 'taskModal') history.back();
}

saveBtn.onclick = saveTask;
taskInput.addEventListener('keypress', function (e) {
  if (e.key === 'Enter') saveTask();
});

function saveTask() {
  var text = taskInput.value.trim();
  if (!text) return;

  if (currentEditId) {
    var task = tasks.todo.find(function (t) { return t.id === currentEditId; }) || tasks.willdo.find(function (t) { return t.id === currentEditId; });
    if (task) {
      task.text = text;
      renderAll();
    }
  } else {
    var newTask = { id: Date.now().toString(), text: text, priority: false };
    tasks[targetListForNewTask].push(newTask);
    var listEl = targetListForNewTask === 'todo' ? todoList : willdoList;
    var newWrapper = renderTask(newTask);
    newWrapper.classList.add('task-enter');
    listEl.appendChild(newWrapper);
    setTimeout(function () { newWrapper.classList.remove('task-enter'); }, 400);
  }
  saveState();
  closeModal();
}

loadData().then(function () {
  renderAll();
});

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(function (granted) {
    if (granted) console.log("Storage is persistent.");
  });
}

// === SERVICE WORKER ===
if ('serviceWorker' in navigator) {
  var hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('sw.js').then(function (registration) {
    registration.update();
    setInterval(function () {
      registration.update();
    }, 600000);
  }).catch(function (err) {
    console.warn('SW registration failed:', err);
  });

  if (hadController) {
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}
