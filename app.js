/**
 * app.js — orchestrator
 *
 * Owns: app state, navigation, UI wiring, cover editor, PDF export.
 * Delegates to: mode-config.js (what), scanner.js (read), renderer.js (draw).
 */

import { CODE_MODE, getModeById, ALL_MODES } from './mode-config.js';
import { scanFolder, scanUtilsFolder, readTextFromHandle,
         isImageFile, isDescriptionImage, getExt } from './scanner.js';
import { buildFileBlock, buildImageBlock, renderBodyContents,
         buildImageDescNote, escapeHtml, updateFileCountBadge } from './renderer.js';

// Make buildFileBlock accessible to renderUtilsSection without circular import
window.__renderer__ = { buildFileBlock };
import { exportExerciseListPdf } from './pdf-export.js';

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1: APP CONFIG
// ══════════════════════════════════════════════════════════════════════════

const CFG = (() => {
  const u = window.APP_CONFIG || {};
  const pdf = { contentWidthPx:900, viewportWidthPx:960, captureScale:2,
                pageWidthMm:210, pagePaddingMm:8, imageQuality:0.95, ...(u.pdf||{}) };
  const ui  = {
    pageTitle:'Report Generator',
    topbar: { useRootFolderName:true, separator:' > ', ...(u.ui?.topbar||{}) },
    text: {
      landingLabel:'Report Generator', landingTitle:'Lab Report Generator',
      landingDescription:'Open a folder to begin.',
      openProjectButton:'Open Folder',
      browserSupportNote:'Requires Chrome or Edge',
      footer:'Report Generator — Chrome & Edge',
      ...(u.ui?.text||{})
    },
    ...(u.ui||{})
  };
  return { pdf, ui };
})();

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: APP STATE
// ══════════════════════════════════════════════════════════════════════════

let activeMode     = CODE_MODE;   // current ModeConfig
let exercises      = [];          // loaded exercise cards
let exerciseIdSeed = 1;
const exerciseIndex = new Map();
let folderHandle   = null;        // last opened FileSystemDirectoryHandle
let folderName     = '';          // display name of opened folder
let activeSubtitle = '';

function ensureExerciseId(ex) {
  if (!ex._id) ex._id = `ex-${exerciseIdSeed++}`;
  return ex._id;
}

function reindexExercises() {
  exerciseIndex.clear();
  exercises.forEach(ex => exerciseIndex.set(ensureExerciseId(ex), ex));
}

function registerExercise(ex) {
  exerciseIndex.set(ensureExerciseId(ex), ex);
}

function unregisterExercise(ex) {
  if (ex?._id) exerciseIndex.delete(ex._id);
}

function findExerciseIdByName(name) {
  if (!name) return '';
  for (const [id, ex] of exerciseIndex.entries()) {
    if (ex?.name === name) return id;
  }
  return '';
}

// Utils folder state
let utilsFiles    = [];          // flat array of FileObject loaded from utils folder
let utilsFolderName = '';        // display name of utils folder
let showUtils     = true;        // controlled by Display Options toggle

// Cover page state
let coverImageDataUrl = '';
let coverLogoDataUrl  = './ITC_logo.png';
let coverLogoSize     = 120;
let coverTitleSize    = 28;
let includeCoverInPdf = true;
const coverInfo = {
  title:    'Institute Technology of Cambodia',
  subtitle: 'Lab Report',
};

/** Extract a zero-padded lab number from a folder name.
 *  "Lab3", "lab_03", "03_lab", "Exercise3", "3" → 3 → "03"
 *  Returns null if no number found.
 */
function extractLabNumber(name) {
  const m = String(name || '').match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return isNaN(n) ? null : String(n).padStart(2, '0');
}

/** Build the cover subtitle from a folder name.
 *  Folder "Lab3" → "Lab03 - Report"
 *  Folder "03"   → "Lab03 - Report"
 *  No number     → "Lab Report"  (fallback)
 */
function buildLabSubtitle(name) {
  const num = extractLabNumber(name);
  return num ? `Lab${num} - Report` : 'Lab Report';
}
let coverSections = [
  { label:'Course',     value:'Course' },
  { label:'Author',     value:'Author' },
  { label:'Instructor', value:'Instructor' },
  { label:'Date',       value: new Date().toLocaleDateString() },
];

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: MODE PICKER
// ══════════════════════════════════════════════════════════════════════════

async function selectMode(modeId) {
  activeMode = getModeById(modeId);
  ALL_MODES.forEach(m => {
    document.getElementById(`mode-${m.id}-btn`)?.classList.toggle('active', m.id === modeId);
  });
  syncModeUi();
  if (folderHandle) await loadFolder(folderHandle);
}

function syncModeUi() {
  const utilsEnabled = activeMode.utilsEnabled !== false;

  const utilsBtn = document.getElementById('utils-load-btn');
  if (utilsBtn) utilsBtn.style.display = utilsEnabled ? '' : 'none';

  const utilsRow = document.getElementById('tog-main-utils-row');
  if (utilsRow) utilsRow.style.display = utilsEnabled ? '' : 'none';

  const txtRow = document.getElementById('tog-main-txt-row');
  if (txtRow) txtRow.style.display = 'none';

  if (!utilsEnabled) {
    utilsFiles = [];
    utilsFolderName = '';
    document.querySelectorAll('.ex-utils-tag, .ex-utils-footer').forEach(el => el.remove());
    const banner = document.getElementById('utils-banner');
    const section = document.getElementById('utils-section');
    const notice = document.getElementById('utils-info-notice');
    if (banner) banner.style.display = 'none';
    if (section) section.style.display = 'none';
    if (notice) notice.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4: FOLDER LOADING
// ══════════════════════════════════════════════════════════════════════════

async function openFolder() {
  if (!window.showDirectoryPicker) { alert('Use Chrome or Edge.'); return; }
  try {
    const handle = await window.showDirectoryPicker();
    folderHandle = handle;
    folderName   = handle.name || '';
    await loadFolder(handle);
  } catch (err) {
    if (err?.name !== 'AbortError') alert(`Cannot open folder: ${err?.message || err}`);
  }
}

async function rescan() {
  if (folderHandle) await loadFolder(folderHandle); else await openFolder();
}

async function loadUtilsFolder() {
  if (!window.showDirectoryPicker) { alert('Use Chrome or Edge.'); return; }
  if (activeMode.utilsEnabled === false) {
    alert('Utils folders are disabled in this mode.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    utilsFolderName = handle.name || 'utils';
    setLoading(10);
    utilsFiles = await scanUtilsFolder(handle, activeMode);
    setLoading(100); setTimeout(() => setLoading(0), 350);
    renderUtilsSection();
  } catch (err) {
    if (err?.name !== 'AbortError') alert('Cannot open folder: ' + (err?.message || err));
  }
}

function clearUtilsFolder() {
  utilsFiles = [];
  utilsFolderName = '';
  document.querySelectorAll('#general-ex-list .ex-item').forEach(item => {
    delete item.dataset.utilsDisabled;
  });
  document.querySelectorAll('.ex-utils-tag, .ex-utils-footer').forEach(el => el.remove());
  renderUtilsSection();
  const notice = document.getElementById('utils-info-notice');
  if (notice) notice.style.display = 'none';
}

function dismissUtilsNotice() {
  const notice = document.getElementById('utils-info-notice');
  if (notice) { notice.dataset.dismissed = '1'; notice.style.display = 'none'; }
}

let utilsSectionCollapsed = false;
function toggleUtilsSection() {
  utilsSectionCollapsed = !utilsSectionCollapsed;
  const sec = document.getElementById('utils-section');
  const btn = document.getElementById('utils-collapse-btn');
  if (sec) sec.style.display = utilsSectionCollapsed ? 'none' : '';
  if (btn) btn.textContent = utilsSectionCollapsed ? '▶' : '▼';
}

async function loadFolder(handle) {
  setLoading(10);
  // Clear any previously loaded utils when opening a new folder
  utilsFiles = [];
  utilsFolderName = '';
  exercises = await scanFolder(handle, folderName, activeMode, pct => setLoading(10 + pct * 0.85));
  reindexExercises();
  setLoading(100); setTimeout(() => setLoading(0), 350);

  // Update mode badge
  const badge = document.getElementById('mode-badge');
  if (badge) {
    badge.textContent = `${activeMode.icon} ${activeMode.label}`;
    badge.className   = `mode-badge mode-badge--${activeMode.id}`;
  }

  // Always reset cover fields on new folder load
  coverInfo.title    = 'Institute Technology of Cambodia';
  coverInfo.subtitle = buildLabSubtitle(folderName);

  const titleInp = document.getElementById('cover-title-input');
  const subInp   = document.getElementById('cover-subtitle-input');
  if (titleInp) titleInp.value = coverInfo.title;
  if (subInp)   subInp.value   = coverInfo.subtitle;
  syncCoverPreview();

  loadReadmeHowTo(handle);
  renderExercises();
  renderUtilsSection();
  syncModeUi();
  applyToggles();
  showMain();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: RENDER EXERCISES
// ══════════════════════════════════════════════════════════════════════════

function renderUtilsSection() {
  const container = document.getElementById('utils-section');
  const banner    = document.getElementById('utils-banner');
  const notice    = document.getElementById('utils-info-notice');
  if (!container || !banner) return;

  if (activeMode.utilsEnabled === false) {
    container.style.display = 'none';
    banner.style.display    = 'none';
    if (notice) notice.style.display = 'none';
    document.querySelectorAll('.ex-utils-tag, .ex-utils-footer').forEach(el => el.remove());
    return;
  }

  // Rebuild per-exercise header tags every render.
  document.querySelectorAll('.ex-utils-tag').forEach(el => el.remove());

  if (!utilsFiles.length) {
    container.style.display = 'none';
    banner.style.display    = 'none';
    if (notice) notice.style.display = 'none';
    document.querySelectorAll('.ex-utils-footer').forEach(el => el.remove());
    return;
  }

  // Show top info notice (dismissible — once dismissed stays hidden)
  if (notice && notice.dataset.dismissed !== '1') notice.style.display = '';

  // Update banner folder name
  const bannerName = document.getElementById('utils-banner-name');
  if (bannerName) bannerName.textContent = utilsFolderName;

  // Show/hide based on toggle
  const visible = showUtils && document.getElementById('tog-main-utils')?.checked !== false;
  banner.style.display    = visible ? '' : 'none';
  container.style.display = (visible && !utilsSectionCollapsed) ? '' : 'none';
  if (!visible) {
    document.querySelectorAll('.ex-utils-footer').forEach(el => el.remove());
    return;
  }

  // Build utils section
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'utils-heading';
  heading.innerHTML =
    `<span class="utils-title">📦 ${escapeHtml(utilsFolderName)} — Shared Utilities</span>` +
    `<span class="utils-meta">${utilsFiles.length} file${utilsFiles.length !== 1 ? 's' : ''}</span>` +
    `<button class="small-btn danger" onclick="clearUtilsFolder()" title="Remove utils folder">✕ Remove</button>`;
  container.appendChild(heading);

  const mc = activeMode;
  utilsFiles.forEach(f => {
    const { buildFileBlock } = window.__renderer__;
    if (buildFileBlock) container.appendChild(buildFileBlock(f, null, mc));
  });

  // Inject utils footer into any already-open exercise bodies (new load only)
  injectUtilsFootersIntoOpenBodies();
  injectUtilsTagsIntoCards();
}

function injectUtilsTagsIntoCards() {
  if (!utilsFiles.length) return;

  document.querySelectorAll('#general-ex-list .ex-item').forEach(item => {
    if (item.dataset.utilsDisabled === '1') return;
    if (item.querySelector('.ex-utils-tag')) return;

    const tag = document.createElement('span');
    tag.className = 'ex-utils-tag';
    tag.innerHTML = '<span class="label">📦 utils</span>';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ex-utils-tag-remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Hide utils for this exercise';
    removeBtn.textContent = '×';
    removeBtn.onclick = e => {
      e.stopPropagation();
      item.dataset.utilsDisabled = '1';
      item.querySelector('.ex-utils-tag')?.remove();
      item.querySelector('.ex-utils-footer')?.remove();
    };
    tag.appendChild(removeBtn);

    const chevron = item.querySelector('.ex-chevron');
    if (chevron && chevron.parentNode) chevron.parentNode.insertBefore(tag, chevron);
    else item.querySelector('.ex-header')?.appendChild(tag);
  });
}

/** Inject a utils footer into exercise bodies that are already open.
 *  Only called once when utils are first loaded — after that users own their footers. */
function injectUtilsFootersIntoOpenBodies() {
  document.querySelectorAll('#general-ex-list .ex-body[data-loaded="1"]').forEach(body => {
    if (!body.querySelector('.ex-utils-footer')) {
      const addRow = body.querySelector('.ex-add-row');
      const footer = buildUtilsFooter(utilsFiles.map(f => f.name));
      addRow ? body.insertBefore(footer, addRow) : body.appendChild(footer);
    }
  });
}

/**
 * Build the utils footer for an exercise body.
 * Each chip has an ✕ to remove it individually.
 * A "+ Add" button lets users add back any chip that was removed.
 *
 * @param {string[]} fileNames  — list of utils file names to show as chips
 */
function buildUtilsFooter(fileNames) {
  const footer = document.createElement('div');
  footer.className = 'ex-utils-footer';

  const title = document.createElement('div');
  title.className = 'ex-utils-footer-title';
  title.innerHTML = '<span>📦 Utils used</span>';

  // Add button — opens a small inline picker of all available utils files
  const addBtn = document.createElement('button');
  addBtn.className = 'utils-chip-add-btn';
  addBtn.textContent = '＋ Add';
  addBtn.title = 'Add a utils file chip';
  addBtn.onclick = e => {
    e.stopPropagation();
    openUtilsChipPicker(addBtn, chipsWrap);
  };
  title.appendChild(addBtn);
  footer.appendChild(title);

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'ex-utils-chips';
  fileNames.forEach(name => chipsWrap.appendChild(buildUtilsChip(name, chipsWrap)));
  footer.appendChild(chipsWrap);

  return footer;
}

/** Build one removable chip for a utils file name */
function buildUtilsChip(name, chipsWrap) {
  const chip = document.createElement('span');
  chip.className = 'utils-file-chip';
  chip.dataset.utilsName = name;

  const label = document.createElement('span');
  label.textContent = `📦 ${name}`;
  chip.appendChild(label);

  const x = document.createElement('button');
  x.className = 'utils-chip-remove';
  x.title = 'Remove this chip';
  x.textContent = '×';
  x.onclick = e => { e.stopPropagation(); chip.remove(); };
  chip.appendChild(x);

  return chip;
}

/** Show a small inline popover to add back a utils chip */
function openUtilsChipPicker(anchorBtn, chipsWrap) {
  // Remove any existing picker
  document.querySelectorAll('.utils-chip-picker').forEach(p => p.remove());

  const alreadyShown = new Set(
    Array.from(chipsWrap.querySelectorAll('.utils-file-chip')).map(c => c.dataset.utilsName)
  );
  const available = utilsFiles.map(f => f.name).filter(n => !alreadyShown.has(n));

  if (!available.length) {
    // All chips already shown — flash the add button briefly
    anchorBtn.textContent = '✓ all added';
    setTimeout(() => { anchorBtn.textContent = '＋ Add'; }, 1200);
    return;
  }

  const picker = document.createElement('div');
  picker.className = 'utils-chip-picker';
  available.forEach(name => {
    const opt = document.createElement('button');
    opt.className = 'utils-chip-picker-opt';
    opt.textContent = name;
    opt.onclick = e => {
      e.stopPropagation();
      chipsWrap.appendChild(buildUtilsChip(name, chipsWrap));
      picker.remove();
    };
    picker.appendChild(opt);
  });

  // Close picker on outside click
  const close = e => { if (!picker.contains(e.target) && e.target !== anchorBtn) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);

  anchorBtn.after(picker);
}

function renderExercises() {
  const list = document.getElementById('general-ex-list');
  list.innerHTML = '';

  document.getElementById('general-title').textContent = folderName || 'Files';
  document.getElementById('general-tag').textContent =
    `${exercises.length} card${exercises.length !== 1 ? 's' : ''}`;

  const pdBtn = document.getElementById('export-general-pdf-btn');
  if (pdBtn) pdBtn.style.display = exercises.length ? '' : 'none';

  if (!exercises.length) {
    list.innerHTML = '<div class="empty-card"><div class="big">📂</div>No files found in this folder.</div>';
    return;
  }

  exercises.forEach((ex, idx) => {
    ensureExerciseId(ex);
    const item = buildExerciseItem(ex, idx);
    item.querySelector('.ex-header').onclick = e => {
      if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
      item.classList.toggle('open');
      if (item.classList.contains('open')) populateExerciseBody(item.querySelector('.ex-body'), ex);
    };
    list.appendChild(item);
  });
  if (utilsFiles.length) injectUtilsTagsIntoCards();
  initDragSort(list);
  initBlockDragSort(list);
}

function buildExerciseItem(ex, idx) {
  const num  = (ex.name.replace(/\D/g,'') || String(idx + 1));
  const meta = `${ex.files.length} file${ex.files.length !== 1 ? 's' : ''}`;
  const item = document.createElement('div');
  item.className = 'ex-item'; item.draggable = true; item.dataset.exName = ex.name; item.dataset.exId = ensureExerciseId(ex);
  item.innerHTML = `
    <div class="ex-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <div class="ex-num">${escapeHtml(num)}</div>
      <input class="ex-title-input" type="text" value="${escapeHtml(ex.name)}" title="Click to rename"/>
      <button class="ex-delete-btn" title="Remove this card">✕</button>
      <span class="ex-chevron">▶</span>
    </div>
    <div class="ex-body"></div>`;

  const ti = item.querySelector('.ex-title-input');
  ti.addEventListener('click', e => e.stopPropagation());
  ti.addEventListener('keydown', e => { if (e.key === 'Enter') ti.blur(); });
  ti.addEventListener('change', () => {
    const v = ti.value.trim();
    if (v) { ex.name = v; item.dataset.exName = v; } else ti.value = ex.name;
  });

  item.querySelector('.ex-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`Remove "${ex.name}"?`)) {
      const i = exercises.indexOf(ex);
      if (i > -1) exercises.splice(i, 1);
      unregisterExercise(ex);
      item.remove();
    }
  });

  if (utilsFiles.length && item.dataset.utilsDisabled !== '1') {
    const chevron = item.querySelector('.ex-chevron');
    const tag = document.createElement('span');
    tag.className = 'ex-utils-tag';
    tag.innerHTML = '<span class="label">📦 utils</span>';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'ex-utils-tag-remove';
    removeBtn.type = 'button';
    removeBtn.title = 'Hide utils for this exercise';
    removeBtn.textContent = '×';
    removeBtn.onclick = e => {
      e.stopPropagation();
      item.dataset.utilsDisabled = '1';
      item.querySelector('.ex-utils-tag')?.remove();
      item.querySelector('.ex-utils-footer')?.remove();
    };
    tag.appendChild(removeBtn);
    if (chevron && chevron.parentNode) chevron.parentNode.insertBefore(tag, chevron);
  }

  return item;
}

function populateExerciseBody(body, ex) {
  if (body.dataset.loaded === '1') return;
  body.dataset.loaded = '1';

  const mc = getModeById(ex._mode || activeMode.id);

  renderBodyContents(body, ex, mc, renderOutputContent);
  assignBlockOwnership(body, ex);

  // Notes textarea
  const notesRow = document.createElement('div');
  notesRow.className = 'ex-notes-row';
  const ta = document.createElement('textarea');
  ta.className = 'ex-notes-area';
  ta.placeholder = 'Notes for this exercise (shown in PDF if filled)…';
  ta.value = ex._notes || '';
  ta.addEventListener('input', () => { ex._notes = ta.value; });
  notesRow.appendChild(ta); body.appendChild(notesRow);

  // Add file / add image row
  const addRow = document.createElement('div');
  addRow.className = 'ex-add-row';
  const af = document.createElement('button');
  af.className = 'add-file-btn'; af.innerHTML = '＋ Add File';
  af.onclick = e => { e.stopPropagation(); pickAndAddFiles(body, ex, mc, addRow); };
  const ai = document.createElement('button');
  ai.className = 'add-image-btn'; ai.innerHTML = '＋ Add Image';
  ai.onclick = e => { e.stopPropagation(); pickAndAddImages(body, ex, addRow); };
  addRow.appendChild(af); addRow.appendChild(ai);

  // Utils footer — render above add buttons for this exercise
  if (utilsFiles.length && body.closest('.ex-item')?.dataset.utilsDisabled !== '1' && !body.querySelector('.ex-utils-footer')) {
    body.appendChild(buildUtilsFooter(utilsFiles.map(f => f.name)));
  }

  body.appendChild(addRow);
  initFileDragSort(body);
}

function assignBlockOwnership(body, ex) {
  const exId = ensureExerciseId(ex);
  body.querySelectorAll('.code-with-desc,.output-block,.image-block,.image-description-note,.desc-text-note')
    .forEach(block => {
      block.dataset.ownerExId = exId;
      block.dataset.ownerEx = ex.name;
    });
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6: DISPLAY OPTIONS TOGGLES
// ══════════════════════════════════════════════════════════════════════════

function applyToggles() {
  const p = 'tog-main';
  const list = document.getElementById('general-ex-list');
  if (!list) return;

  const showOut   = document.getElementById(p+'-output')?.checked ?? true;
  const showImg   = document.getElementById(p+'-images')?.checked ?? true;
  const showImgDesc = document.getElementById(p+'-image-desc')?.checked ?? true;
  const showEmpty = document.getElementById(p+'-empty-output')?.checked ?? true;
  const showDesc  = document.getElementById(p+'-desc')?.checked ?? true;
  const showNotes = document.getElementById(p+'-notes')?.checked ?? true;
  list.querySelectorAll('.output-block').forEach(ob => {
    const isEmpty = ob.querySelector('.output-text')?.textContent.startsWith('No output') ?? false;
    ob.style.display = (isEmpty ? showEmpty : showOut) ? '' : 'none';
  });
  list.querySelectorAll('.image-block').forEach(ib => { ib.style.display = showImg ? '' : 'none'; });
  list.querySelectorAll('.image-description-note').forEach(en => {
    en.style.display = (!showImgDesc || en.dataset.userHidden === '1') ? 'none' : '';
  });
  list.querySelectorAll('.exercise-note[data-auto-desc]').forEach(en => {
    en.style.display = (!showDesc || en.dataset.userHidden === '1') ? 'none' : '';
  });
  list.querySelectorAll('.ex-notes-row').forEach(nr => { nr.style.display = showNotes ? '' : 'none'; });

  // Utils section
  const showU = (activeMode.utilsEnabled !== false) && (document.getElementById('tog-main-utils')?.checked ?? true);
  showUtils = showU;
  renderUtilsSection();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7: QoL — ADD FILES, ADD IMAGES, NEW CARD, DROP ZONE
// ══════════════════════════════════════════════════════════════════════════

function pickAndAddFiles(body, ex, modeConfig, addRow) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.onchange = async () => {
    for (const file of Array.from(input.files)) {
      let content;
      try { content = await file.text(); } catch { content = '[binary]'; }
      const ext = getExt(file.name);
      const f = { name:file.name, ext, main:false, content, proseMode:modeConfig.renderAsProse({ext}) };
      ex.files.push(f);
      const wrap = buildFileBlock(f, ex, modeConfig);
      wrap.dataset.ownerExId = ensureExerciseId(ex);
      wrap.dataset.ownerEx = ex.name;
      body.insertBefore(wrap, addRow);
      updateFileCountBadge(wrap, ex);
    }
    initFileDragSort(body);
  };
  input.click();
}

function pickAndAddImages(body, ex, addRow) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = 'image/*';
  input.onchange = async () => {
    for (const file of Array.from(input.files)) {
      const dataUrl = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result); r.onerror = () => res('');
        r.readAsDataURL(file);
      });
      if (!dataUrl) continue;

      // Classify as description or regular image
      if (isDescriptionImage(file.name)) {
        ex.descImages = ex.descImages || [];
        ex.descImages.push({ fileName: file.name, dataUrl });
        const imgDescNote = buildImageDescNote(dataUrl, file.name);
        imgDescNote.dataset.ownerExId = ensureExerciseId(ex);
        imgDescNote.dataset.ownerEx = ex.name;
        body.insertBefore(imgDescNote, body.firstChild);
      } else {
        ex.images = ex.images || [];
        ex.images.push({ fileName: file.name, dataUrl });
        const imgBlock = buildImageBlock(file.name, dataUrl);
        imgBlock.dataset.ownerExId = ensureExerciseId(ex);
        imgBlock.dataset.ownerEx = ex.name;
        body.insertBefore(imgBlock, addRow);
      }
    }
    initFileDragSort(body);
  };
  input.click();
}

function addNewCard() {
  const mc  = activeMode;
  const ex  = { name:'New Card', files:[], images:[], descImages:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
  exercises.push(ex);
  registerExercise(ex);
  const list = document.getElementById('general-ex-list');
  const item = buildExerciseItem(ex, exercises.length - 1);
  item.querySelector('.ex-header').onclick = e => {
    if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
    item.classList.toggle('open');
    if (item.classList.contains('open')) populateExerciseBody(item.querySelector('.ex-body'), ex);
  };
  list.appendChild(item);
  item.classList.add('open');
  populateExerciseBody(item.querySelector('.ex-body'), ex);
  const ti = item.querySelector('.ex-title-input');
  if (ti) { ti.select(); setTimeout(() => ti.focus(), 50); }
  updateCountTag();
  item.scrollIntoView({ behavior:'smooth', block:'center' });
}

function addFilesToNewCard() {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.onchange = async () => {
    if (!input.files.length) return;
    const mc = activeMode;
    const ex = { name:'Files', files:[], images:[], descImages:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
    exercises.push(ex);
    registerExercise(ex);
    for (const file of Array.from(input.files)) {
      if (isImageFile(file.name)) {
        const dataUrl = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res('');
          r.readAsDataURL(file);
        });
        if (dataUrl) {
          if (isDescriptionImage(file.name)) {
            ex.descImages.push({ fileName: file.name, dataUrl });
          } else {
            ex.images.push({ fileName:file.name, dataUrl });
          }
        }
      } else {
        let content; try { content = await file.text(); } catch { content = '[binary]'; }
        const ext = getExt(file.name);
        ex.files.push({ name:file.name, ext, main:false, content, proseMode:mc.renderAsProse({ext}) });
      }
    }
    if (ex.files.length === 1) ex.name = ex.files[0].name;
    else if (!ex.files.length && (ex.images.length + ex.descImages.length === 1)) {
      ex.name = (ex.images[0]?.fileName || ex.descImages[0]?.fileName || 'Files');
    }
    const list = document.getElementById('general-ex-list');
    const item = buildExerciseItem(ex, exercises.length - 1);
    item.querySelector('.ex-header').onclick = e => {
      if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
      item.classList.toggle('open');
      if (item.classList.contains('open')) populateExerciseBody(item.querySelector('.ex-body'), ex);
    };
    list.appendChild(item);
    item.classList.add('open');
    populateExerciseBody(item.querySelector('.ex-body'), ex);
    updateCountTag();
    item.scrollIntoView({ behavior:'smooth', block:'center' });
  };
  input.click();
}

function updateCountTag() {
  const tag = document.getElementById('general-tag');
  if (tag) tag.textContent = `${exercises.length} card${exercises.length !== 1 ? 's' : ''}`;
}

function initGenDropzone() {
  const zone = document.getElementById('gen-dropzone');
  const view = document.getElementById('view-general');
  if (!zone || !view) return;
  view.addEventListener('dragover', e => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('drag-over'); }
  });
  view.addEventListener('dragleave', e => { if (!view.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
  view.addEventListener('drop', async e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const mc = activeMode;
    const ex = { name:'Dropped Files', files:[], images:[], descImages:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
    exercises.push(ex);
    registerExercise(ex);
    for (const file of files) {
      if (isImageFile(file.name)) {
        const dataUrl = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res('');
          r.readAsDataURL(file);
        });
        if (dataUrl) {
          if (isDescriptionImage(file.name)) {
            ex.descImages.push({ fileName: file.name, dataUrl });
          } else {
            ex.images.push({ fileName:file.name, dataUrl });
          }
        }
      } else {
        let content; try { content = await file.text(); } catch { content = '[binary]'; }
        const ext = getExt(file.name);
        ex.files.push({ name:file.name, ext, main:false, content, proseMode:mc.renderAsProse({ext}) });
      }
    }
    if (ex.files.length === 1) ex.name = ex.files[0].name;
    else if (!ex.files.length && (ex.images.length + ex.descImages.length === 1)) {
      ex.name = (ex.images[0]?.fileName || ex.descImages[0]?.fileName || 'Dropped Files');
    }
    const list = document.getElementById('general-ex-list');
    const item = buildExerciseItem(ex, exercises.length - 1);
    item.querySelector('.ex-header').onclick = e2 => {
      if (e2.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
      item.classList.toggle('open');
      if (item.classList.contains('open')) populateExerciseBody(item.querySelector('.ex-body'), ex);
    };
    list.appendChild(item); item.classList.add('open');
    populateExerciseBody(item.querySelector('.ex-body'), ex);
    updateCountTag();
    item.scrollIntoView({ behavior:'smooth', block:'center' });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8: OUTPUT CONTENT RENDERING (CSV table or plain text)
// ══════════════════════════════════════════════════════════════════════════

function renderOutputContent(container, fileName, sectionText) {
  if (!container) return;
  const ext = getExt(fileName);
  if (ext === 'csv') {
    const rows = parseCsv(sectionText);
    if (rows.length) {
      const wrap = document.createElement('div'); wrap.className = 'output-table-wrap';
      const table = document.createElement('table'); table.className = 'output-table';
      const maxC = rows.reduce((m,r)=>Math.max(m,r.length),0);
      const norm = rows.map(r=>r.length>=maxC?r:r.concat(Array(maxC-r.length).fill('')));
      const [hdr,...body] = norm;
      if (hdr) {
        const thead=document.createElement('thead'),tr=document.createElement('tr');
        hdr.forEach(v=>{const th=document.createElement('th');th.textContent=v;tr.appendChild(th);});
        thead.appendChild(tr); table.appendChild(thead);
      }
      const tbody=document.createElement('tbody');
      body.forEach(row=>{const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});tbody.appendChild(tr);});
      table.appendChild(tbody); wrap.appendChild(table); container.appendChild(wrap);
      return;
    }
  }
  if (ext === 'json') {
    try {
      const parsed = JSON.parse(sectionText);
      const preJson = document.createElement('pre');
      preJson.className = 'output-text';
      preJson.textContent = JSON.stringify(parsed, null, 2);
      container.appendChild(preJson);
      return;
    } catch {
      // keep raw json text if parse fails
    }
  }
  const pre=document.createElement('pre'); pre.className='output-text'; pre.textContent=sectionText; container.appendChild(pre);
}

function parseCsv(text) {
  const src=String(text||'').replace(/^\uFEFF/,''); if(!src.trim())return[];
  const rows=[];let row=[],cell='',i=0,inQ=false;
  while(i<src.length){const ch=src[i];
    if(inQ){if(ch==='"'){if(src[i+1]==='"'){cell+='"';i+=2;continue;}inQ=false;i++;continue;}cell+=ch;i++;continue;}
    if(ch==='"'){inQ=true;i++;continue;}
    if(ch===','){row.push(cell);cell='';i++;continue;}
    if(ch==='\n'||ch==='\r'){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);row=[];cell='';i++;continue;}
    cell+=ch;i++;}
  row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);return rows;
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9: COLLAPSE / EXPAND / DRAG SORT
// ══════════════════════════════════════════════════════════════════════════

function collapseAll() {
  document.querySelectorAll('#general-ex-list .ex-item').forEach(i=>i.classList.remove('open'));
}
function expandAll() {
  document.querySelectorAll('#general-ex-list .ex-item').forEach(item=>{
    item.classList.add('open');
    const body=item.querySelector('.ex-body');
    const ex=exerciseIndex.get(item.dataset.exId || '');
    if(ex) populateExerciseBody(body,ex);
  });
}

function initDragSort(list) {
  if (list.dataset.dragSortInit === '1') return;
  list.dataset.dragSortInit = '1';
  let src=null;
  let over=null;
  list.addEventListener('dragstart',e=>{const item=e.target.closest('.ex-item');if(!item)return;src=item;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  list.addEventListener('dragend',()=>{if (over) over.classList.remove('drag-over'); list.querySelectorAll('.dragging').forEach(i=>i.classList.remove('dragging')); src=null; over=null;});
  list.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';const t=e.target.closest('.ex-item');if(!t||t===src)return; if (over && over!==t) over.classList.remove('drag-over'); over=t; t.classList.add('drag-over');});
  list.addEventListener('dragleave',e=>{const t=e.target.closest('.ex-item');if(t&&t===over){t.classList.remove('drag-over'); over=null;}});
  list.addEventListener('drop',e=>{e.preventDefault();const t=e.target.closest('.ex-item');if(!t||t===src||!src)return;t.classList.remove('drag-over');const items=Array.from(list.querySelectorAll('.ex-item'));const si=items.indexOf(src),ti=items.indexOf(t);list.insertBefore(src,si<ti?t.nextSibling:t);Array.from(list.querySelectorAll('.ex-item')).forEach((el,i)=>{const b=el.querySelector('.ex-num');if(b)b.textContent=String(i+1);});src=null;});
}

/**
 * initBlockDragSort — unified drag for ALL block types within AND across exercises.
 * Also integrates with storage panel via window.__dragSrc.
 */
function initBlockDragSort(list) {
  if (list.dataset.blockDragSortInit === '1') return;
  list.dataset.blockDragSortInit = '1';
  const BLOCK_SEL = '.code-with-desc,.output-block,.image-block,.image-description-note,.desc-text-note';
  let src = null, srcBody = null;
  let hoverBlock = null, hoverBody = null;

  list.addEventListener('dragstart', e => {
    const b = e.target.closest(BLOCK_SEL + '[draggable="true"]');
    if (!b) return;
    src = b; srcBody = b.closest('.ex-body');
    window.__dragSrc = b; window.__dragSrcStorage = null;
    b.classList.add('file-dragging');
    e.dataTransfer.effectAllowed = 'move'; e.stopPropagation();
  }, true);

  list.addEventListener('dragend', () => {
    if (hoverBlock) hoverBlock.classList.remove('file-drag-over');
    if (hoverBody) hoverBody.classList.remove('cross-drag-over');
    list.querySelectorAll('.file-dragging').forEach(el => el.classList.remove('file-dragging'));
    window.__dragSrc = null;
    src = null; srcBody = null; hoverBlock = null; hoverBody = null;
  }, true);

  list.addEventListener('dragover', e => {
    if (!src) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
    const nextHoverBlock = e.target.closest(BLOCK_SEL);
    const nextHoverBody  = e.target.closest('.ex-body');
    if (hoverBlock && hoverBlock !== nextHoverBlock) hoverBlock.classList.remove('file-drag-over');
    if (hoverBody && hoverBody !== nextHoverBody) hoverBody.classList.remove('cross-drag-over');
    hoverBlock = null;
    hoverBody = null;
    if (nextHoverBlock && nextHoverBlock !== src) {
      nextHoverBlock.classList.add('file-drag-over');
      hoverBlock = nextHoverBlock;
    } else if (nextHoverBody && nextHoverBody !== srcBody) {
      nextHoverBody.classList.add('cross-drag-over');
      hoverBody = nextHoverBody;
    }
  }, true);

  list.addEventListener('dragleave', e => {
    const b = e.target.closest(BLOCK_SEL);
    if (b && b === hoverBlock) {
      b.classList.remove('file-drag-over');
      hoverBlock = null;
    }
    const bd = e.target.closest('.ex-body');
    if (bd && bd === hoverBody) {
      bd.classList.remove('cross-drag-over');
      hoverBody = null;
    }
  }, true);

  list.addEventListener('drop', e => {
    if (!src) return;
    e.preventDefault(); e.stopPropagation();
    const dropBlock = e.target.closest(BLOCK_SEL);
    const dropBody  = e.target.closest('.ex-body');
    if (!dropBody && !dropBlock) return;
    const targetBody = dropBody || dropBlock?.closest('.ex-body');
    if (!targetBody) return;
    targetBody.classList.remove('cross-drag-over');
    if (hoverBlock) hoverBlock.classList.remove('file-drag-over');
    if (hoverBody) hoverBody.classList.remove('cross-drag-over');

    // Remove from storage stash if it came from there
    window.__dragSrcStorage?.remove(); window.__dragSrcStorage = null;

    const isSameBody = targetBody === srcBody;
    const targetExId = targetBody.closest('.ex-item')?.dataset.exId || '';
    const sourceExId = srcBody?.closest('.ex-item')?.dataset.exId || src.dataset.ownerExId || findExerciseIdByName(src.dataset.ownerEx || '');

    if (isSameBody && dropBlock && dropBlock !== src) {
      // A: Intra-exercise reorder
      const blocks = Array.from(targetBody.querySelectorAll(BLOCK_SEL));
      const si = blocks.indexOf(src), ti = blocks.indexOf(dropBlock);
      targetBody.insertBefore(src, si < ti ? dropBlock.nextSibling : dropBlock);
    } else if (!isSameBody) {
      // B: Cross-exercise move
      const tgtItem = targetBody.closest('.ex-item');
      if (!tgtItem) return;
      if (sourceExId && sourceExId === targetExId) {
        if (dropBlock && dropBlock !== src && dropBlock.closest('.ex-body') === targetBody) {
          targetBody.insertBefore(src, dropBlock);
        } else {
          const anchor = targetBody.querySelector('.ex-add-row,.ex-notes-row');
          anchor ? targetBody.insertBefore(src, anchor) : targetBody.appendChild(src);
        }
        src.dataset.ownerExId = targetExId;
        src.dataset.ownerEx = tgtItem.dataset.exName || '';
        src.classList.remove('file-dragging'); src = null; srcBody = null;
        return;
      }

      const srcEx = exerciseIndex.get(sourceExId);
      const tgtEx = exerciseIndex.get(targetExId);
      if (!tgtEx) return;

      const blockType = src.dataset.blockType;
      if (srcEx && blockType === 'code') {
        const fname = src.dataset.fileName;
        const fi = (srcEx.files||[]).findIndex(f => f.name === fname);
        if (fi > -1) { const [f] = srcEx.files.splice(fi,1); (tgtEx.files=tgtEx.files||[]).push(f); updateFileCountBadge(src,srcEx); updateFileCountBadge(src,tgtEx); }
      } else if (srcEx && blockType === 'output') {
        const fname = src.dataset.fileName || src.querySelector('.fname')?.textContent.split('·')[0].trim();
        const oi = (srcEx.outputSectionsCache||[]).findIndex(o=>o.fileName===fname);
        if (oi > -1) { const [o]=srcEx.outputSectionsCache.splice(oi,1); (tgtEx.outputSectionsCache=tgtEx.outputSectionsCache||[]).push(o); }
      } else if (srcEx && blockType === 'image') {
        const fname = src.dataset.fileName || src.querySelector('.fname')?.textContent;
        const ii = (srcEx.images||[]).findIndex(img=>img.fileName===fname);
        if (ii > -1) { const [img]=srcEx.images.splice(ii,1); (tgtEx.images=tgtEx.images||[]).push(img); }
      } else if (srcEx && blockType === 'image-desc') {
        const fname = src.dataset.fileName;
        const di = (srcEx.descImages||[]).findIndex(img=>img.fileName===fname);
        if (di > -1) { const [img]=srcEx.descImages.splice(di,1); (tgtEx.descImages=tgtEx.descImages||[]).push(img); }
      } else if (srcEx && blockType === 'desc-text') {
        const source = src.dataset.descSource;
        if (source === 'comment') {
          if (srcEx.descFromComment) {
            tgtEx.descFromComment = srcEx.descFromComment;
            srcEx.descFromComment = '';
          }
        } else {
          const fname = src.dataset.fileName;
          const di = (srcEx.descTexts||[]).findIndex(d => d.fileName === fname);
          if (di > -1) {
            const [desc] = srcEx.descTexts.splice(di, 1);
            (tgtEx.descTexts = tgtEx.descTexts || []).push(desc);
          }
        }
      }

      // Place in target: near drop block or before add-row
      if (dropBlock && dropBlock !== src && dropBlock.closest('.ex-body') === targetBody) {
        targetBody.insertBefore(src, dropBlock);
      } else {
        const anchor = targetBody.querySelector('.ex-add-row,.ex-notes-row');
        anchor ? targetBody.insertBefore(src, anchor) : targetBody.appendChild(src);
      }
      src.dataset.ownerExId = targetExId;
      src.dataset.ownerEx = tgtItem.dataset.exName || '';
    }
    src.classList.remove('file-dragging'); src = null; srcBody = null; hoverBlock = null; hoverBody = null;
  }, true);
}

// Legacy shim — populateExerciseBody still calls this; unified system is at list level.
function initFileDragSort(body) {}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9b: STORAGE PANEL
// Floating stash on the right edge. Drop any block in to park it,
// scroll freely, then drag it back out into any exercise body.
// ══════════════════════════════════════════════════════════════════════════

function initStoragePanel() {
  const panel  = document.getElementById('storage-panel');
  const toggle = document.getElementById('storage-toggle-btn');
  const drop   = document.getElementById('storage-drop-zone');
  if (!panel || !drop) return;
  if (panel.dataset.storageInit === '1') return;
  panel.dataset.storageInit = '1';

  if (toggle) toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    const isOpen = panel.classList.contains('open');
    const icon = toggle.querySelector('.tab-icon');
    if (icon) icon.textContent = isOpen ? '▶' : '⬡';
    toggle.title = isOpen ? 'Close block stash' : 'Open block stash';
  });

  const BLOCK_SEL = '.code-with-desc,.output-block,.image-block,.image-description-note,.desc-text-note';

  panel.addEventListener('dragover', e => {
    if (!window.__dragSrc) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    drop.classList.add('storage-drag-over');
  });
  panel.addEventListener('dragleave', e => {
    if (!panel.contains(e.relatedTarget)) drop.classList.remove('storage-drag-over');
  });
  panel.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    drop.classList.remove('storage-drag-over');
    const src = window.__dragSrc;
    if (!src) return;

    const card = document.createElement('div');
    card.className = 'storage-card';
    card.draggable = true;
    card.appendChild(src);
    drop.appendChild(card);

    card.addEventListener('dragstart', ev => {
      window.__dragSrc = src;
      window.__dragSrcStorage = card;
      src.classList.add('file-dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.stopPropagation();
    });
    card.addEventListener('dragend', () => {
      src.classList.remove('file-dragging');
      if (!panel.contains(src)) card.remove();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10: PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════

async function exportPdf() {
  await exportExerciseListPdf({
    listSelector: '#general-ex-list',
    resolveExercise: item => exerciseIndex.get(item.dataset.exId || ''),
    ensureBodyLoaded: (body, ex) => { populateExerciseBody(body, ex); },
    notesSelector: '#general-ex-list .ex-notes-area',
    viewId: 'view-general',
    fileName: (folderName || 'report').toLowerCase().replace(/\s+/g,'-'),
    buttonId: 'export-general-pdf-btn',
    captureConfig: CFG.pdf,
    coverImageDataUrl: includeCoverInPdf ? (coverImageDataUrl || '') : '',
    coverElementId:    (includeCoverInPdf && !coverImageDataUrl) ? 'cover-card-export' : '',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11: NAVIGATION
// ══════════════════════════════════════════════════════════════════════════

function setLoading(pct) {
  const bar=document.getElementById('loading-bar');
  if(bar){bar.style.width=pct+'%';bar.style.opacity=(pct>0&&pct<=100)?'1':'0';}
}
function activate(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}
function toggleSettings(panelId) {
  document.getElementById(panelId)?.classList.toggle('open');
}

function showLanding() {
  activate('view-landing');
  setCoverPanelVisible(false);
  document.getElementById('export-general-pdf-btn')?.style?.setProperty('display','none');
  // Close stash panel when going back to landing
  const panel = document.getElementById('storage-panel');
  if (panel) panel.classList.remove('open');
  document.getElementById('storage-panel')?.classList.remove('open');
  const tabIcon = document.querySelector('#storage-toggle-btn .tab-icon');
  if (tabIcon) tabIcon.textContent = '⬡';
  renderBreadcrumb([{ label:'Home', active:true }]);
}
function showMain() {
  activate('view-general');
  setCoverPanelVisible(true);
  renderBreadcrumb([
    { label:'Home', onClick:'showLanding()', active:false },
    { label: folderName || 'Folder', active:true }
  ]);
  window.scrollTo({ top:0, behavior:'smooth' });
  // Push history so browser back button works
  if (history.state?.view !== 'main') {
    history.pushState({ view:'main' }, '', '');
  }
}

function renderBreadcrumb(items) {
  const c=document.getElementById('breadcrumb'); if(!c)return;
  c.innerHTML=items.map((item,i)=>{
    const lbl=escapeHtml(item.label);
    const crumb=item.active?`<span class="crumb active">${lbl}</span>`:`<span class="crumb" onclick="${item.onClick}">${lbl}</span>`;
    return i===0?crumb:`<span class="sep"> › </span>${crumb}`;
  }).join('');
}
function setCoverPanelVisible(show) {
  document.getElementById('global-cover-panel')?.classList.toggle('show', !!show);
}

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// SECTION 11b: COVER PANEL COLLAPSE
// ══════════════════════════════════════════════════════════════════════════

let coverPanelCollapsed = false;
function toggleCoverPanel() {
  coverPanelCollapsed = !coverPanelCollapsed;
  document.getElementById('cover-panel-body')?.classList.toggle('collapsed', coverPanelCollapsed);
  const chev = document.getElementById('cover-panel-chevron');
  if (chev) chev.classList.toggle('up', coverPanelCollapsed);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12: COVER EDITOR
// ══════════════════════════════════════════════════════════════════════════

function syncCoverPreview() {
  const setText=(id,v,fb='')=>{const n=document.getElementById(id);if(n)n.textContent=String(v||fb);};
  setText('cover-title-text',  coverInfo.title,     'Title');
  setText('cover-subtitle-text',coverInfo.subtitle, 'Subtitle');
  const card=document.getElementById('cover-card-export');
  if(card){card.style.setProperty('--cover-logo-size',`${coverLogoSize}px`);card.style.setProperty('--cover-title-size',`${coverTitleSize}px`);}
  const slot=document.getElementById('cover-logo-slot');
  const ph=document.getElementById('cover-logo-placeholder');
  if(slot){slot.querySelectorAll('img').forEach(n=>n.remove());if(coverLogoDataUrl){const img=document.createElement('img');img.src=coverLogoDataUrl;img.alt='Logo';slot.appendChild(img);if(ph)ph.style.display='none';}else if(ph){ph.style.display='';}}
  // Toggle class so CSS can strip the decorative box when a logo image is present
  if(slot) slot.classList.toggle('has-logo-img', !!coverLogoDataUrl);
  const prev=document.getElementById('cover-sections-preview');
  if(!prev)return;
  prev.innerHTML='';
  const visible=coverSections.filter(r=>String(r.label||'').trim()||String(r.value||'').trim());
  if(!visible.length){const e=document.createElement('div');e.className='cover-foot-row';e.textContent='Add detail rows from the editor.';prev.appendChild(e);return;}
  visible.forEach(r=>{const line=document.createElement('div');line.className='cover-foot-row';const l=String(r.label||'').trim(),v=String(r.value||'').trim();line.textContent=l&&v?`${l}: ${v}`:(l||v);prev.appendChild(line);});
}

function renderCoverEditor() {
  const c=document.getElementById('cover-sections-editor');if(!c)return;c.innerHTML='';
  coverSections.forEach((row,i)=>{
    const wrap=document.createElement('div');wrap.className='cover-field-row';
    const li=document.createElement('input');li.type='text';li.placeholder='Label';li.value=row.label;li.addEventListener('input',()=>{coverSections[i].label=li.value;syncCoverPreview();});
    const vi=document.createElement('input');vi.type='text';vi.placeholder='Value';vi.value=row.value;vi.addEventListener('input',()=>{coverSections[i].value=vi.value;syncCoverPreview();});
    const rb=document.createElement('button');rb.type='button';rb.className='remove-btn';rb.textContent='x';rb.addEventListener('click',()=>{coverSections.splice(i,1);renderCoverEditor();syncCoverPreview();});
    wrap.appendChild(li);wrap.appendChild(vi);wrap.appendChild(rb);c.appendChild(wrap);
  });
  if(!coverSections.length){const n=document.createElement('div');n.style.cssText='font-family:var(--mono);font-size:11px;color:var(--muted)';n.textContent='No rows yet. Click Add Detail Row.';c.appendChild(n);}
}

function addCoverSection() { coverSections.push({label:'Label',value:'Value'}); renderCoverEditor(); syncCoverPreview(); }

async function pickCoverLogo() {
  const input=document.createElement('input');input.type='file';input.accept='image/*';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const url=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result||'');r.onerror=()=>res('');r.readAsDataURL(file);});if(!url)return;coverLogoDataUrl=url;syncCoverPreview();};input.click();
}
function clearCoverLogo() { coverLogoDataUrl=''; syncCoverPreview(); }

async function pickCoverImage() {
  const input=document.createElement('input');input.type='file';input.accept='image/*';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const url=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result||'');r.onerror=()=>res('');r.readAsDataURL(file);});if(!url)return;coverImageDataUrl=url;includeCoverInPdf=true;updateCoverControls();};input.click();
}
function toggleCoverInPdf() { includeCoverInPdf=!includeCoverInPdf; updateCoverControls(); }
function updateCoverControls() {
  const tb=document.getElementById('toggle-cover-pdf-btn');
  const ab=document.getElementById('add-cover-image-btn');
  if(tb){tb.disabled=false;tb.textContent=`Cover: ${includeCoverInPdf?'On':'Off'} (${coverImageDataUrl?'Image':'Default'})`;}
  if(ab)ab.textContent=coverImageDataUrl?'Replace Cover':'Add Cover';
  // Show Export PDF only when there are exercises
  const pdfBtn=document.getElementById('export-pdf-btn');
  if(pdfBtn)pdfBtn.style.display=exercises.length?'':'none';
}

function initCoverEditor() {
  [['cover-title-input','title'],['cover-subtitle-input','subtitle']].forEach(([id,k])=>{
    const el=document.getElementById(id);if(!el)return;el.value=coverInfo[k]||'';el.addEventListener('input',()=>{coverInfo[k]=el.value;syncCoverPreview();});
  });
  const lb=document.getElementById('cover-logo-btn');if(lb)lb.onclick=pickCoverLogo;
  const cb=document.getElementById('cover-logo-clear-btn');if(cb)cb.onclick=clearCoverLogo;
  const ls=document.getElementById('cover-logo-size-input');if(ls){ls.value=String(coverLogoSize);ls.addEventListener('input',()=>{coverLogoSize=Number(ls.value)||72;syncCoverPreview();});}
  const ts=document.getElementById('cover-title-size-input');if(ts){ts.value=String(coverTitleSize);ts.addEventListener('input',()=>{coverTitleSize=Number(ts.value)||28;syncCoverPreview();});}
  const as=document.getElementById('cover-add-section-btn');if(as)as.onclick=addCoverSection;
  renderCoverEditor(); syncCoverPreview();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 13: THEME PICKER
// ══════════════════════════════════════════════════════════════════════════

const THEMES=['theme-blossom','theme-synthwave','theme-coral'];
function applyTheme(name) {
  THEMES.forEach(c=>document.documentElement.classList.remove(c));
  if(THEMES.includes(name))document.documentElement.classList.add(name);
  document.querySelectorAll('.theme-swatch').forEach(sw=>sw.classList.toggle('active',(sw.dataset.theme||'')===(name||'')));
  try{localStorage.setItem('rg-theme',name||'');}catch{}
}
function initThemePicker() {
  document.querySelectorAll('.theme-swatch').forEach(sw=>sw.addEventListener('click',()=>applyTheme(sw.dataset.theme||'')));
  // Try both key names so saved preferences migrate from older builds
  try {
    const s = localStorage.getItem('rg-theme') ?? localStorage.getItem('reportgen-theme');
    if (s !== null) applyTheme(s);
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 14: README
// ══════════════════════════════════════════════════════════════════════════

function renderMarkdownHtml(rawText) {
  const text = String(rawText || '');
  // If marked library loaded, use it; otherwise fallback to escaped plain text
  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      let html = window.marked.parse(text, { breaks: true, gfm: true, mangle: false, headerIds: false });
      // Sanitize with DOMPurify if available
      if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        html = window.DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['style', 'script']
        });
      }
      return html;
    } catch (err) {
      console.error('Markdown rendering error:', err);
      return `<pre>${escapeHtml(text)}</pre>`;
    }
  }
  // Fallback: escape HTML and display as pre-formatted text
  return `<pre>${escapeHtml(text)}</pre>`;
}

async function loadReadmeHowTo(handle) {
  const panel = document.getElementById('landing-howto-panel');
  const div   = document.getElementById('howto-content');
  if (panel) panel.style.display = 'none';
  try {
    const raceText = (p) => Promise.race([p, new Promise(r=>setTimeout(()=>r(''),2000))]);
    let text = '';
    if (handle) {
      for (const name of ['README.md','readme.md','Readme.md']) {
        try { const h=await handle.getFileHandle(name); text=await raceText(readTextFromHandle(h)); break; } catch {}
      }
    } else {
      for (const name of ['README.md','readme.md','Readme.md']) {
        try {
          const t = await raceText(fetch(`./${name}`, { cache:'no-store' }).then(r => r.ok ? r.text() : ''));
          if (t && String(t).trim()) { text = String(t); break; }
        } catch {}
      }
    }
    if (text && text.trim()) {
      if (div) div.innerHTML = renderMarkdownHtml(text);
      if (panel) panel.style.display = '';
    }
  } catch {}
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 15: STATIC UI TEXT + TOPBAR
// ══════════════════════════════════════════════════════════════════════════

function updateStaticUiText() {
  document.title = CFG.ui.pageTitle || 'Report Generator';
  const t = CFG.ui.text;
  const set=(id,v)=>{const n=document.getElementById(id);if(n&&typeof v==='string')n.textContent=v;};
  set('landing-label',    t.landingLabel);
  set('browser-support-note', t.browserSupportNote);
  set('app-footer',       t.footer);
  const lt = document.getElementById('landing-title');
  if (lt && t.landingTitle) lt.innerHTML = t.landingTitle.split(/\r?\n/).map(escapeHtml).join('<br/>');
  set('landing-description', t.landingDescription);
  set('open-project-button-text', t.openProjectButton);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 16: STARTUP
// ══════════════════════════════════════════════════════════════════════════

// Browser back button support
window.addEventListener('popstate', e => {
  if (!e.state || e.state.view === 'landing') {
    showLanding();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.setProperty('--pdf-content-width', `${CFG.pdf.contentWidthPx}px`);
  updateStaticUiText();
  initCoverEditor();
  initThemePicker();
  initGenDropzone();
  initStoragePanel();
  syncModeUi();
  updateCoverControls();
  showLanding();
  loadReadmeHowTo(null);  // try HTTP README, hide if absent
});

Object.assign(window, {
  openFolder, openLabFolder: openFolder, openGeneralFolder: openFolder, rescan, selectMode,
  dismissUtilsNotice,
  toggleCoverPanel, toggleUtilsSection,
  loadUtilsFolder, clearUtilsFolder,
  exportPdf,
  collapseAll, expandAll,
  toggleSettings, applyToggles,
  showLanding, showMain,
  pickCoverImage, toggleCoverInPdf,
  addNewCard, addFilesToNewCard,
});
