/**
 * Ghost-Drop overlay renderer — v1.2.2
 *
 * State machine  (body[data-state]):
 *   idle      — no files cached, no external drag happening
 *   hover     — an external OS drag (file from Explorer/browser) is
 *                hovering over the window (dragDepth > 0). Show the
 *                cyan accept highlight. Panel stays closed.
 *   populated — files cached, mouse is NOT hovering. Faint ghost,
 *                cyan border, count badge.
 *   expanded  — files cached AND mouse is hovering (no external drag).
 *                Panel animates open via CSS.
 *
 * Panel animation is pure CSS; the native window gets exactly two
 * setBounds() calls per expand/collapse — expand first (window grows),
 * collapse-done last (window shrinks, AFTER the CSS transition ends).
 */

// ── DOM refs ─────────────────────────────────────────────────────────────────
const body       = document.body;
const dropzone   = document.getElementById('dropzone');
const countEl    = document.getElementById('count');
const filePanel  = document.getElementById('filePanel');
const fileListEl = document.getElementById('fileList');

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {{name:string, path:string}[]} */
let cachedFiles   = [];
const selectedPaths = new Set();

let dragDepth     = 0;   // counts OS drag enter/leave pairs (inbound file gesture)
let isExpanded    = false;
let isReordering  = false;
let loadingCount  = 0;   // number of active URL/blob fetches

let expandTimer   = null;
let collapseTimer = null;

// ── File type helpers ─────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg','.ico','.avif']);
const TYPE_ICONS = {
  '.mp4':'🎬','.mov':'🎬','.avi':'🎬','.mkv':'🎬','.wmv':'🎬','.webm':'🎬',
  '.mp3':'🎵','.wav':'🎵','.aac':'🎵','.flac':'🎵','.ogg':'🎵','.m4a':'🎵',
  '.pdf':'📄',
  '.psd':'🎨','.ai':'🎨','.eps':'🎨','.fig':'🎨','.sketch':'🎨',
  '.zip':'🗜️','.rar':'🗜️','.7z':'🗜️','.tar':'🗜️','.gz':'🗜️',
  '.doc':'📝','.docx':'📝','.txt':'📝','.rtf':'📝',
  '.xls':'📊','.xlsx':'📊','.csv':'📊',
  '.ppt':'🖼️','.pptx':'🖼️',
  '.exe':'⚙️','.msi':'⚙️','.dmg':'⚙️',
};
const DEFAULT_ICON = '📁';

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}
function isImageFile(name)  { return IMAGE_EXTS.has(getExt(name)); }
function typeIcon(name)     { return TYPE_ICONS[getExt(name)] || DEFAULT_ICON; }
function toFileUrl(p)       { return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, ''); }

// ── Visual state machine ──────────────────────────────────────────────────────
function syncState() {
  if (dragDepth > 0) {
    body.dataset.state = 'hover';
  } else if (isExpanded && cachedFiles.length > 0) {
    body.dataset.state = 'expanded';
  } else if (cachedFiles.length > 0) {
    body.dataset.state = 'populated';
  } else {
    body.dataset.state = 'idle';
  }
}

function setLoading(delta) {
  loadingCount = Math.max(0, loadingCount + delta);
  body.dataset.loading = loadingCount > 0 ? 'true' : 'false';
}

function render() {
  syncState();
  // Count badge
  if (cachedFiles.length === 0) {
    countEl.classList.add('hidden');
  } else {
    countEl.textContent = String(cachedFiles.length);
    countEl.classList.remove('hidden');
  }
  renderFileList();
}

// ── File list rendering ───────────────────────────────────────────────────────
function renderFileList() {
  if (isReordering) return; // don't stomp the DOM mid-drag
  fileListEl.innerHTML = '';
  for (const f of cachedFiles) {
    fileListEl.appendChild(makeRow(f));
  }
}

function makeRow(f) {
  const li = document.createElement('li');
  li.className = 'file-row' + (selectedPaths.has(f.path) ? ' selected' : '');
  li.dataset.path = f.path;
  li.draggable = true;

  // ── Thumbnail or type icon ──
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  if (isImageFile(f.name)) {
    const img = document.createElement('img');
    img.src = toFileUrl(f.path);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => { thumb.removeChild(img); thumb.textContent = typeIcon(f.name); };
    thumb.appendChild(img);
  } else {
    thumb.textContent = typeIcon(f.name);
  }

  // ── Filename ──
  const nameEl = document.createElement('span');
  nameEl.className = 'file-name';
  nameEl.textContent = f.name;
  nameEl.title = f.name;

  // ── Reorder grip ──
  const grip = document.createElement('span');
  grip.className = 'grip';
  grip.textContent = '⠿';
  grip.draggable = false;

  // ── Remove button ──
  const xBtn = document.createElement('button');
  xBtn.className = 'remove-btn';
  xBtn.textContent = '×';
  xBtn.title = 'Remove';
  xBtn.draggable = false;

  li.append(thumb, nameEl, grip, xBtn);
  return li;
}

// ── Expand / Collapse ─────────────────────────────────────────────────────────
function requestExpand() {
  if (cachedFiles.length === 0 || isExpanded) return;
  clearCollapseTimer();
  filePanel.classList.remove('collapsing');
  // 1. Grow the native window first (single setBounds call)
  window.ghostDrop.expand();
  // 2. One frame later, trigger the CSS transition into the now-available space
  requestAnimationFrame(() => {
    isExpanded = true;
    syncState();
  });
}

function requestCollapse() {
  if (!isExpanded) return;
  // Never collapse while a file drag is active — doing so would shrink the
  // window and remove the drop target while the user is still carrying a file.
  if (dragDepth > 0) return;
  clearExpandTimer();
  filePanel.classList.add('collapsing');
  isExpanded = false;
  syncState(); // removes 'expanded' → CSS collapse transition starts
}

function clearExpandTimer()  { if (expandTimer)  { clearTimeout(expandTimer);  expandTimer  = null; } }
function clearCollapseTimer(){ if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; } }

// After the CSS collapse transition finishes, snap the window back to icon size
filePanel.addEventListener('transitionend', e => {
  if (e.target !== filePanel) return;
  if (e.propertyName === 'max-height' && !isExpanded) {
    filePanel.classList.remove('collapsing');
    window.ghostDrop.collapseDone();
  }
});

// ── Hover (mouse, not file drag) ──────────────────────────────────────────────
window.addEventListener('mouseenter', () => {
  if (dragDepth > 0) return; // they're carrying a file — don't expand the list
  clearCollapseTimer();
  if (!isExpanded && cachedFiles.length > 0) {
    expandTimer = setTimeout(requestExpand, 60); // tiny debounce, avoids accidental opens
  }
});

window.addEventListener('mouseleave', () => {
  clearExpandTimer();
  if (isReordering) return;
  // Don't start the collapse timer while an external drag is active over this
  // window (dragDepth > 0). The 'mouseleave' that fires as the user picks up
  // a file and brings it back would otherwise shrink the window mid-drag,
  // making the drop target disappear.
  if (dragDepth > 0) return;
  collapseTimer = setTimeout(requestCollapse, 160);
});

// ── Inbound: intercept all native drag events on this window ──────────────────
['dragenter','dragover','drop'].forEach(evt =>
  window.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); })
);

window.addEventListener('dragenter', () => { dragDepth++; render(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); render(); });

// dragend fires when the user cancels a drag (Escape key) or the drag
// ends without a successful drop. Reset dragDepth so the state machine
// doesn't get stuck in 'hover' and also clear any pending collapse that
// was held off during the drag.
window.addEventListener('dragend', () => {
  dragDepth = 0;
  render();
  if (isExpanded && !isReordering) {
    clearCollapseTimer();
    collapseTimer = setTimeout(requestCollapse, 160);
  }
});

window.addEventListener('drop', async e => {
  dragDepth = 0;

  // Collect synchronous data NOW — getData() only works inside the event handler
  const uriList  = e.dataTransfer.getData('text/uri-list');
  const files    = Array.from(e.dataTransfer.files  || []);
  const items    = Array.from(e.dataTransfer.items  || []);

  const added = await processDropData(files, items, uriList);
  if (added.length > 0) {
    cachedFiles = cachedFiles.concat(added);
    render();
    requestExpand();
  } else {
    render();
  }
});

async function processDropData(files, items, uriList) {
  const result = [];

  // ── Path 1: local files (Explorer, download bar, desktop) ──
  const localPaths = files
    .map(f => window.ghostDrop.getPathForFile(f))
    .filter(p => p && p.length > 0);

  if (localPaths.length > 0) {
    setLoading(+1);
    try {
      const cached = await window.ghostDrop.dropFiles(localPaths);
      result.push(...cached);
    } finally {
      setLoading(-1);
    }
    return result; // local files always win — skip URL / blob paths
  }

  // ── Path 2: URL from browser image drag (text/uri-list) ──
  if (uriList) {
    const urls = uriList
      .split(/\r?\n/)
      .map(u => u.trim())
      .filter(u => u && !u.startsWith('#') &&
                   (u.startsWith('http://') || u.startsWith('https://')));

    for (const url of urls) {
      setLoading(+1);
      try {
        const cached = await window.ghostDrop.fetchUrl(url);
        if (cached) result.push(cached);
      } catch {
        // fetch failed — silently skip this URL
      } finally {
        setLoading(-1);
        // Update the badge as each file lands, not only when all are done
        if (result.length > 0) {
          cachedFiles = cachedFiles.concat(result.splice(0));
          render();
          requestExpand();
        }
      }
    }
    return result;
  }

  // ── Path 3: raw blob (canvas export, data-URI drag, etc.) ──
  for (const file of files) {
    if (!file || file.size === 0) continue;
    setLoading(+1);
    try {
      const buffer = await file.arrayBuffer();
      const extHint = file.type ? '.' + file.type.split('/')[1].split('+')[0] : '';
      const name = file.name || ('file' + extHint);
      const cached = await window.ghostDrop.writeBlob(buffer, name);
      if (cached) result.push(cached);
    } catch {
      // blob write failed — skip
    } finally {
      setLoading(-1);
    }
  }

  // ── Path 4: string items (e.g. text dragged in — ignore gracefully) ──
  void items; // already used uriList (synchronous); nothing else here is useful

  return result;
}

// ── File list interactions ─────────────────────────────────────────────────────

// Click: toggle selection (any click that isn't on grip or X)
fileListEl.addEventListener('click', e => {
  // X button
  const xBtn = e.target.closest('.remove-btn');
  if (xBtn) {
    e.stopPropagation();
    const row = xBtn.closest('.file-row');
    if (!row) return;
    const p = row.dataset.path;
    cachedFiles = cachedFiles.filter(f => f.path !== p);
    selectedPaths.delete(p);
    render();
    if (cachedFiles.length === 0) requestCollapse();
    return;
  }

  // Grip — handled by mousedown below
  if (e.target.closest('.grip')) return;

  // Row body — toggle selection
  const row = e.target.closest('.file-row');
  if (!row) return;
  const p = row.dataset.path;
  if (selectedPaths.has(p)) selectedPaths.delete(p);
  else selectedPaths.add(p);
  renderFileList();
});

// Grip mousedown → reorder (custom loop, not HTML5 drag — we don't want to
// accidentally trigger a native OS drag when repositioning within the shelf)
fileListEl.addEventListener('mousedown', e => {
  const grip = e.target.closest('.grip');
  if (!grip) return;
  e.preventDefault();
  startReorder(grip.closest('.file-row').dataset.path);
});

function startReorder(targetPath) {
  isReordering = true;
  const targetRow = () => fileListEl.querySelector(`[data-path="${CSS.escape(targetPath)}"]`);
  if (targetRow()) targetRow().classList.add('dragging-reorder');

  function onMove(ev) {
    const rows = Array.from(fileListEl.children);
    const fromIdx = cachedFiles.findIndex(f => f.path === targetPath);
    if (fromIdx === -1 || rows.length < 2) return;

    let toIdx = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) { toIdx = i; break; }
    }
    if (toIdx !== fromIdx) {
      const [moved] = cachedFiles.splice(fromIdx, 1);
      cachedFiles.splice(toIdx, 0, moved);
      renderFileList();
      const r = targetRow();
      if (r) r.classList.add('dragging-reorder');
    }
  }

  function onUp() {
    isReordering = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const r = targetRow();
    if (r) r.classList.remove('dragging-reorder');
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Outbound drags ────────────────────────────────────────────────────────────
function handOff(subset) {
  if (subset.length === 0) return;
  window.ghostDrop.startNativeDrag(subset.map(f => f.path));

  // Files stay on the shelf. Only the × button removes them.
  // Reset dragDepth: when an outbound native drag starts, Chromium can fire a
  // spurious dragenter on the window. If that drag ends outside (e.g. dropped
  // into Premiere), no matching dragleave ever fires, leaving dragDepth stuck
  // at 1 and the app frozen in the teal hover state. Resetting here unblocks it.
  dragDepth = 0;
  render();

  // After startNativeDrag the OS drag takes ownership of the cursor.
  // Ghost-Drop's window won't receive a mouseleave event while the OS drag
  // is in flight, so the collapse timer never starts on its own — the shelf
  // stays open permanently. Kick the timer here so the shelf retracts cleanly
  // after the user drops the file into another app.
  if (isExpanded && !isReordering) {
    clearCollapseTimer();
    collapseTimer = setTimeout(requestCollapse, 400);
  }
}

// Drag the main ghost icon → hand off selection (or everything if nothing selected)
dropzone.setAttribute('draggable', 'true');
dropzone.addEventListener('dragstart', e => {
  if (cachedFiles.length === 0) { e.preventDefault(); return; }
  e.preventDefault(); // suppress Chromium's web drag; we use startNativeDrag
  const subset = selectedPaths.size > 0
    ? cachedFiles.filter(f => selectedPaths.has(f.path))
    : [...cachedFiles];
  handOff(subset);
});

// Drag an individual row → hand off just that one file
fileListEl.addEventListener('dragstart', e => {
  if (isReordering) { e.preventDefault(); return; }
  const row = e.target.closest('.file-row');
  if (!row) { e.preventDefault(); return; }
  e.preventDefault();
  const f = cachedFiles.find(x => x.path === row.dataset.path);
  if (f) handOff([f]);
});

// ── Initial render ────────────────────────────────────────────────────────────
render();
