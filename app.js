const todoList = document.getElementById('todo-list');
const willdoList = document.getElementById('willdo-list');
const trashZone = document.getElementById('trash-zone');

const addTodoBtn = document.getElementById('add-todo-btn');
const addWilldoBtn = document.getElementById('add-willdo-btn');

const modal = document.getElementById('task-modal');
const taskInput = document.getElementById('task-input');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');

let targetListForNewTask = 'todo'; 

// Data store
let tasks = {
  todo: [],
  willdo: []
};

// Selection Mode Manager
function updateSelectionMode() {
  const selectedCount = document.querySelectorAll('.task-wrapper.selected').length;
  if (selectedCount > 0) {
    document.body.classList.add('selection-mode');
  } else {
    document.body.classList.remove('selection-mode');
  }
}

// Render lists
function renderTask(task) {
  const wrapper = document.createElement('div');
  wrapper.className = 'task-wrapper';
  wrapper.dataset.id = task.id;

  const bgLeft = document.createElement('div');
  bgLeft.className = 'swipe-overlay-icon left';
  bgLeft.innerHTML = '🗑️';

  const bgRight = document.createElement('div');
  bgRight.className = 'swipe-overlay-icon right';
  bgRight.innerHTML = '🗑️';

  const div = document.createElement('div');
  div.className = `task-item ${task.priority ? 'priority' : ''}`;

  const checkbox = document.createElement('div');
  checkbox.className = 'selection-checkbox';

  const priorityBtn = document.createElement('button');
  priorityBtn.className = 'priority-btn';
  // Gestione Priorità Multipla (o singola)
  priorityBtn.onclick = (e) => {
    e.stopPropagation();
    togglePriority(task.id, div, wrapper);
  };

  const textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.textContent = task.text;

  const dragHandle = document.createElement('div');
  dragHandle.className = 'drag-handle';
  dragHandle.innerHTML = `
    <svg width="14" height="28" viewBox="0 0 14 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 4L3 9H11L7 4Z" fill="currentColor"/>
      <rect x="3" y="13" width="8" height="2" fill="currentColor"/>
      <path d="M7 24L11 19H3L7 24Z" fill="currentColor"/>
    </svg>
  `;

  div.appendChild(checkbox);
  div.appendChild(priorityBtn);
  div.appendChild(textSpan);
  div.appendChild(dragHandle);

  wrapper.appendChild(bgLeft);
  wrapper.appendChild(bgRight);
  wrapper.appendChild(div);

  // === UNIFIED POINTER LOGIC ===
  let pressTimer;
  let startX = 0, startY = 0;
  let currentX = 0;
  let isPointerDown = false;
  let isSwiping = false;
  let longPressFired = false;

  const getClientPos = (e) => {
    return {
      x: e.touches ? e.touches[0].clientX : e.clientX,
      y: e.touches ? e.touches[0].clientY : e.clientY
    };
  };

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return; 
    if (e.target.closest('.drag-handle') || e.target.closest('.priority-btn') || e.target.closest('.selection-checkbox')) return;
    
    isPointerDown = true;
    isSwiping = false;
    longPressFired = false;
    currentX = 0;

    const pos = getClientPos(e);
    startX = pos.x;
    startY = pos.y;
    
    // Iniziamo long press (solo se non in selection mode)
    if (!document.body.classList.contains('selection-mode')) {
      pressTimer = setTimeout(() => {
        longPressFired = true;
        wrapper.classList.add('selected');
        updateSelectionMode();
        if (navigator.vibrate) navigator.vibrate(50);
      }, 450);
    }
    
    div.style.transition = 'none';
    bgLeft.style.transform = 'translateY(-50%) scale(1)';
    bgRight.style.transform = 'translateY(-50%) scale(1)';
    bgLeft.style.opacity = '0';
    bgRight.style.opacity = '0';
  };

  const handlePointerMove = (e) => {
    if (!isPointerDown) return;
    
    const pos = getClientPos(e);
    const deltaX = pos.x - startX;
    const deltaY = pos.y - startY;

    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      clearTimeout(pressTimer);
    }

    if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      isPointerDown = false; 
      return; 
    }

    if (Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY)) {
      isSwiping = true;
    }

    if (isSwiping) {
      if (e.type !== 'pointermove' && e.cancelable) e.preventDefault(); 
      
      currentX = deltaX;
      div.style.transform = `translateX(${currentX}px)`;

      // Il cestino appare dalla direzione in cui scorri
      if (currentX > 0) {
        // Scorro verso destra -> appare il cestino a destra
        bgRight.style.opacity = Math.min(1, currentX / 50);
        bgRight.style.transform = `translateY(-50%) scale(${currentX > 80 ? 1.25 : 1})`;
        bgLeft.style.opacity = '0';
      } else {
        // Scorro verso sinistra -> appare il cestino a sinistra
        bgLeft.style.opacity = Math.min(1, Math.abs(currentX) / 50);
        bgLeft.style.transform = `translateY(-50%) scale(${currentX < -80 ? 1.25 : 1})`;
        bgRight.style.opacity = '0';
      }
    }
  };

  const handlePointerUp = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    clearTimeout(pressTimer);
    
    if (isSwiping) {
      isSwiping = false;
      div.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      
      // SOGLIA RAGGIUNTA, PROCEDIAMO CON ELIMINAZIONE
      if (Math.abs(currentX) > 100) {
        
        let targetWrappers = [wrapper];
        if (wrapper.classList.contains('selected')) {
           targetWrappers = Array.from(document.querySelectorAll('.task-wrapper.selected'));
           if (!targetWrappers.includes(wrapper)) targetWrappers.push(wrapper);
        }
        
        targetWrappers.forEach(w => {
           const item = w.querySelector('.task-item');
           if (item) {
             item.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
             item.style.opacity = '0';
             item.style.transform = `translateX(${currentX > 0 ? window.innerWidth : -window.innerWidth}px)`;
           }
           w.classList.remove('selected');
           
           w.style.transition = 'height 0.3s ease, margin 0.3s ease, opacity 0.3s ease';
           w.style.opacity = '0';
           w.style.height = w.offsetHeight + 'px';
           setTimeout(() => { w.style.height = '0px'; w.style.marginBottom = '0px'; }, 50);
           
           setTimeout(() => {
             if (w.parentNode) w.parentNode.removeChild(w);
           }, 350);
        });
        
        setTimeout(() => updateSelectionMode(), 50);

      } else {
        // Snap-back: ritorno allo stato normale
        div.style.transform = '';
        bgLeft.style.transform = 'translateY(-50%) scale(1)';
        bgRight.style.transform = 'translateY(-50%) scale(1)';
        bgLeft.style.opacity = '0';
        bgRight.style.opacity = '0';
      }
    }
  };

  div.addEventListener('click', (e) => {
    if (longPressFired) return;
    if (e.target.closest('.drag-handle') || e.target.closest('.priority-btn')) return;
    
    // Fallback: se siamo in selection mode applichiamo toggle. Altrimenti fa solo il focus o nulla (previsto HTML standard)
    if (document.body.classList.contains('selection-mode')) {
      wrapper.classList.toggle('selected');
      updateSelectionMode();
    }
  });

  // Attach eventi combinati per Mouse e Touch
  div.addEventListener('mousedown', handlePointerDown);
  document.addEventListener('mousemove', handlePointerMove, { passive: false });
  document.addEventListener('mouseup', handlePointerUp);
  
  div.addEventListener('touchstart', handlePointerDown, { passive: true });
  div.addEventListener('touchmove', handlePointerMove, { passive: false });
  div.addEventListener('touchend', handlePointerUp);
  div.addEventListener('touchcancel', handlePointerUp);

  return wrapper;
}

function renderAll() {
  todoList.innerHTML = '';
  willdoList.innerHTML = '';
  
  tasks.todo.forEach(task => {
    todoList.appendChild(renderTask(task));
  });

  tasks.willdo.forEach(task => {
    willdoList.appendChild(renderTask(task));
  });
}

function togglePriority(id, element, parentWrapper) {
  let task = tasks.todo.find(t => t.id === id) || tasks.willdo.find(t => t.id === id);
  if (!task) return;

  if (parentWrapper && parentWrapper.classList.contains('selected')) {
     const selectedWrappers = document.querySelectorAll('.task-wrapper.selected');
     const targetToPriority = !task.priority; 
     
     selectedWrappers.forEach(w => {
        const tId = w.dataset.id;
        const subTask = tasks.todo.find(t => t.id === tId) || tasks.willdo.find(t => t.id === tId);
        if (subTask) {
           subTask.priority = targetToPriority;
           const subItem = w.querySelector('.task-item');
           if (subItem) {
               if (targetToPriority) subItem.classList.add('priority');
               else subItem.classList.remove('priority');
           }
        }
     });
  } else {
     task.priority = !task.priority;
     if (task.priority) element.classList.add('priority');
     else element.classList.remove('priority');
  }
}

addTodoBtn.onclick = () => openModal('todo');
addWilldoBtn.onclick = () => openModal('willdo');
cancelBtn.onclick = closeModal;
modalOverlay.onclick = closeModal;

function openModal(listType) {
  targetListForNewTask = listType;
  modalTitle.textContent = listType === 'todo' ? 'Nuova Task - To Do' : 'Nuova Task - Will Do';
  taskInput.value = '';
  modal.classList.add('visible');
  modal.classList.remove('hidden'); 
  setTimeout(() => taskInput.focus(), 100);
}

function closeModal() {
  modal.classList.remove('visible');
}

saveBtn.onclick = saveTask;
taskInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveTask();
});

function saveTask() {
  const text = taskInput.value.trim();
  if (!text) return;

  const newTask = {
    id: Date.now().toString(),
    text: text,
    priority: false
  };

  tasks[targetListForNewTask].push(newTask);
  
  const listEl = targetListForNewTask === 'todo' ? todoList : willdoList;
  listEl.appendChild(renderTask(newTask));
  closeModal();
}

renderAll();

// SortableJS init protetto da try/catch per ambienti Android con restrizioni
try {
  if (typeof Sortable !== 'undefined') {
    const sortableOptions = {
      group: 'tasks',
      animation: 250,
      handle: '.drag-handle',
      multiDrag: true, 
      multiDragKey: 'Shift',
      selectedClass: 'selected', 
      easing: "cubic-bezier(1, 0, 0, 1)",
      onStart: function (evt) {
        trashZone.classList.add('visible');
        if (navigator.vibrate) navigator.vibrate(50);
      },
      onEnd: function (evt) {
        trashZone.classList.remove('visible');
      }
    };

    new Sortable(todoList, { ...sortableOptions });
    new Sortable(willdoList, { ...sortableOptions });

    new Sortable(trashZone, {
      group: 'tasks',
      ghostClass: 'sortable-ghost',
      onAdd: function (evt) {
        if (evt.items && evt.items.length > 0) {
          evt.items.forEach(item => {
            if(item.parentNode) item.parentNode.removeChild(item);
          });
        } else if(evt.item.parentNode) {
          evt.item.parentNode.removeChild(evt.item);
        }
        trashZone.classList.remove('drag-over');
        updateSelectionMode();
      },
      onChange: function(evt) {
        trashZone.classList.add('drag-over');
      },
      onRemove: function(evt) {
        trashZone.classList.remove('drag-over');
      }
    });
  }
} catch(e) {
  console.warn('SortableJS not loaded: Drag & Drop could be limited.', e);
}

trashZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    trashZone.classList.add('drag-over');
});
trashZone.addEventListener('dragleave', () => {
    trashZone.classList.remove('drag-over');
});
