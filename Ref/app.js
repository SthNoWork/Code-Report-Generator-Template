/**
 * app.js — orchestrator
 *
 * Owns: app state, navigation, UI wiring, cover editor, PDF export.
 * Delegates to: mode-config.js (what), scanner.js (read), renderer.js (draw).
 */

import { CODE_MODE, TEXT_MODE, getModeById, ALL_MODES } from './mode-config.js';
import { scanFolder, scanUtilsFolder, readTextFromHandle, readImageDataUrlFromHandle,
         extractOutputSections, isImageFile, getExt } from './scanner.js';
import { buildFileBlock, buildOutputBlock, buildEmptyOutputBlock,
         buildImageBlock, renderBodyContents, syncFileBlockUI,
         buildAutoDescNote, escapeHtml, updateFileCountBadge } from './renderer.js';

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
let folderHandle   = null;        // last opened FileSystemDirectoryHandle
let folderName     = '';          // display name of opened folder
let activeSubtitle = '';

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
  topLabel: 'Y2-S2-DATA-STRUCTURE',
  title:    'Institute Technology of Cambodia',
  subtitle: 'Lab Report',
};
let coverSections = [
  { label:'Course',     value:'Course' },
  { label:'Author',     value:'Author' },
  { label:'Instructor', value:'Instructor' },
  { label:'Date',       value: new Date().toLocaleDateString() },
];

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: MODE PICKER
// ══════════════════════════════════════════════════════════════════════════

function selectMode(modeId) {
  activeMode = getModeById(modeId);
  ALL_MODES.forEach(m => {
    document.getElementById(`mode-${m.id}-btn`)?.classList.toggle('active', m.id === modeId);
  });
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
  // Only meaningful in code mode
  if (activeMode.id !== 'code') {
    alert('Utils folders are only used in Code Mode (shared .c/.cpp/.py etc. files).');
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
  renderUtilsSection();
  // Remove utils tags and footers from all exercise cards
  document.querySelectorAll('.ex-utils-tag, .ex-utils-footer').forEach(el => el.remove());
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
  setLoading(100); setTimeout(() => setLoading(0), 350);

  // Update mode badge
  const badge = document.getElementById('mode-badge');
  if (badge) {
    badge.textContent = `${activeMode.icon} ${activeMode.label}`;
    badge.className   = `mode-badge mode-badge--${activeMode.id}`;
  }

  coverInfo.title = folderName || 'Report';
  const inp = document.getElementById('cover-title-input');
  if (inp) inp.value = coverInfo.title;
  syncCoverPreview();

  loadReadmeHowTo(handle);
  renderExercises();
  renderUtilsSection();
  showMain();
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: RENDER EXERCISES
// ══════════════════════════════════════════════════════════════════════════

function renderUtilsSection() {
  const container = document.getElementById('utils-section');
  const banner    = document.getElementById('utils-banner');
  if (!container || !banner) return;

  // Clean up any existing inline utils tags/footers first
  document.querySelectorAll('.ex-utils-tag, .ex-utils-footer').forEach(el => el.remove());

  if (!utilsFiles.length) {
    container.style.display = 'none';
    banner.style.display    = 'none';
    return;
  }

  // Update banner folder name
  const bannerName = document.getElementById('utils-banner-name');
  if (bannerName) bannerName.textContent = utilsFolderName;

  // Show/hide based on toggle
  const visible = showUtils && document.getElementById('tog-main-utils')?.checked !== false;
  banner.style.display    = visible ? '' : 'none';
  container.style.display = (visible && !utilsSectionCollapsed) ? '' : 'none';
  if (!visible) return;

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

  // Inject utils warning into each exercise card header + footer
  injectUtilsTagsIntoCards();
}

/**
 * For each exercise card, add:
 *  - A small "📦 utils" pill in the header (visible when collapsed)
 *  - A footer inside the body listing the utils files available
 */
function injectUtilsTagsIntoCards() {
  if (!utilsFiles.length) return;

  const fileNames = utilsFiles.map(f => f.name);

  document.querySelectorAll('#general-ex-list .ex-item').forEach(item => {
    // Header pill — only if not already there
    if (!item.querySelector('.ex-utils-tag')) {
      const tag = document.createElement('span');
      tag.className = 'ex-utils-tag';
      tag.title = `Uses shared utils: ${fileNames.join(', ')}`;
      tag.textContent = '📦 utils';
      // Insert before the chevron
      const chev = item.querySelector('.ex-chevron');
      if (chev) chev.before(tag);
    }

    // Footer inside body — inject if body is already loaded
    const body = item.querySelector('.ex-body');
    if (body && body.dataset.loaded === '1' && !body.querySelector('.ex-utils-footer')) {
      body.appendChild(buildUtilsFooter(fileNames));
    }
  });
}

function buildUtilsFooter(fileNames) {
  const footer = document.createElement('div');
  footer.className = 'ex-utils-footer';
  const chips = fileNames.map(n => `<span class="utils-file-chip">${escapeHtml(n)}</span>`).join('');
  footer.innerHTML = `<strong>📦 Shared utils available</strong>${chips}`;
  return footer;
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
    const item = buildExerciseItem(ex, idx);
    item.querySelector('.ex-header').onclick = e => {
      if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
      item.classList.toggle('open');
      if (item.classList.contains('open')) populateExerciseBody(item.querySelector('.ex-body'), ex);
    };
    list.appendChild(item);
  });
  initDragSort(list);
}

function buildExerciseItem(ex, idx) {
  const num  = (ex.name.replace(/\D/g,'') || String(idx + 1));
  const meta = `${ex.files.length} file${ex.files.length !== 1 ? 's' : ''}`;
  const item = document.createElement('div');
  item.className = 'ex-item'; item.draggable = true; item.dataset.exName = ex.name;
  item.innerHTML = `
    <div class="ex-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <div class="ex-num">${escapeHtml(num)}</div>
      <input class="ex-title-input" type="text" value="${escapeHtml(ex.name)}" title="Click to rename"/>
      <span class="ex-meta">${escapeHtml(meta)}</span>
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
      item.remove();
    }
  });
  return item;
}

function populateExerciseBody(body, ex) {
  if (body.dataset.loaded === '1') return;
  body.dataset.loaded = '1';

  const mc = getModeById(ex._mode || activeMode.id);

  renderBodyContents(body, ex, mc, renderOutputContent);

  // Notes textarea
  const notesRow = document.createElement('div');
  notesRow.className = 'ex-notes-row';
  const ta = document.createElement('textarea');
  ta.className = 'ex-notes-area';
  ta.placeholder = 'Notes for this exercise (shown in PDF if filled)…';
  ta.value = ex._notes || '';
  ta.addEventListener('input', () => { ex._notes = ta.value; });
  notesRow.appendChild(ta); body.appendChild(notesRow);

  // Utils footer — if utils are loaded, add a "from utils" summary at bottom
  if (utilsFiles.length) {
    const existingFooter = body.querySelector('.ex-utils-footer');
    if (!existingFooter) {
      body.appendChild(buildUtilsFooter(utilsFiles.map(f => f.name)));
    }
  }

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
  body.appendChild(addRow);

  initFileDragSort(body);
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
  const showEmpty = document.getElementById(p+'-empty-output')?.checked ?? true;
  const showDesc  = document.getElementById(p+'-desc')?.checked ?? true;
  const showNotes = document.getElementById(p+'-notes')?.checked ?? true;

  list.querySelectorAll('.output-block').forEach(ob => {
    const isEmpty = ob.querySelector('.output-text')?.textContent.startsWith('No output') ?? false;
    ob.style.display = (isEmpty ? showEmpty : showOut) ? '' : 'none';
  });
  list.querySelectorAll('.image-block').forEach(ib => { ib.style.display = showImg ? '' : 'none'; });
  list.querySelectorAll('.exercise-note[data-auto-desc]').forEach(en => {
    en.style.display = (!showDesc || en.dataset.userHidden === '1') ? 'none' : '';
  });
  list.querySelectorAll('.ex-notes-row').forEach(nr => { nr.style.display = showNotes ? '' : 'none'; });

  // Utils section
  const showU = document.getElementById('tog-main-utils')?.checked ?? true;
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
      ex.images = ex.images || [];
      ex.images.push({ fileName:file.name, dataUrl });
      body.insertBefore(buildImageBlock(file.name, dataUrl), addRow);
    }
    initFileDragSort(body);
  };
  input.click();
}

function addNewCard() {
  const mc  = activeMode;
  const ex  = { name:'New Card', files:[], images:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
  exercises.push(ex);
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
    const ex = { name:'Files', files:[], images:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
    exercises.push(ex);
    for (const file of Array.from(input.files)) {
      if (isImageFile(file.name)) {
        const dataUrl = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res('');
          r.readAsDataURL(file);
        });
        if (dataUrl) ex.images.push({ fileName:file.name, dataUrl });
      } else {
        let content; try { content = await file.text(); } catch { content = '[binary]'; }
        const ext = getExt(file.name);
        ex.files.push({ name:file.name, ext, main:false, content, proseMode:mc.renderAsProse({ext}) });
      }
    }
    if (ex.files.length === 1) ex.name = ex.files[0].name;
    else if (!ex.files.length && ex.images.length === 1) ex.name = ex.images[0].fileName;
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
    const ex = { name:'Dropped Files', files:[], images:[], outputSectionsCache:[], _notes:'', _mode: mc.id };
    exercises.push(ex);
    for (const file of files) {
      if (isImageFile(file.name)) {
        const dataUrl = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res('');
          r.readAsDataURL(file);
        });
        if (dataUrl) ex.images.push({ fileName:file.name, dataUrl });
      } else {
        let content; try { content = await file.text(); } catch { content = '[binary]'; }
        const ext = getExt(file.name);
        ex.files.push({ name:file.name, ext, main:false, content, proseMode:mc.renderAsProse({ext}) });
      }
    }
    if (ex.files.length === 1) ex.name = ex.files[0].name;
    else if (!ex.files.length && ex.images.length === 1) ex.name = ex.images[0].fileName;
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
  if (getExt(fileName) === 'csv') {
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
    const ex=exercises.find(e=>e.name===item.dataset.exName);
    if(ex) populateExerciseBody(body,ex);
  });
}

function initDragSort(list) {
  let src=null;
  list.addEventListener('dragstart',e=>{const item=e.target.closest('.ex-item');if(!item)return;src=item;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  list.addEventListener('dragend',()=>{list.querySelectorAll('.dragging,.drag-over').forEach(i=>{i.classList.remove('dragging','drag-over');});src=null;});
  list.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';const t=e.target.closest('.ex-item');if(!t||t===src)return;list.querySelectorAll('.drag-over').forEach(i=>i.classList.remove('drag-over'));t.classList.add('drag-over');});
  list.addEventListener('dragleave',e=>{const t=e.target.closest('.ex-item');if(t)t.classList.remove('drag-over');});
  list.addEventListener('drop',e=>{e.preventDefault();const t=e.target.closest('.ex-item');if(!t||t===src||!src)return;t.classList.remove('drag-over');const items=Array.from(list.querySelectorAll('.ex-item'));const si=items.indexOf(src),ti=items.indexOf(t);list.insertBefore(src,si<ti?t.nextSibling:t);Array.from(list.querySelectorAll('.ex-item')).forEach((el,i)=>{const b=el.querySelector('.ex-num');if(b)b.textContent=String(i+1);});src=null;});
}

function initFileDragSort(body) {
  let src=null;
  const DS='.code-with-desc[draggable],.output-block[draggable],.image-block[draggable]';
  const HS='.code-with-desc,.output-block,.image-block';
  body.addEventListener('dragstart',e=>{const b=e.target.closest(DS);if(!b)return;src=b;b.classList.add('file-dragging');e.dataTransfer.effectAllowed='move';e.stopPropagation();},true);
  body.addEventListener('dragend',()=>{body.querySelectorAll('.file-dragging,.file-drag-over').forEach(b=>b.classList.remove('file-dragging','file-drag-over'));src=null;},true);
  body.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();const b=e.target.closest(HS);if(!b||b===src)return;body.querySelectorAll('.file-drag-over').forEach(x=>x.classList.remove('file-drag-over'));b.classList.add('file-drag-over');},true);
  body.addEventListener('dragleave',e=>{const b=e.target.closest(HS);if(b)b.classList.remove('file-drag-over');e.stopPropagation();},true);
  body.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();const t=e.target.closest(HS);if(!t||t===src||!src)return;t.classList.remove('file-drag-over');const bl=Array.from(body.querySelectorAll(HS));const si=bl.indexOf(src),ti=bl.indexOf(t);body.insertBefore(src,si<ti?t.nextSibling:t);src=null;},true);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10: PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════

async function exportPdf() {
  await exportExerciseListPdf({
    listSelector: '#general-ex-list',
    resolveExercise: item => exercises.find(e => e.name === item.dataset.exName),
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
  setText('cover-top-text',    coverInfo.topLabel,  'Report');
  setText('cover-title-text',  coverInfo.title,     'Title');
  setText('cover-subtitle-text',coverInfo.subtitle, 'Subtitle');
  const card=document.getElementById('cover-card-export');
  if(card){card.style.setProperty('--cover-logo-size',`${coverLogoSize}px`);card.style.setProperty('--cover-title-size',`${coverTitleSize}px`);}
  const slot=document.getElementById('cover-logo-slot');
  const ph=document.getElementById('cover-logo-placeholder');
  if(slot){slot.querySelectorAll('img').forEach(n=>n.remove());if(coverLogoDataUrl){const img=document.createElement('img');img.src=coverLogoDataUrl;img.alt='Logo';slot.appendChild(img);if(ph)ph.style.display='none';}else if(ph){ph.style.display='';}}
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
  [['cover-top-input','topLabel'],['cover-title-input','title'],['cover-subtitle-input','subtitle']].forEach(([id,k])=>{
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
  try{const s=localStorage.getItem('rg-theme');if(s!==null)applyTheme(s);}catch{}
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 14: README
// ══════════════════════════════════════════════════════════════════════════

async function loadReadmeHowTo(handle) {
  const panel = document.getElementById('landing-howto-panel');
  const pre   = document.getElementById('howto-content');
  if (panel) panel.style.display = 'none';
  if (!handle) return;
  try {
    const raceText = (p) => Promise.race([p, new Promise(r=>setTimeout(()=>r(''),2000))]);
    let text = '';
    for (const name of ['README.md','readme.md','Readme.md']) {
      try { const h=await handle.getFileHandle(name); text=await raceText(readTextFromHandle(h)); break; } catch {}
    }
    if (text && text.trim()) {
      if (pre) pre.textContent = text;
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
  updateCoverControls();
  showLanding();
  loadReadmeHowTo(null);  // try HTTP README, hide if absent
});

Object.assign(window, {
  openFolder, openLabFolder: openFolder, openGeneralFolder: openFolder, rescan, selectMode,
  toggleCoverPanel, toggleUtilsSection,
  loadUtilsFolder, clearUtilsFolder,
  exportPdf,
  collapseAll, expandAll,
  toggleSettings, applyToggles,
  showLanding, showMain,
  pickCoverImage, toggleCoverInPdf,
  addNewCard, addFilesToNewCard,
});
