const body = document.body;
const dropzone = document.getElementById('dropzone');
const countEl = document.getElementById('count');
const fileListEl = document.getElementById('fileList');

/** @type {{name: string, path: string}[]} */
let cachedFiles = [];
const selectedPaths = new Set();

let dragDepth = 0; // external OS drag enter/leave counter (inbound "add a file" gesture)
let isExpanded = false; // mouse-hover-to-reveal-list state (unrelated to dragDepth)
let collapseTimer = null;
let isReordering = false;

const HOVER_COLLAPSE_DELAY = 140; // ms — small debounce so the panel doesn't flicker shut

// ------------------------------------------------------------------
// Visual state machine
// ------------------------------------------------------------------

function syncVisualState() {
  if (dragDepth > 0) {
    // An external drag (from Explorer/browser) is hovering — always show the
    // accept highlight and keep the list collapsed; this is a different
    // gesture from "hovering to browse the shelf."
    if (isExpanded) collapseWindowOnly();
    body.dataset.state = 'hover';
  } else if (isExpanded) {
    body.dataset.state = 'expanded';
  } else if (cachedFiles.length > 0) {
    body.dataset.state = 'populated';
  } else {
    body.dataset.state = 'idle';
  }
}

function collapseWindowOnly() {
  isExpanded = false;
  window.ghostDrop.setExpanded(false);
}

function requestExpand() {
  if (cachedFiles.length === 0) return;
  if (!isExpanded) {
    isExpanded = true;
    window.ghostDrop.setExpanded(true);
  }
  render();
}

function requestCollapse() {
  if (isExpanded) {
    isExpanded = false;
    window.ghostDrop.setExpanded(false);
  }
  render();
}

function render() {
  syncVisualState();
  updateCountBadge();
  if (!isReordering) renderFileList();
}

function updateCountBadge() {
  if (cachedFiles.length === 0) {
    countEl.classList.add('hidden');
    return;
  }
  countEl.textContent = String(cachedFiles.length);
  countEl.classList.remove('hidden');
}

// ------------------------------------------------------------------
// The file list — selection, reorder, render
// ------------------------------------------------------------------

function findRowByPath(path) {
  return Array.from(fileListEl.children).find((li) => li.dataset.path === path);
}

function renderFileList() {
  fileListEl.innerHTML = '';
  for (const f of cachedFiles) {
    const li = document.createElement('li');
    li.className = 'file-row' + (selectedPaths.has(f.path) ? ' selected' : '');
    li.dataset.path = f.path;
    li.draggable = true;

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.draggable = false;
    grip.textContent = '⠿';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = f.name;
    name.title = f.name;

    li.appendChild(grip);
    li.appendChild(name);
    fileListEl.appendChild(li);
  }
}

// Click anywhere on a row except the grip -> toggle selection. No modifier
// keys required — the simplest possible multi-select gesture.
fileListEl.addEventListener('click', (e) => {
  const grip = e.target.closest('.grip');
  if (grip) return;
  const row = e.target.closest('.file-row');
  if (!row) return;
  const path = row.dataset.path;
  if (selectedPaths.has(path)) selectedPaths.delete(path);
  else selectedPaths.add(path);
  renderFileList();
});

// Drag the grip -> reorder within the shelf. Plain mouse tracking, not
// HTML5 drag-and-drop, so it can never be mistaken for a native OS drag.
fileListEl.addEventListener('mousedown', (e) => {
  const grip = e.target.closest('.grip');
  if (!grip) return;
  const row = grip.closest('.file-row');
  if (!row) return;
  e.preventDefault();
  startReorder(row.dataset.path);
});

function startReorder(path) {
  isReordering = true;
  const startRow = findRowByPath(path);
  if (startRow) startRow.classList.add('dragging-reorder');

  function onMove(ev) {
    const rows = Array.from(fileListEl.children);
    const fromIndex = cachedFiles.findIndex((f) => f.path === path);
    if (fromIndex === -1 || rows.length === 0) return;

    let toIndex = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) {
        toIndex = i;
        break;
      }
    }

    if (toIndex !== fromIndex) {
      const [moved] = cachedFiles.splice(fromIndex, 1);
      cachedFiles.splice(toIndex, 0, moved);
      renderFileList();
      const row = findRowByPath(path);
      if (row) row.classList.add('dragging-reorder');
    }
  }

  function onUp() {
    isReordering = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const row = findRowByPath(path);
    if (row) row.classList.remove('dragging-reorder');
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ------------------------------------------------------------------
// Hover-to-expand (genuine mouse hover, not an external file drag)
// ------------------------------------------------------------------

window.addEventListener('mouseenter', () => {
  if (dragDepth > 0) return;
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  requestExpand();
});

window.addEventListener('mouseleave', () => {
  if (isReordering) return;
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    collapseTimer = null;
    requestCollapse();
  }, HOVER_COLLAPSE_DELAY);
});

// ------------------------------------------------------------------
// INBOUND — suppress Chromium's default file-open behaviour everywhere
// ------------------------------------------------------------------

['dragenter', 'dragover', 'drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

window.addEventListener('dragenter', () => {
  dragDepth += 1;
  render();
});

window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  render();
});

window.addEventListener('drop', async (e) => {
  dragDepth = 0;

  const files = Array.from(e.dataTransfer.files || []);
  if (files.length === 0) {
    render();
    return;
  }

  const sourcePaths = files.map((f) => window.ghostDrop.getPathForFile(f)).filter(Boolean);
  if (sourcePaths.length === 0) {
    render();
    return;
  }

  const cached = await window.ghostDrop.dropFiles(sourcePaths);
  cachedFiles = cachedFiles.concat(cached);
  requestExpand(); // show the updated shelf immediately
});

// ------------------------------------------------------------------
// OUTBOUND — handing cached files off to whatever app they're dragged into
// ------------------------------------------------------------------

function handOff(files) {
  if (files.length === 0) return;
  window.ghostDrop.startNativeDrag(files.map((f) => f.path));

  const handedPaths = new Set(files.map((f) => f.path));
  cachedFiles = cachedFiles.filter((f) => !handedPaths.has(f.path));
  for (const p of handedPaths) selectedPaths.delete(p);

  requestCollapse();
}

// Drag the icon itself -> hand off the selection, or everything if nothing
// is explicitly selected (preserves the original "just drag it all out" flow).
dropzone.setAttribute('draggable', 'true');
dropzone.addEventListener('dragstart', (e) => {
  if (cachedFiles.length === 0) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  const subset = selectedPaths.size > 0
    ? cachedFiles.filter((f) => selectedPaths.has(f.path))
    : cachedFiles.slice();
  handOff(subset);
});

// Drag an individual row directly -> hand off just that one file, regardless
// of whatever is currently selected.
fileListEl.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.file-row');
  if (!row) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  const f = cachedFiles.find((x) => x.path === row.dataset.path);
  if (f) handOff([f]);
});

render();
