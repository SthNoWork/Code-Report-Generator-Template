/**
 * renderer.js
 *
 * All DOM-building functions.  Every function that depends on mode behaviour
 * accepts a ModeConfig.  No global appMode checks anywhere.
 */

import { extractDescription, stripLeadingComment } from './scanner.js';

// ── Helpers ────────────────────────────────────────────────────────────────

export function escapeHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function languageClass(ext) {
  const MAP = {
    cpp:'language-cpp',cc:'language-cpp',cxx:'language-cpp',c:'language-c',
    h:'language-cpp',hpp:'language-cpp',java:'language-java',kt:'language-kotlin',
    scala:'language-scala',cs:'language-csharp',py:'language-python',rb:'language-ruby',
    php:'language-php',sh:'language-bash',bash:'language-bash',ps1:'language-powershell',
    js:'language-javascript',jsx:'language-javascript',mjs:'language-javascript',
    ts:'language-typescript',tsx:'language-typescript',
    json:'language-json',html:'language-xml',htm:'language-xml',
    css:'language-css',scss:'language-scss',go:'language-go',rs:'language-rust',
    swift:'language-swift',sql:'language-sql',r:'language-r',lua:'language-lua',
    yaml:'language-yaml',yml:'language-yaml',toml:'language-ini',ini:'language-ini',
    xml:'language-xml',md:'language-markdown',txt:'language-plaintext',
  };
  return MAP[(ext || '').toLowerCase()] || 'language-plaintext';
}

// ── Auto-description note ──────────────────────────────────────────────────

export function buildAutoDescNote(desc) {
  const note = document.createElement('div');
  note.className = 'exercise-note';
  note.dataset.autoDesc = '1';
  note.innerHTML =
    '<div class="exercise-note-head">Description ' +
    '<button class="desc-toggle-btn" title="Hide">✕</button></div>' +
    '<pre class="exercise-note-text"></pre>';
  note.querySelector('.exercise-note-text').textContent = desc;
  note.querySelector('.desc-toggle-btn').addEventListener('click', e => {
    e.stopPropagation();
    const hidden = note.dataset.userHidden === '1';
    note.style.display = hidden ? '' : 'none';
    note.dataset.userHidden = hidden ? '0' : '1';
    e.target.textContent = hidden ? '✕' : '↩';
  });
  return note;
}

function refreshDescNote(wrapEl, f, modeConfig) {
  const existing = wrapEl.querySelector('.exercise-note[data-auto-desc]');
  const desc = (f.main && modeConfig.descExtractionEnabled) ? extractDescription(f.content) : '';
  if (desc) {
    if (existing) {
      existing.querySelector('.exercise-note-text').textContent = desc;
      if (existing.dataset.userHidden !== '1') existing.style.display = '';
    } else {
      wrapEl.insertBefore(buildAutoDescNote(desc), wrapEl.firstChild);
    }
  } else if (existing) {
    existing.remove();
  }
}

// ── Copy button ────────────────────────────────────────────────────────────

function addCopyBtn(headerEl, getContent) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'copy';
  btn.onclick = e => {
    e.stopPropagation();
    navigator.clipboard.writeText(getContent()).then(() => {
      btn.textContent = 'copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1800);
    }).catch(() => {});
  };
  headerEl.appendChild(btn);
}

// ── Mark-as-main button ────────────────────────────────────────────────────

function addMarkMainBtn(headerEl, f, wrapEl, ex, modeConfig) {
  const btn = document.createElement('button');
  btn.className   = 'mark-main-btn' + (f.main ? ' is-main' : '');
  btn.title       = f.main ? 'Unmark as main' : 'Mark as main';
  btn.textContent = f.main ? '★ main' : '☆ main';
  btn.onclick = e => {
    e.stopPropagation();
    f.main = !f.main;
    syncFileBlockUI(wrapEl, f, f.main, modeConfig);
  };
  headerEl.appendChild(btn);
}

// ── Remove button ──────────────────────────────────────────────────────────

function addRemoveBtn(headerEl, blockEl, f, ex) {
  const btn = document.createElement('button');
  btn.className = 'remove-block-btn';
  btn.title = 'Remove';
  btn.textContent = '✕';
  btn.onclick = e => {
    e.stopPropagation();
    if (ex && f) {
      const i = ex.files.indexOf(f);
      if (i > -1) ex.files.splice(i, 1);
      updateFileCountBadge(blockEl, ex);
    }
    blockEl.remove();
  };
  headerEl.appendChild(btn);
}

function addCollapseBtn(headerEl, getContentEl) {
  const btn = document.createElement('button');
  btn.className = 'block-collapse-btn';
  btn.title = 'Collapse';
  btn.textContent = '▲';
  let collapsed = false;
  btn.onclick = e => {
    e.stopPropagation();
    collapsed = !collapsed;
    const el = getContentEl();
    if (el) el.style.display = collapsed ? 'none' : '';
    btn.textContent = collapsed ? '▼' : '▲';
    btn.title = collapsed ? 'Expand' : 'Collapse';
  };
  headerEl.appendChild(btn);
}

export function updateFileCountBadge(el, ex) {
  const item = el.closest('.ex-item');
  const meta = item?.querySelector('.ex-meta');
  if (meta) meta.textContent = `${ex.files.length} file${ex.files.length !== 1 ? 's' : ''}`;
}

// ── syncFileBlockUI — called when ★ main is toggled ───────────────────────

export function syncFileBlockUI(wrapEl, f, isMain, modeConfig) {
  f.main = isMain;
  const inner   = wrapEl.querySelector('.code-block, .prose-block');
  const dot     = inner?.querySelector('.code-dot');
  const btn     = inner?.querySelector('.mark-main-btn');
  const mainTag = inner?.querySelector('[data-maintag]');
  const extTag  = inner?.querySelector('[data-exttag]');

  if (dot) dot.className = 'code-dot' + (isMain ? ' main-dot' : '');
  if (btn) {
    btn.textContent = isMain ? '★ main' : '☆ main';
    btn.className   = 'mark-main-btn' + (isMain ? ' is-main' : '');
    btn.title       = isMain ? 'Unmark as main' : 'Mark as main';
  }
  if (isMain && !mainTag && extTag) {
    extTag.removeAttribute('data-exttag'); extTag.className = 'main-tag';
    extTag.setAttribute('data-maintag', ''); extTag.textContent = 'main';
  } else if (!isMain && !extTag && mainTag) {
    mainTag.removeAttribute('data-maintag'); mainTag.className = 'ext-tag';
    mainTag.setAttribute('data-exttag', ''); mainTag.textContent = '.' + f.ext;
  }

  const displayContent = isMain ? stripLeadingComment(f.content) : (f.content || '');
  const codeNode = inner?.querySelector('code');
  if (codeNode) {
    codeNode.removeAttribute('data-highlighted');
    codeNode.textContent = displayContent;
    if (window.hljs) window.hljs.highlightElement(codeNode);
  }
  const proseEl = inner?.querySelector('.prose-text');
  if (proseEl) proseEl.textContent = displayContent;

  refreshDescNote(wrapEl, f, modeConfig);

  // Honour global desc toggle
  const togId  = 'tog-main-desc';
  const showDesc = document.getElementById(togId)?.checked ?? true;
  const note = wrapEl.querySelector('.exercise-note[data-auto-desc]');
  if (note && !showDesc) note.style.display = 'none';
}

// ── buildFileBlock — the core block builder ───────────────────────────────

/**
 * Build one draggable file block (code or prose) based on modeConfig.
 * Returns a .code-with-desc wrapper containing [desc note?] + inner block.
 *
 * @param {FileObject} f          { name, ext, main, content, proseMode }
 * @param {ExCard|null} ex        parent exercise (null for utils section)
 * @param {ModeConfig}  modeConfig
 */
export function buildFileBlock(f, ex, modeConfig) {
  const wrap = document.createElement('div');
  wrap.className         = 'code-with-desc';
  wrap.draggable         = true;
  wrap.dataset.blockType = 'code';
  wrap.dataset.fileName  = f.name;
  wrap.dataset.mode      = modeConfig.id;

  const isProse        = modeConfig.renderAsProse(f);
  const isTxtFile      = (f.ext || '').toLowerCase() === 'txt';
  const txtAsDesc      = !!modeConfig.txtAsDescription && isTxtFile;
  const txtDescVisible = document.getElementById('tog-main-txt-desc')?.checked ?? true;
  const displayContent = f.main ? stripLeadingComment(f.content || '') : (f.content || '');

  // In text mode, txt-as-description replaces auto-desc to avoid duplicate notes.
  if (!txtAsDesc) {
    refreshDescNote(wrap, f, modeConfig);
  }

  if (txtAsDesc) {
    const txtNote = document.createElement('div');
    txtNote.className = 'exercise-note txt-description-note';
    txtNote.innerHTML =
      '<div class="exercise-note-head">Description</div>' +
      '<pre class="exercise-note-text"></pre>';
    txtNote.querySelector('.exercise-note-text').textContent = (f.content || '').trim() || '[empty .txt file]';
    txtNote.style.display = txtDescVisible ? '' : 'none';
    wrap.appendChild(txtNote);
  }

  const inner = document.createElement('div');
  inner.className      = isProse ? 'prose-block' : 'code-block';
  inner.dataset.codeInner = '1';

  // ── Header ──────────────────────────────────────────────────────────────
  const headerEl = document.createElement('div');
  headerEl.className = isProse ? 'prose-header' : 'code-header';

  const dragSpan = document.createElement('span');
  dragSpan.className = 'file-drag-handle'; dragSpan.title = 'Drag'; dragSpan.textContent = '⠿';
  headerEl.appendChild(dragSpan);

  const dot = document.createElement('div');
  dot.className = 'code-dot' + (f.main ? ' main-dot' : '');
  headerEl.appendChild(dot);

  const fname = document.createElement('span');
  fname.className = 'fname'; fname.textContent = f.name;
  headerEl.appendChild(fname);

  const tag = document.createElement('span');
  if (f.main) { tag.className = 'main-tag'; tag.setAttribute('data-maintag',''); tag.textContent = 'main'; }
  else        { tag.className = 'ext-tag';  tag.setAttribute('data-exttag','');  tag.textContent = '.' + (f.ext || ''); }
  headerEl.appendChild(tag);

  // Content reference (set below)
  let contentEl;

  addCollapseBtn(headerEl, () => contentEl);
  addCopyBtn(headerEl, () => displayContent);
  if (ex) addMarkMainBtn(headerEl, f, wrap, ex, modeConfig);
  addRemoveBtn(headerEl, wrap, f, ex);

  inner.appendChild(headerEl);

  // ── Content ──────────────────────────────────────────────────────────────
  if (isProse) {
    contentEl = document.createElement('div');
    contentEl.className = 'prose-content';
    const pre = document.createElement('pre');
    pre.className = 'prose-text'; pre.textContent = displayContent;
    contentEl.appendChild(pre);
  } else {
    contentEl = document.createElement('pre');
    const codeNode = document.createElement('code');
    codeNode.className = languageClass(f.ext);
    codeNode.textContent = displayContent;
    contentEl.appendChild(codeNode);
    if (window.hljs) window.hljs.highlightElement(codeNode);
  }
  inner.appendChild(contentEl);
  wrap.appendChild(inner);

  if (txtAsDesc) {
    wrap.classList.add('txt-raw-block');
    inner.style.display = txtDescVisible ? 'none' : '';
  }

  return wrap;
}

// ── Output / Image blocks (no mode dependency) ────────────────────────────

export function buildOutputBlock(fileName, section, idx, total, renderContent) {
  const ob = document.createElement('div');
  ob.className = 'output-block'; ob.draggable = true; ob.dataset.blockType = 'output';
  ob.innerHTML =
    `<div class="out-header">
       <span class="file-drag-handle" title="Drag">⠿</span>
       <div class="out-dot"></div>
       <span class="fname">${escapeHtml(fileName)}${total > 1 ? ` · ${idx + 1}` : ''}</span>
       <span class="out-label">OUTPUT</span>
     </div><div class="output-content"></div>`;
  renderContent(ob.querySelector('.output-content'), fileName, section);
  addOutputRemoveBtn(ob.querySelector('.out-header'), ob);
  return ob;
}

export function buildEmptyOutputBlock() {
  const ob = document.createElement('div');
  ob.className = 'output-block'; ob.draggable = true; ob.dataset.blockType = 'output';
  ob.innerHTML =
    `<div class="out-header">
       <span class="file-drag-handle" title="Drag">⠿</span>
       <div class="out-dot"></div>
       <span class="fname">output</span>
       <span class="out-label">OUTPUT</span>
     </div>
     <pre class="output-text">No output file found for this exercise.</pre>`;
  addOutputRemoveBtn(ob.querySelector('.out-header'), ob);
  return ob;
}

export function buildImageBlock(fileName, dataUrl) {
  const ib = document.createElement('div');
  ib.className = 'image-block'; ib.draggable = true; ib.dataset.blockType = 'image';
  ib.innerHTML =
    `<div class="image-header">
       <span class="file-drag-handle" title="Drag">⠿</span>
       <div class="image-dot"></div>
       <span class="fname">${escapeHtml(fileName)}</span>
       <span class="image-label">IMAGE</span>
     </div>
     <div class="image-content"><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(fileName)}" loading="lazy"/></div>`;
  addOutputRemoveBtn(ib.querySelector('.image-header'), ib);
  return ib;
}

function addOutputRemoveBtn(headerEl, blockEl) {
  if (!headerEl) return;
  const btn = document.createElement('button');
  btn.className = 'remove-block-btn'; btn.title = 'Remove'; btn.textContent = '✕';
  btn.onclick = e => { e.stopPropagation(); blockEl.remove(); };
  headerEl.appendChild(btn);
}

// ── renderBodyContents ────────────────────────────────────────────────────

/**
 * Populate an exercise body element with all its blocks.
 *
 * @param {HTMLElement}  body
 * @param {ExCard}       ex
 * @param {ModeConfig}   modeConfig
 * @param {Function}     renderOutputContent   (container, fileName, section) => void
 */
export function renderBodyContents(body, ex, modeConfig, renderOutputContent) {
  // File blocks
  (ex.files || []).forEach(f => body.appendChild(buildFileBlock(f, ex, modeConfig)));

  // Output blocks
  const outputs = ex.outputSectionsCache || [];
  if (!outputs.length) {
    body.appendChild(buildEmptyOutputBlock());
  } else {
    outputs.forEach(entry => {
      (entry.sections || []).forEach((sec, i) =>
        body.appendChild(buildOutputBlock(entry.fileName, sec, i, entry.sections.length, renderOutputContent))
      );
    });
  }

  // Image blocks
  (ex.images || []).forEach(img => body.appendChild(buildImageBlock(img.fileName, img.dataUrl)));
}
