/**
 * renderer.js — unified block builder
 *
 * ONE function builds ALL block types: buildBlock(spec)
 * spec drives everything: type, content, which buttons appear, header style.
 *
 * Block types and their spec shapes:
 *   code        { type, file, ex, modeConfig }
 *   output      { type, fileName, section, sectionIdx, sectionTotal, renderContent }
 *   empty-output{ type }
 *   image       { type, fileName, dataUrl }
 *   image-desc  { type, fileName, dataUrl }
 *
 * Convenience wrappers (buildFileBlock, buildOutputBlock, etc.) delegate here
 * for backwards-compatibility with existing call sites.
 */

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

// ── Block type config table ────────────────────────────────────────────────
// Each entry drives the header appearance for one block type.
// Fields:  headerClass, dotClass, label, labelClass, draggable, crossDraggable

const BLOCK_TYPE_CONFIG = {
  'code':         { headerClass:'code-header',  dotClass:'code-dot',   label: null,     labelClass: null,          draggable:true, crossDraggable:true  },
  'output':       { headerClass:'out-header',   dotClass:'out-dot',    label:'OUTPUT',  labelClass:'out-label',    draggable:true, crossDraggable:true  },
  'empty-output': { headerClass:'out-header',   dotClass:'out-dot',    label:'OUTPUT',  labelClass:'out-label',    draggable:true, crossDraggable:true  },
  'image':        { headerClass:'image-header', dotClass:'image-dot',  label:'IMAGE',   labelClass:'image-label',  draggable:true, crossDraggable:true  },
  'image-desc':   { headerClass:'code-header',  dotClass:'image-dot',  label:'DESC',    labelClass:'image-label',  draggable:true, crossDraggable:true  },
  'desc-text':    { headerClass:'code-header',  dotClass:'image-dot',  label:'DESC',    labelClass:'image-label',  draggable:true, crossDraggable:true  },
};

// ── buildBlock — the one function that builds everything ───────────────────

/**
 * Build a draggable exercise block from a spec object.
 *
 * @param {object} spec
 *   Common:  type (string)
 *   code:    file, ex, modeConfig
 *   output:  fileName, section, sectionIdx, sectionTotal, renderContent
 *   image:   fileName, dataUrl
 *   image-desc: fileName, dataUrl
 * @returns HTMLElement
 */
export function buildBlock(spec) {
  const { type } = spec;
  const tc = BLOCK_TYPE_CONFIG[type] || BLOCK_TYPE_CONFIG['code'];

  const el = document.createElement('div');
  el.draggable = tc.draggable;
  el.dataset.blockType = type;
  if (tc.crossDraggable) el.dataset.crossDraggable = '1';

  // ── Per-type setup ─────────────────────────────────────────────────────
  let blockClass, headerClass, contentEl;
  let hasMarkMain = false, hasCopy = false, hasCollapse = false;
  let displayContent = '';

  if (type === 'code') {
    const { file: f, ex, modeConfig } = spec;
    const isProse   = modeConfig.renderAsProse(f);
    displayContent  = f.content || '';

    blockClass  = isProse ? 'prose-block'  : 'code-block';
    headerClass = isProse ? 'prose-header' : 'code-header';
    el.className = 'code-with-desc';
    el.dataset.fileName = f.name;
    el.dataset.mode     = modeConfig.id;
    hasMarkMain = !!ex;
    hasCopy     = true;
    hasCollapse = true;

    // Inner block
    const inner = document.createElement('div');
    inner.className = blockClass;
    inner.dataset.codeInner = '1';

    // Header
    const header = _buildHeader({
      headerClass,
      dotClass:  'code-dot' + (f.main ? ' main-dot' : ''),
      fileName:  f.name,
      tag:       f.main
        ? { cls:'main-tag', attr:'data-maintag', text:'main' }
        : { cls:'ext-tag',  attr:'data-exttag',  text:'.' + (f.ext || '') },
      collapse:  hasCollapse,
      copy:      hasCopy,
      copyGetContent: () => displayContent,
    });

    if (hasMarkMain) _addMarkMainBtn(header, f, el, ex, modeConfig);
    _addRemoveBtn(header, el, () => {
      if (ex && f) {
        const i = ex.files.indexOf(f); if (i > -1) ex.files.splice(i, 1);
      }
    });
    inner.appendChild(header);

    // Content
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
    el.appendChild(inner);

    // Collapse btn wires up to contentEl after both exist
    const collapseBtn = header.querySelector('.block-collapse-btn');
    if (collapseBtn) {
      let collapsed = false;
      collapseBtn.onclick = e => {
        e.stopPropagation();
        collapsed = !collapsed;
        contentEl.style.display = collapsed ? 'none' : '';
        collapseBtn.textContent = collapsed ? '▼' : '▲';
        collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
      };
    }

  } else if (type === 'output') {
    const { fileName: fn, section, sectionIdx, sectionTotal, renderContent } = spec;
    blockClass  = 'output-block';
    headerClass = 'out-header';
    el.className = blockClass;
    el.dataset.fileName = fn;
    el.dataset.sectionIdx = String(sectionIdx || 0);

    const displayName = fn + (sectionTotal > 1 ? ` · ${sectionIdx + 1}` : '');
    const header = _buildHeader({
      headerClass,
      dotClass: 'out-dot',
      fileName: displayName,
      tag: { cls: 'out-label', attr: null, text: 'OUTPUT' },
    });
    _addRemoveBtn(header, el);
    el.appendChild(header);
    contentEl = document.createElement('div');
    contentEl.className = 'output-content';
    renderContent(contentEl, fn, section);
    el.appendChild(contentEl);

  } else if (type === 'empty-output') {
    blockClass  = 'output-block';
    el.className = blockClass;
    const header = _buildHeader({
      headerClass: 'out-header',
      dotClass: 'out-dot',
      fileName: 'output',
      tag: { cls: 'out-label', attr: null, text: 'OUTPUT' },
    });
    _addRemoveBtn(header, el);
    el.appendChild(header);
    const pre = document.createElement('pre');
    pre.className = 'output-text';
    pre.textContent = 'No output file found for this exercise.';
    el.appendChild(pre);

  } else if (type === 'image') {
    const { fileName: fn, dataUrl } = spec;
    blockClass  = 'image-block';
    el.className = blockClass;
    el.dataset.fileName = fn;
    const header = _buildHeader({
      headerClass: 'image-header',
      dotClass: 'image-dot',
      fileName: fn,
      tag: { cls: 'image-label', attr: null, text: 'IMAGE' },
    });
    _addRemoveBtn(header, el);
    el.appendChild(header);
    contentEl = document.createElement('div');
    contentEl.className = 'image-content';
    contentEl.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(fn)}" loading="lazy"/>`;
    el.appendChild(contentEl);

  } else if (type === 'image-desc') {
    const { fileName: fn, dataUrl } = spec;
    el.className = 'exercise-note image-description-note';
    el.dataset.imageDesc = '1';
    el.dataset.fileName  = fn || 'desc.png';
    el.innerHTML =
      '<div class="exercise-note-head">Description ' +
      '<button class="desc-toggle-btn" title="Hide">✕</button></div>' +
      '<div class="exercise-note-image"></div>';
    const img = document.createElement('img');
    img.src = dataUrl; img.alt = 'Exercise description';
    img.style.cssText = 'max-width:100%;height:auto';
    el.querySelector('.exercise-note-image').appendChild(img);
    el.querySelector('.desc-toggle-btn').addEventListener('click', e => {
      e.stopPropagation();
      const hidden = el.dataset.userHidden === '1';
      el.style.display = hidden ? '' : 'none';
      el.dataset.userHidden = hidden ? '0' : '1';
      e.target.textContent = hidden ? '✕' : '↩';
    });
  } else if (type === 'desc-text') {
    const { fileName: fn, text, source = 'file' } = spec;
    el.className = 'exercise-note desc-text-note';
    el.dataset.autoDesc = '1';
    el.dataset.descSource = source;
    el.dataset.fileName = fn || '';
    el.innerHTML =
      '<div class="exercise-note-head">Description ' +
      '<button class="desc-toggle-btn" title="Hide">✕</button></div>' +
      '<pre class="exercise-note-text"></pre>';
    el.querySelector('.exercise-note-text').textContent = (text || '').trim() || '[empty description]';
    el.querySelector('.desc-toggle-btn').addEventListener('click', e => {
      e.stopPropagation();
      const hidden = el.dataset.userHidden === '1';
      el.style.display = hidden ? '' : 'none';
      el.dataset.userHidden = hidden ? '0' : '1';
      e.target.textContent = hidden ? '✕' : '↩';
    });
  }

  return el;
}

// ── Private header builder ─────────────────────────────────────────────────

/**
 * Build a block header row from a config object.
 * config: { headerClass, dotClass, fileName, tag:{cls,attr,text},
 *           collapse:bool, copy:bool, copyGetContent:fn }
 */
function _buildHeader(config) {
  const { headerClass, dotClass, fileName, tag, collapse, copy, copyGetContent } = config;
  const h = document.createElement('div');
  h.className = headerClass;

  const drag = document.createElement('span');
  drag.className = 'file-drag-handle'; drag.title = 'Drag'; drag.textContent = '⠿';
  h.appendChild(drag);

  const dot = document.createElement('div');
  dot.className = dotClass;
  h.appendChild(dot);

  const fname = document.createElement('span');
  fname.className = 'fname'; fname.textContent = fileName;
  h.appendChild(fname);

  if (tag) {
    const t = document.createElement('span');
    t.className = tag.cls;
    if (tag.attr) t.setAttribute(tag.attr, '');
    t.textContent = tag.text;
    h.appendChild(t);
  }

  if (collapse) {
    const btn = document.createElement('button');
    btn.className = 'block-collapse-btn'; btn.title = 'Collapse'; btn.textContent = '▲';
    // onclick wired by caller after contentEl exists
    h.appendChild(btn);
  }

  if (copy && copyGetContent) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn'; btn.textContent = 'copy';
    btn.onclick = e => {
      e.stopPropagation();
      navigator.clipboard.writeText(copyGetContent()).then(() => {
        btn.textContent = 'copied!'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1800);
      }).catch(() => {});
    };
    h.appendChild(btn);
  }

  return h;
}

function _addMarkMainBtn(headerEl, f, wrapEl, ex, modeConfig) {
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

function _addRemoveBtn(headerEl, blockEl, onRemove) {
  const btn = document.createElement('button');
  btn.className = 'remove-block-btn'; btn.title = 'Remove'; btn.textContent = '✕';
  btn.onclick = e => {
    e.stopPropagation();
    onRemove?.();
    blockEl.remove();
  };
  headerEl.appendChild(btn);
}

// ── Public badge helper ────────────────────────────────────────────────────



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

  const displayContent = f.content || '';
  const codeNode = inner?.querySelector('code');
  if (codeNode) {
    codeNode.removeAttribute('data-highlighted');
    codeNode.textContent = displayContent;
    if (window.hljs) window.hljs.highlightElement(codeNode);
  }
  const proseEl = inner?.querySelector('.prose-text');
  if (proseEl) proseEl.textContent = displayContent;

  const note = wrapEl.querySelector('.exercise-note[data-auto-desc]');
  if (note && !(document.getElementById('tog-main-desc')?.checked ?? true)) note.style.display = 'none';
}

// ── Backwards-compatible convenience wrappers ─────────────────────────────
// Call sites in app.js can keep using these — they all delegate to buildBlock.

export function buildFileBlock(f, ex, modeConfig) {
  return buildBlock({ type: 'code', file: f, ex, modeConfig });
}

export function buildOutputBlock(fileName, section, sectionIdx, sectionTotal, renderContent) {
  return buildBlock({ type: 'output', fileName, section, sectionIdx, sectionTotal, renderContent });
}

export function buildEmptyOutputBlock() {
  return buildBlock({ type: 'empty-output' });
}

export function buildImageBlock(fileName, dataUrl) {
  return buildBlock({ type: 'image', fileName, dataUrl });
}

export function buildImageDescNote(dataUrl, fileName) {
  return buildBlock({ type: 'image-desc', fileName, dataUrl });
}

// ── renderBodyContents ────────────────────────────────────────────────────

export function renderBodyContents(body, ex, modeConfig, renderOutputContent) {
  (ex.descTexts || []).forEach(desc =>
    body.appendChild(buildBlock({ type:'desc-text', fileName:desc.fileName, text:desc.text, source:'file' }))
  );
  if (ex.descFromComment) {
    body.appendChild(buildBlock({ type:'desc-text', fileName:'main comment', text:ex.descFromComment, source:'comment' }));
  }
  (ex.descImages || []).forEach(img =>
    body.appendChild(buildBlock({ type:'image-desc', fileName:img.fileName, dataUrl:img.dataUrl }))
  );
  (ex.files || []).forEach(f =>
    body.appendChild(buildBlock({ type:'code', file:f, ex, modeConfig }))
  );
  const outputs = ex.outputSectionsCache || [];
  if (!outputs.length) {
    body.appendChild(buildBlock({ type:'empty-output' }));
  } else {
    outputs.forEach(entry =>
      (entry.sections || []).forEach((sec, i) =>
        body.appendChild(buildBlock({ type:'output', fileName:entry.fileName, section:sec, sectionIdx:i, sectionTotal:entry.sections.length, renderContent:renderOutputContent }))
      )
    );
  }
  (ex.images || []).forEach(img =>
    body.appendChild(buildBlock({ type:'image', fileName:img.fileName, dataUrl:img.dataUrl }))
  );
}
