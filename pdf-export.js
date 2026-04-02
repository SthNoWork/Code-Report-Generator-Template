import { getAppConfig } from './app-config-resolver.js';

const CFG = getAppConfig();

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

async function captureElementToImage(elementId, captureConfig, bgColor) {
  if (!elementId) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;

  const canvas = await window.html2canvas(element, {
    scale: captureConfig.captureScale,
    backgroundColor: bgColor,
    useCORS: true,
    logging: false,
    width: element.offsetWidth,
    height: element.offsetHeight,
    windowWidth: element.offsetWidth,
    windowHeight: Math.max(element.offsetHeight, Number(CFG.pdf.elementWindowMinHeightPx) || 900)
  });

  return {
    dataUrl: canvas.toDataURL('image/jpeg', captureConfig.imageQuality),
    aspectRatio: (canvas.height || 1) / (canvas.width || 1)
  };
}

async function captureElementSlices(element, captureConfig, bgColor, targetSliceHeightPx, ignoredSelectors = []) {
  const widthPx = Math.max(1, element.offsetWidth);
  const totalHeightPx = Math.max(1, element.scrollHeight);
  const sliceHeightPx = Math.max(Number(CFG.pdf.minSliceHeightPx) || 256, Math.floor(targetSliceHeightPx));
  const slices = [];

  const copyCanvasPixelsToClone = (sourceRoot, cloneRoot) => {
    const sourceCanvases = Array.from(sourceRoot.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'));
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);

    for (let i = 0; i < count; i += 1) {
      const sourceCanvas = sourceCanvases[i];
      const cloneCanvas = cloneCanvases[i];
      if (!sourceCanvas || !cloneCanvas) continue;

      cloneCanvas.width = sourceCanvas.width;
      cloneCanvas.height = sourceCanvas.height;
      const ctx = cloneCanvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  };

  // Render each vertical slice in an isolated viewport-sized wrapper to avoid canvas max-size clipping.
  for (let y = 0; y < totalHeightPx; y += sliceHeightPx) {
    const currentSliceHeight = Math.min(sliceHeightPx, totalHeightPx - y);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'position:fixed',
      'left:-99999px',
      'top:0',
      `width:${widthPx}px`,
      `height:${currentSliceHeight}px`,
      'overflow:hidden',
      `background:${bgColor}`,
      'z-index:-1',
      'pointer-events:none'
    ].join(';');

    const clone = element.cloneNode(true);
    if (ignoredSelectors.length) {
      ignoredSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(node => node.remove());
      });
    }
    clone.style.margin = '0';
    clone.style.transform = `translateY(-${y}px)`;
    clone.style.transformOrigin = 'top left';
    copyCanvasPixelsToClone(element, clone);

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      const canvas = await window.html2canvas(wrapper, {
        scale: captureConfig.captureScale,
        backgroundColor: bgColor,
        useCORS: true,
        logging: false,
        width: widthPx,
        height: currentSliceHeight,
        windowWidth: widthPx,
        windowHeight: Math.max(currentSliceHeight, Number(CFG.pdf.sliceWindowMinHeightPx) || 512)
      });

      slices.push({
        dataUrl: canvas.toDataURL('image/jpeg', captureConfig.imageQuality),
        widthPx: canvas.width || 1,
        heightPx: canvas.height || 1
      });
    } finally {
      wrapper.remove();
    }
  }

  return slices;
}

async function captureElementImage(element, captureConfig, bgColor, ignoredSelectors = []) {
  const widthPx = Math.max(1, element.offsetWidth);
  const heightPx = Math.max(1, element.scrollHeight, element.offsetHeight);

  const copyCanvasPixelsToClone = (sourceRoot, cloneRoot) => {
    const sourceCanvases = Array.from(sourceRoot.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(cloneRoot.querySelectorAll('canvas'));
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);

    for (let i = 0; i < count; i += 1) {
      const sourceCanvas = sourceCanvases[i];
      const cloneCanvas = cloneCanvases[i];
      if (!sourceCanvas || !cloneCanvas) continue;

      cloneCanvas.width = sourceCanvas.width;
      cloneCanvas.height = sourceCanvas.height;
      const ctx = cloneCanvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  };

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${widthPx}px`,
    `height:${heightPx}px`,
    'overflow:visible',
    `background:${bgColor}`,
    'z-index:-1',
    'pointer-events:none'
  ].join(';');

  const clone = element.cloneNode(true);
  if (ignoredSelectors.length) {
    ignoredSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(node => node.remove());
    });
  }
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  copyCanvasPixelsToClone(element, clone);

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const canvas = await window.html2canvas(wrapper, {
      scale: captureConfig.captureScale,
      backgroundColor: bgColor,
      useCORS: true,
      logging: false,
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

async function captureGeneralViewSegments(view, captureConfig, bgColor, ignoredSelectors = []) {
  const segments = [];
  const cards = Array.from(view.querySelectorAll('#general-ex-list .ex-item'));

  for (const card of cards) {
    if (!card.offsetWidth || !card.offsetHeight) continue;
    const captured = await captureElementImage(card, captureConfig, bgColor, ignoredSelectors);
    if (captured) segments.push(captured);
  }

  const utilsSection = view.querySelector('#utils-section');
  if (utilsSection && utilsSection.offsetWidth && utilsSection.offsetHeight) {
    const capturedUtils = await captureElementImage(utilsSection, captureConfig, bgColor, ignoredSelectors);
    if (capturedUtils) segments.push(capturedUtils);
  }

  return segments;
}

async function ensureImagesReady(root) {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return;

  await Promise.all(images.map(async image => {
    image.loading = 'eager';
    image.decoding = 'sync';

    if (image.complete && image.naturalWidth > 0) return;

    try {
      if (typeof image.decode === 'function') {
        await image.decode();
        return;
      }
    } catch {
      // Fall back to load/error events below when decode fails.
    }

    await new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

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

async function drawImagesAcrossPages(pdf, images, pageWidthMm, pageHeightMm, horizontalPaddingMm, verticalPaddingMm, blockVerticalPaddingMm, exerciseStartTopPaddingMm, bgColor, imageQuality) {
  const contentWidthMm = pageWidthMm - 2 * horizontalPaddingMm;
  const contentHeightMm = pageHeightMm - 2 * verticalPaddingMm;
  const contentTopMm = verticalPaddingMm;
  const contentBottomMm = pageHeightMm - verticalPaddingMm;

  const fillPage = () => {
    pdf.setFillColor(bgColor);
    pdf.rect(0, 0, pageWidthMm, pageHeightMm, 'F');
  };

  const loadImage = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for PDF paging'));
    image.src = dataUrl;
  });

  const addPage = () => {
    pdf.addPage([pageWidthMm, pageHeightMm], 'portrait');
    fillPage();
  };

  let cursorY = contentTopMm + exerciseStartTopPaddingMm;

  fillPage();

  for (let index = 0; index < images.length; index += 1) {
    const item = images[index];

    if (index > 0) {
      addPage();
      cursorY = contentTopMm + exerciseStartTopPaddingMm;
    }

    const image = await loadImage(item.dataUrl);
    const widthPx = Math.max(1, item.widthPx || image.naturalWidth || image.width || 1);
    const heightPx = Math.max(1, item.heightPx || image.naturalHeight || image.height || 1);
    const mmPerPx = contentWidthMm / widthPx;
    const totalHeightMm = heightPx * mmPerPx;
    const canUseBlockPadding = totalHeightMm + (2 * blockVerticalPaddingMm) <= contentHeightMm;
    const topBlockPadMm = canUseBlockPadding ? blockVerticalPaddingMm : 0;
    const bottomBlockPadMm = canUseBlockPadding ? blockVerticalPaddingMm : 0;
    const singleBlockNeededMm = totalHeightMm + topBlockPadMm + bottomBlockPadMm;
    const remainingHeightMm = contentBottomMm - cursorY;

    if (totalHeightMm <= contentHeightMm && singleBlockNeededMm > remainingHeightMm && cursorY > contentTopMm) {
      addPage();
      cursorY = contentTopMm;
    }

    if (totalHeightMm <= contentHeightMm) {
      cursorY += topBlockPadMm;
      pdf.addImage(item.dataUrl, 'JPEG', horizontalPaddingMm, cursorY, contentWidthMm, totalHeightMm);
      cursorY += totalHeightMm + bottomBlockPadMm;
      continue;
    }

    let sourceY = 0;
    let remainingPx = heightPx;

    while (remainingPx > 0) {
      const remainingOnPageMm = contentBottomMm - cursorY;
      if (remainingOnPageMm <= 0) {
        addPage();
        cursorY = contentTopMm;
        continue;
      }

      const chunkPx = Math.max(1, Math.min(remainingPx, Math.floor(remainingOnPageMm / mmPerPx)));
      const chunkHeightMm = chunkPx * mmPerPx;

      const chunkCanvas = document.createElement('canvas');
      chunkCanvas.width = widthPx;
      chunkCanvas.height = chunkPx;
      const ctx = chunkCanvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create PDF chunk canvas');
      ctx.drawImage(image, 0, sourceY, widthPx, chunkPx, 0, 0, widthPx, chunkPx);

      const chunkDataUrl = chunkCanvas.toDataURL('image/jpeg', imageQuality);
      pdf.addImage(chunkDataUrl, 'JPEG', horizontalPaddingMm, cursorY, contentWidthMm, chunkHeightMm);

      sourceY += chunkPx;
      remainingPx -= chunkPx;
      cursorY += chunkHeightMm;

      if (remainingPx > 0) {
        addPage();
        cursorY = contentTopMm;
      }
    }
  }
}

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

  const safeConfig = {
    captureScale: Math.max(1, Number(captureConfig?.captureScale) || 2),
    imageQuality: Math.min(1, Math.max(0.1, Number(captureConfig?.imageQuality) || 0.95)),
    viewportWidthPx: Number(captureConfig?.viewportWidthPx) || Number(CFG.pdf.safeViewportWidthPx) || 1100,
    pageHorizontalPaddingMm: Number(captureConfig?.pageHorizontalPaddingMm) || Number(captureConfig?.pagePaddingMm) || 8,
    pageVerticalPaddingMm: Number(captureConfig?.pageVerticalPaddingMm ?? 0),
    blockVerticalPaddingMm: Math.max(0, Number(captureConfig?.blockVerticalPaddingMm ?? 4)),
    exerciseStartTopPaddingMm: Math.max(0, Number(captureConfig?.exerciseStartTopPaddingMm ?? 4)),
    pageWidthMm: Number(captureConfig?.pageWidthMm) || 210,
    pageHeightMm: Number(captureConfig?.pageHeightMm) || 297
  };

  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117';

  document.body.classList.add('exporting-pdf');
  if (button) button.style.visibility = 'hidden';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    await ensureImagesReady(view);

    const { jsPDF } = window.jspdf;
    const padX = safeConfig.pageHorizontalPaddingMm;
    const padY = safeConfig.pageVerticalPaddingMm;
    const width = safeConfig.pageWidthMm;
    const pageHeight = safeConfig.pageHeightMm;
    const contentWidthMm = width - 2 * padX;
    const contentHeightMm = pageHeight - 2 * padY;
    const ignoredSelectors = viewId === 'view-general'
      ? CFG.pdf.generalIgnoreSelectors
      : [];

    let captures;
    try {
      if (viewId === 'view-general') {
        captures = await captureGeneralViewSegments(view, safeConfig, bgColor, ignoredSelectors);
      }
      if (!captures?.length) {
        const fullCapture = await captureElementImage(view, safeConfig, bgColor, ignoredSelectors);
        captures = [fullCapture];
      }
    } catch {
      const targetSliceHeightPx = Math.max(
        512,
        Math.floor(view.offsetWidth * (contentHeightMm / Math.max(contentWidthMm, 1)))
      );
      captures = await captureElementSlices(view, safeConfig, bgColor, targetSliceHeightPx, ignoredSelectors);
    }

    if (!captures.length) throw new Error('No capture slices were generated.');

    let coverSource = null;
    if (coverImageDataUrl) {
      coverSource = {
        dataUrl: coverImageDataUrl,
        aspectRatio: await getImageAspectRatio(coverImageDataUrl)
      };
    } else if (coverElementId) {
      coverSource = await captureElementToImage(coverElementId, safeConfig, bgColor);
    }

    const hasCover = Boolean(coverSource?.dataUrl);

    if (hasCover) {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, pageHeight] });
      drawImageCentered(pdf, coverSource.dataUrl, width, pageHeight, padX, padY, coverSource.aspectRatio, bgColor);
      pdf.addPage([width, pageHeight], 'portrait');
      await drawImagesAcrossPages(pdf, captures, width, pageHeight, padX, padY, safeConfig.blockVerticalPaddingMm, safeConfig.exerciseStartTopPaddingMm, bgColor, safeConfig.imageQuality);
      pdf.save(`${fileName}-report.pdf`);
    } else {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, pageHeight] });
      await drawImagesAcrossPages(pdf, captures, width, pageHeight, padX, padY, safeConfig.blockVerticalPaddingMm, safeConfig.exerciseStartTopPaddingMm, bgColor, safeConfig.imageQuality);
      pdf.save(`${fileName}-report.pdf`);
    }
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
    waitMs = 0
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
