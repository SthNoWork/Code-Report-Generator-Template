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

import { getAppConfig } from './app-config-resolver.js';
import { buildUnifiedBlocks, applyBlockStatePatch } from './block-builder.js';
import { getAttachmentSupports } from './scan_file-classifier.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const APP_CFG = getAppConfig();
const APP_LABELS = APP_CFG.labels;
const APP_TEXT = APP_CFG.ui.text;
const APP_RUNTIME = APP_CFG.runtime;

const RENDERER_LABELS = {
  output: APP_LABELS.outputLabel || 'OUTPUT',
  image: APP_LABELS.imageLabel || 'IMAGE',
  pdf: APP_LABELS.pdfLabel || 'PDF',
  description: APP_LABELS.descriptionLabel || 'Description'
};

const COPY_FEEDBACK_MS = Number(APP_RUNTIME.copyFeedbackMs) || 1800;
const NO_OUTPUT_MESSAGE = APP_TEXT.noOutputMessage || 'No output file found for this exercise.';
const ATTACHMENT_SUPPORTS = getAttachmentSupports();
const ATTACHMENT_TYPE_INDEX = new Map();
ATTACHMENT_SUPPORTS.forEach(support => {
  ATTACHMENT_TYPE_INDEX.set(support.buildType, { support, isDescription: false });
  ATTACHMENT_TYPE_INDEX.set(support.descBuildType, { support, isDescription: true });
});

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
  'desc-text':    { headerClass:'code-header',  dotClass:'image-dot',  label:'DESC',    labelClass:'image-label',  draggable:true, crossDraggable:true  },
};
ATTACHMENT_SUPPORTS.forEach(support => {
  BLOCK_TYPE_CONFIG[support.buildType] = {
    headerClass:'image-header', dotClass:'image-dot', label:'', labelClass:'image-label', draggable:true, crossDraggable:true
  };
  BLOCK_TYPE_CONFIG[support.descBuildType] = {
    headerClass:'code-header', dotClass:'image-dot', label:'DESC', labelClass:'image-label', draggable:true, crossDraggable:true
  };
});

function buildPdfPreviewMarkup(dataUrl) {
  const safeUrl = escapeHtml(dataUrl || '');
  return `<div class="pdf-render-surface" data-pdf-src="${safeUrl}"></div>`;
}

function dataUrlToUint8Array(dataUrl) {
  const encoded = String(dataUrl || '').split(',')[1] || '';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let pdfJsConfigured = false;
const pdfRenderJobs = new WeakMap();

function ensurePdfJsConfigured() {
  if (pdfJsConfigured || !window.pdfjsLib) return;
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  } catch {
    // Keep graceful fallback if worker setup fails.
  }
  pdfJsConfigured = true;
}

async function renderPdfSurface(surface) {
  if (!surface) return;
  if (surface.dataset.rendered === '1') return;
  if (pdfRenderJobs.has(surface)) {
    await pdfRenderJobs.get(surface);
    return;
  }

  const src = surface.dataset.pdfSrc || '';
  if (!src) return;

  const job = (async () => {
  if (!window.pdfjsLib) {
    surface.innerHTML = '<div class="pdf-preview-fallback">PDF preview unavailable in this browser.</div>';
    surface.dataset.rendered = '0';
    return;
  }

  ensurePdfJsConfigured();
  surface.innerHTML = '';
  surface.dataset.rendering = '1';

  try {
    const bytes = dataUrlToUint8Array(src);
    const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
    const pdfDoc = await loadingTask.promise;

    const targetWidth = Math.max(320, surface.clientWidth || surface.parentElement?.clientWidth || 860);

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / Math.max(baseViewport.width, 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute('draggable', 'false');

      const ctx = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: ctx, viewport }).promise;
      surface.appendChild(canvas);
    }
    surface.dataset.rendered = '1';
  } catch {
    surface.innerHTML = '<div class="pdf-preview-fallback">Unable to render PDF preview.</div>';
    surface.dataset.rendered = '0';
  } finally {
    delete surface.dataset.rendering;
  }
  })();

  pdfRenderJobs.set(surface, job);
  try {
    await job;
  } finally {
    pdfRenderJobs.delete(surface);
  }
}

export async function renderPdfPreviewSurfaces(root = document) {
  const surfaces = Array.from(root.querySelectorAll('.pdf-render-surface[data-pdf-src]'));
  if (!surfaces.length) return;
  await Promise.all(surfaces.map(renderPdfSurface));
}

function getAttachmentLabel(supportId) {
  if (supportId === 'image') return RENDERER_LABELS.image;
  if (supportId === 'pdf') return RENDERER_LABELS.pdf;
  return String(supportId || 'FILE').toUpperCase();
}

function renderAttachmentContentMarkup(supportId, dataUrl, fileName, isDescription) {
  const safeUrl = escapeHtml(dataUrl || '');
  const safeName = escapeHtml(fileName || 'file');

  if (supportId === 'image') {
    return `<img src="${safeUrl}" alt="${safeName}" loading="lazy" draggable="false"/>`;
  }

  if (supportId === 'pdf') {
    return buildPdfPreviewMarkup(dataUrl);
  }

  return `<a class="pdf-open-link" href="${safeUrl}" target="_blank" rel="noopener">Open ${escapeHtml(getAttachmentLabel(supportId))}</a>`;
}

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
      tag: { cls: 'out-label', attr: null, text: RENDERER_LABELS.output },
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
      tag: { cls: 'out-label', attr: null, text: RENDERER_LABELS.output },
    });
    _addRemoveBtn(header, el);
    el.appendChild(header);
    const pre = document.createElement('pre');
    pre.className = 'output-text';
    pre.textContent = NO_OUTPUT_MESSAGE;
    el.appendChild(pre);

  } else if (ATTACHMENT_TYPE_INDEX.has(type)) {
    const { support, isDescription } = ATTACHMENT_TYPE_INDEX.get(type);
    const { fileName: fn, dataUrl } = spec;
    el.dataset.fileName = fn || '';

    if (isDescription) {
      el.className = 'exercise-note image-description-note';
      el.dataset.attachmentDesc = support.id;
      el.innerHTML =
        `<div class="exercise-note-head">${RENDERER_LABELS.description} ` +
        '<button class="desc-toggle-btn" title="Hide">✕</button></div>' +
        '<div class="exercise-note-attachment"></div>';
      el.querySelector('.exercise-note-attachment').innerHTML = renderAttachmentContentMarkup(support.id, dataUrl, fn, true);
      el.querySelector('.desc-toggle-btn').addEventListener('click', e => {
        e.stopPropagation();
        const hidden = el.dataset.userHidden === '1';
        el.style.display = hidden ? '' : 'none';
        el.dataset.userHidden = hidden ? '0' : '1';
        e.target.textContent = hidden ? '✕' : '↩';
      });
    } else {
      blockClass  = 'image-block';
      el.className = blockClass;
      const header = _buildHeader({
        headerClass: 'image-header',
        dotClass: 'image-dot',
        fileName: fn,
        tag: { cls: 'image-label', attr: null, text: getAttachmentLabel(support.id) },
      });
      _addRemoveBtn(header, el);
      el.appendChild(header);
      contentEl = document.createElement('div');
      contentEl.className = `image-content attachment-surface attachment-${support.id}`;
      contentEl.innerHTML = renderAttachmentContentMarkup(support.id, dataUrl, fn, false);
      el.appendChild(contentEl);
    }
  } else if (type === 'desc-text') {
    const { fileName: fn, text, source = 'file' } = spec;
    el.className = 'exercise-note desc-text-note';
    el.dataset.autoDesc = '1';
    el.dataset.descSource = source;
    el.dataset.fileName = fn || '';
    el.innerHTML =
      `<div class="exercise-note-head">${RENDERER_LABELS.description} ` +
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
        setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, COPY_FEEDBACK_MS);
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

export function buildPdfBlock(fileName, dataUrl) {
  return buildBlock({ type: 'pdf', fileName, dataUrl });
}

export function buildImageDescNote(dataUrl, fileName) {
  return buildBlock({ type: 'image-desc', fileName, dataUrl });
}

export function buildPdfDescNote(dataUrl, fileName) {
  return buildBlock({ type: 'pdf-desc', fileName, dataUrl });
}

export function buildAttachmentBlock(fileName, dataUrl, supportId, isDescription = false) {
  const support = ATTACHMENT_SUPPORTS.find(item => item.id === supportId);
  if (!support) return null;
  return buildBlock({
    type: isDescription ? support.descBuildType : support.buildType,
    fileName,
    dataUrl,
  });
}

// ── renderBodyContents ────────────────────────────────────────────────────

export function buildExerciseBlocks({
  ex,
  modeConfig,
  renderOutputContent,
  buildConfig = {}
}) {
  return buildUnifiedBlocks({
    ex,
    modeConfig,
    renderOutputContent,
    buildBlock,
    buildConfig
  });
}

export function buildBlocksFromScannerGroup({
  files = [],
  outputSectionsCache = [],
  descTexts = [],
  descFromComment = '',
  modeConfig,
  renderOutputContent,
  buildConfig = {},
  ...rest
}) {
  const attachmentGrouped = {};
  ATTACHMENT_SUPPORTS.forEach(support => {
    attachmentGrouped[support.exerciseKey] = rest[support.exerciseKey] || [];
    attachmentGrouped[support.descExerciseKey] = rest[support.descExerciseKey] || [];
  });

  return buildUnifiedBlocks({
    ex: {
      files,
      outputSectionsCache,
      descTexts,
      descFromComment,
      ...attachmentGrouped,
    },
    modeConfig,
    renderOutputContent,
    buildBlock,
    buildConfig
  });
}

export function updateExerciseBlockStates(body, statePatch) {
  applyBlockStatePatch(body, statePatch);
}

export function renderBodyContents(body, ex, modeConfig, renderOutputContent, buildConfig = {}) {
  const built = buildExerciseBlocks({
    ex,
    modeConfig,
    renderOutputContent,
    buildConfig
  });

  body.appendChild(built.fragment);
  body.__exerciseBlocks = built;
  void renderPdfPreviewSurfaces(body);
}
