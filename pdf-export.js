import { getAppConfig } from './app-config-resolver.js';

const CFG = getAppConfig();

// ── Image helpers ──────────────────────────────────────────────────────────

async function getImageAspectRatio(dataUrl) {
  return await new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      resolve(height / width);
    };
    image.onerror = () => resolve(Number(CFG.pdf.fallbackAspectRatio) || (297 / 210));
    image.src = dataUrl;
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for PDF paging'));
    img.src = dataUrl;
  });
}

async function ensureImagesReady(root) {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return;
  await Promise.all(images.map(async image => {
    image.loading = 'eager';
    image.decoding = 'sync';
    if (image.complete && image.naturalWidth > 0) return;
    try {
      if (typeof image.decode === 'function') { await image.decode(); return; }
    } catch { }
    await new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

function copyCanvasPixels(sourceRoot, cloneRoot) {
  const sources = Array.from(sourceRoot.querySelectorAll('canvas'));
  const clones = Array.from(cloneRoot.querySelectorAll('canvas'));
  const count = Math.min(sources.length, clones.length);
  for (let i = 0; i < count; i++) {
    const src = sources[i]; const dst = clones[i];
    if (!src || !dst) continue;
    dst.width = src.width; dst.height = src.height;
    const ctx = dst.getContext('2d');
    if (ctx) ctx.drawImage(src, 0, 0);
  }
}

// ── Element capture ────────────────────────────────────────────────────────

/**
 * Capture a DOM element as a single image.
 * Returns { dataUrl, widthPx, heightPx }
 */
async function captureElementImage(element, captureConfig, bgColor, ignoredSelectors = []) {
  const widthPx = Math.max(1, element.offsetWidth);
  const heightPx = Math.max(1, element.scrollHeight, element.offsetHeight);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed', 'left:-99999px', 'top:0',
    `width:${widthPx}px`, `height:${heightPx}px`,
    'overflow:visible', `background:${bgColor}`,
    'z-index:-1', 'pointer-events:none'
  ].join(';');

  const clone = element.cloneNode(true);
  ignoredSelectors.forEach(sel => clone.querySelectorAll(sel).forEach(n => n.remove()));
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  copyCanvasPixels(element, clone);

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const canvas = await window.html2canvas(wrapper, {
      scale: captureConfig.captureScale,
      backgroundColor: bgColor,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: widthPx,
      height: heightPx,
      windowWidth: widthPx,
      windowHeight: Math.max(heightPx, Number(CFG.pdf.elementWindowMinHeightPx) || 900)
    });
    return {
      dataUrl: canvas.toDataURL('image/jpeg', captureConfig.imageQuality),
      widthPx: canvas.width || 1,
      heightPx: canvas.height || 1
    };
  } finally {
    wrapper.remove();
  }
}

/**
 * Capture the cover element as a single centered image.
 */
async function captureElementToImage(elementId, captureConfig, bgColor) {
  if (!elementId) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;
  const result = await captureElementImage(element, captureConfig, bgColor);
  return result ? { dataUrl: result.dataUrl, aspectRatio: result.heightPx / result.widthPx } : null;
}

// ── Per-exercise segment capture ───────────────────────────────────────────

/**
 * Capture each exercise card as its own image segment.
 * Each segment = one exercise card captured at full height.
 * Also captures utils section as a final segment if present.
 *
 * Each returned segment carries { dataUrl, widthPx, heightPx, isExerciseStart: true }
 * so the layout engine knows to start it on a fresh page with exercise top padding.
 */
async function captureGeneralViewSegments(view, captureConfig, bgColor, ignoredSelectors = []) {
  const segments = [];
  const cards = Array.from(view.querySelectorAll('#general-ex-list .ex-item'));

  for (const card of cards) {
    if (!card.offsetWidth || !card.offsetHeight) continue;
    const captured = await captureElementImage(card, captureConfig, bgColor, ignoredSelectors);
    if (captured) segments.push({ ...captured, isExerciseStart: true });
  }

  const utilsSection = view.querySelector('#utils-section');
  if (utilsSection && utilsSection.offsetWidth && utilsSection.offsetHeight) {
    const capturedUtils = await captureElementImage(utilsSection, captureConfig, bgColor, ignoredSelectors);
    // Utils also gets its own fresh page
    if (capturedUtils) segments.push({ ...capturedUtils, isExerciseStart: true });
  }

  return segments;
}

// ── Cover page ─────────────────────────────────────────────────────────────

function drawImageCentered(pdf, dataUrl, pageWidthMm, pageHeightMm, horizontalPaddingMm, verticalPaddingMm, aspectRatio, bgColor) {
  const maxWidth = pageWidthMm - (horizontalPaddingMm * 2);
  const maxHeight = pageHeightMm - (verticalPaddingMm * 2);

  let renderWidth = maxWidth;
  let renderHeight = renderWidth * aspectRatio;
  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight / aspectRatio;
  }

  const x = (pageWidthMm - renderWidth) / 2;
  const y = (pageHeightMm - renderHeight) / 2;
  pdf.setFillColor(bgColor);
  pdf.rect(0, 0, pageWidthMm, pageHeightMm, 'F');
  pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight);
}

// ── Main layout engine ─────────────────────────────────────────────────────

/**
 * Layout segments across A4 pages.
 *
 * Rules:
 *  - Every segment with isExerciseStart=true begins on a fresh page.
 *  - Exercise start page gets exerciseStartTopPaddingMm at the top.
 *  - If a single block image fits within one page it is placed whole.
 *  - If a block is taller than one page it is pixel-sliced across consecutive
 *    pages with NO top or bottom padding on continuation pages.
 *  - blockVerticalPaddingMm is added above/below blocks that fit within a page.
 */
async function drawSegmentsAcrossPages(
  pdf,
  segments,
  pageWidthMm,
  pageHeightMm,
  horizontalPaddingMm,
  verticalPaddingMm,
  blockVerticalPaddingMm,
  exerciseStartTopPaddingMm,
  bgColor,
  imageQuality
) {
  const contentWidthMm = pageWidthMm - 2 * horizontalPaddingMm;
  const contentTopMm = verticalPaddingMm;
  const contentBottomMm = pageHeightMm - verticalPaddingMm;
  const contentHeightMm = contentBottomMm - contentTopMm;

  let isFirstPage = true;
  let isFirstBlock = true; // first block on current page

  const fillPage = () => {
    pdf.setFillColor(bgColor);
    pdf.rect(0, 0, pageWidthMm, pageHeightMm, 'F');
  };

  const addPage = () => {
    pdf.addPage([pageWidthMm, pageHeightMm], 'portrait');
    fillPage();
  };

  // Fill the very first content page background
  fillPage();
  let cursorY = contentTopMm;

  for (const segment of segments) {
    const isExStart = Boolean(segment.isExerciseStart);

    // Every exercise starts on a fresh page (except the very first one
    // which already has a page from cover or initial page)
    if (isExStart && !isFirstPage) {
      addPage();
      cursorY = contentTopMm;
      isFirstBlock = true;
    }

    // Top padding for exercise start
    const topPadding = isExStart
      ? exerciseStartTopPaddingMm
      : (isFirstBlock ? 0 : blockVerticalPaddingMm);

    const image = await loadImageElement(segment.dataUrl);
    const widthPx = Math.max(1, segment.widthPx || image.naturalWidth || 1);
    const heightPx = Math.max(1, segment.heightPx || image.naturalHeight || 1);
    const mmPerPx = contentWidthMm / widthPx;
    const totalHeightMm = heightPx * mmPerPx;

    const fitsInOnePage = totalHeightMm <= contentHeightMm;

    if (fitsInOnePage) {
      // Whole block fits — add bottom padding too
      const needed = topPadding + totalHeightMm + blockVerticalPaddingMm;
      const remaining = contentBottomMm - cursorY;

      if (needed > remaining && !isFirstBlock) {
        // Doesn't fit on remaining space — bump to new page (but NOT for exercise starts,
        // they already got a new page above)
        if (!isExStart) {
          addPage();
          cursorY = contentTopMm;
          isFirstBlock = true;
        }
      }

      const actualTop = isFirstBlock ? cursorY + (isExStart ? exerciseStartTopPaddingMm : 0)
        : cursorY + topPadding;
      pdf.addImage(segment.dataUrl, 'JPEG', horizontalPaddingMm, actualTop, contentWidthMm, totalHeightMm);
      cursorY = actualTop + totalHeightMm + blockVerticalPaddingMm;

    } else {
      // Block is taller than one page — pixel-slice it across pages.
      // No top/bottom padding on continuation slices.
      cursorY += (isFirstBlock ? (isExStart ? exerciseStartTopPaddingMm : 0) : topPadding);

      let sourceY = 0;
      let remainingPx = heightPx;
      let firstSlice = true;

      while (remainingPx > 0) {
        const remainingOnPageMm = contentBottomMm - cursorY;

        if (remainingOnPageMm <= 1) {
          addPage();
          cursorY = contentTopMm; // NO top padding on continuation page
          firstSlice = false;
          continue;
        }

        const slicePx = Math.max(1, Math.min(remainingPx, Math.floor(remainingOnPageMm / mmPerPx)));
        const sliceHeightMm = slicePx * mmPerPx;

        const chunkCanvas = document.createElement('canvas');
        chunkCanvas.width = widthPx;
        chunkCanvas.height = slicePx;
        const ctx = chunkCanvas.getContext('2d');
        if (!ctx) throw new Error('Unable to create PDF chunk canvas');
        ctx.drawImage(image, 0, sourceY, widthPx, slicePx, 0, 0, widthPx, slicePx);

        const chunkDataUrl = chunkCanvas.toDataURL('image/jpeg', imageQuality);
        pdf.addImage(chunkDataUrl, 'JPEG', horizontalPaddingMm, cursorY, contentWidthMm, sliceHeightMm);

        sourceY += slicePx;
        remainingPx -= slicePx;
        cursorY += sliceHeightMm;
        firstSlice = false;

        if (remainingPx > 0) {
          addPage();
          cursorY = contentTopMm; // NO padding on continuation page
        }
      }

      // After a tall block that filled to page bottom, no bottom padding
      // (cursorY already at contentBottomMm or beyond)
    }

    isFirstPage = false;
    isFirstBlock = false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function captureViewToPdf(viewId, fileName, buttonId, captureConfig, coverImageDataUrl = '', coverElementId = '') {
  if (!window.html2canvas || !window.jspdf) {
    alert(CFG.pdf.messages.librariesMissing);
    return;
  }

  const view = document.getElementById(viewId);
  const button = document.getElementById(buttonId);
  if (!view) {
    alert(CFG.pdf.messages.contentViewMissing);
    return;
  }

  // Resolve all config values from CFG, with captureConfig overrides
  const safeConfig = {
    captureScale: Math.max(1, Number(captureConfig?.captureScale) || CFG.pdf.captureScale || 2),
    imageQuality: Math.min(1, Math.max(0.1, Number(captureConfig?.imageQuality) || CFG.pdf.imageQuality || 0.95)),
    viewportWidthPx: Number(captureConfig?.viewportWidthPx) || CFG.pdf.safeViewportWidthPx || 1100,
    pageHorizontalPaddingMm: Number(captureConfig?.pageHorizontalPaddingMm
      ?? captureConfig?.pagePaddingMm
      ?? CFG.pdf.pageHorizontalPaddingMm
      ?? CFG.pdf.pagePaddingMm ?? 8),
    pageVerticalPaddingMm: Number(captureConfig?.pageVerticalPaddingMm
      ?? CFG.pdf.pageVerticalPaddingMm ?? 0),
    blockVerticalPaddingMm: Math.max(0, Number(captureConfig?.blockVerticalPaddingMm
      ?? CFG.pdf.blockVerticalPaddingMm ?? 4)),
    exerciseStartTopPaddingMm: Math.max(0, Number(captureConfig?.exerciseStartTopPaddingMm
      ?? CFG.pdf.exerciseStartTopPaddingMm ?? 8)),
    pageWidthMm: Number(captureConfig?.pageWidthMm) || CFG.pdf.pageWidthMm || 210,
    pageHeightMm: Number(captureConfig?.pageHeightMm) || CFG.pdf.pageHeightMm || 297,
  };

  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117';
  const ignoredSelectors = viewId === 'view-general' ? (CFG.pdf.generalIgnoreSelectors || []) : [];

  document.body.classList.add('exporting-pdf');
  if (button) button.style.visibility = 'hidden';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    await ensureImagesReady(document.body);

    // Capture segments — one per exercise card for precise page control
    let segments = [];
    if (viewId === 'view-general') {
      segments = await captureGeneralViewSegments(view, safeConfig, bgColor, ignoredSelectors);
    }
    if (!segments.length) {
      // Fallback: capture entire view as single segment
      const full = await captureElementImage(view, safeConfig, bgColor, ignoredSelectors);
      if (full) segments = [{ ...full, isExerciseStart: true }];
    }
    if (!segments.length) throw new Error('No content was captured for PDF export.');

    // Capture cover
    let coverSource = null;
    if (coverImageDataUrl) {
      coverSource = { dataUrl: coverImageDataUrl, aspectRatio: await getImageAspectRatio(coverImageDataUrl) };
    } else if (coverElementId) {
      coverSource = await captureElementToImage(coverElementId, safeConfig, bgColor);
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [safeConfig.pageWidthMm, safeConfig.pageHeightMm] });

    // Draw cover page
    if (coverSource?.dataUrl) {
      drawImageCentered(
        pdf, coverSource.dataUrl,
        safeConfig.pageWidthMm, safeConfig.pageHeightMm,
        safeConfig.pageHorizontalPaddingMm, safeConfig.pageVerticalPaddingMm,
        coverSource.aspectRatio, bgColor
      );
      pdf.addPage([safeConfig.pageWidthMm, safeConfig.pageHeightMm], 'portrait');
      // Fill first content page background immediately
      pdf.setFillColor(bgColor);
      pdf.rect(0, 0, safeConfig.pageWidthMm, safeConfig.pageHeightMm, 'F');
    }

    // Draw all exercise segments with correct page-break logic
    await drawSegmentsAcrossPages(
      pdf,
      segments,
      safeConfig.pageWidthMm,
      safeConfig.pageHeightMm,
      safeConfig.pageHorizontalPaddingMm,
      safeConfig.pageVerticalPaddingMm,
      safeConfig.blockVerticalPaddingMm,
      safeConfig.exerciseStartTopPaddingMm,
      bgColor,
      safeConfig.imageQuality
    );

    pdf.save(`${fileName}-report.pdf`);
  } catch (error) {
    console.error('PDF export error:', error);
    alert(CFG.pdf.messages.genericFailedPrefix + (error?.message || 'Unknown error'));
  } finally {
    document.body.classList.remove('exporting-pdf');
    if (button) button.style.visibility = '';
  }
}

export async function exportExerciseListPdf(options) {
  const {
    listSelector,
    resolveExercise,
    ensureBodyLoaded,
    notesSelector,
    viewId,
    fileName,
    buttonId,
    captureConfig,
    coverImageDataUrl = '',
    coverElementId = '',
    beforeCapture,
    afterCapture,
    waitMs = Number(CFG.runtime?.loadingResetDelayMs) || 0
  } = options;

  const items = Array.from(document.querySelectorAll(`${listSelector} .ex-item`));
  const pending = [];

  try {
    items.forEach(item => {
      item.classList.add('open');
      const body = item.querySelector('.ex-body');
      const ex = resolveExercise(item);
      if (ex && body) {
        const maybePromise = ensureBodyLoaded(body, ex);
        if (maybePromise && typeof maybePromise.then === 'function') pending.push(maybePromise);
      }
    });

    await Promise.all(pending);
    if (typeof beforeCapture === 'function') await beforeCapture();

    document.querySelectorAll(notesSelector).forEach(textArea => {
      if (textArea.value.trim()) {
        textArea.closest('.ex-notes-row')?.classList.add('has-notes');
      }
    });

    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    await captureViewToPdf(viewId, fileName, buttonId, captureConfig, coverImageDataUrl, coverElementId);
  } catch (error) {
    console.error('Exercise list PDF export error:', error);
    alert(CFG.pdf.messages.genericFailedPrefix + (error?.message || 'Unknown error'));
  } finally {
    document.querySelectorAll('.ex-notes-row.has-notes').forEach(row => row.classList.remove('has-notes'));
    if (typeof afterCapture === 'function') await afterCapture();
  }
}
