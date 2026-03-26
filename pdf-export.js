async function getImageAspectRatio(dataUrl) {
  return await new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      resolve(height / width);
    };
    image.onerror = () => resolve(297 / 210);
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
    windowWidth: Math.max(captureConfig.viewportWidthPx || 960, element.offsetWidth),
    windowHeight: Math.max(element.offsetHeight, 900)
  });

  return {
    dataUrl: canvas.toDataURL('image/jpeg', captureConfig.imageQuality),
    aspectRatio: (canvas.height || 1) / (canvas.width || 1)
  };
}

async function captureElementSlices(element, captureConfig, bgColor, targetSliceHeightPx) {
  const widthPx = Math.max(1, element.offsetWidth);
  const totalHeightPx = Math.max(1, element.scrollHeight);
  const sliceHeightPx = Math.max(256, Math.floor(targetSliceHeightPx));
  const slices = [];

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
    clone.style.margin = '0';
    clone.style.transform = `translateY(-${y}px)`;
    clone.style.transformOrigin = 'top left';

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
        windowWidth: Math.max(captureConfig.viewportWidthPx || widthPx, widthPx),
        windowHeight: Math.max(currentSliceHeight, 512)
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

function drawImageCentered(pdf, dataUrl, pageWidthMm, pageHeightMm, paddingMm, aspectRatio, bgColor) {
  const maxWidth = pageWidthMm - (paddingMm * 2);
  const maxHeight = pageHeightMm - (paddingMm * 2);

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

export async function captureViewToPdf(viewId, fileName, buttonId, captureConfig, coverImageDataUrl = '', coverElementId = '') {
  if (!window.html2canvas || !window.jspdf) {
    alert('PDF libraries not loaded. Please refresh.');
    return;
  }

  const view = document.getElementById(viewId);
  const button = document.getElementById(buttonId);
  if (!view) {
    alert('PDF export failed: content view not found.');
    return;
  }

  const safeConfig = {
    captureScale: Math.max(1, Number(captureConfig?.captureScale) || 2),
    imageQuality: Math.min(1, Math.max(0.1, Number(captureConfig?.imageQuality) || 0.95)),
    viewportWidthPx: Number(captureConfig?.viewportWidthPx) || 1100,
    pagePaddingMm: Number(captureConfig?.pagePaddingMm) || 8,
    pageWidthMm: Number(captureConfig?.pageWidthMm) || 210,
    pageHeightMm: Number(captureConfig?.pageHeightMm) || 297
  };

  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117';

  document.body.classList.add('exporting-pdf');
  if (button) button.style.visibility = 'hidden';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const { jsPDF } = window.jspdf;
    const pad = safeConfig.pagePaddingMm;
    const width = safeConfig.pageWidthMm;
    const pageHeight = safeConfig.pageHeightMm;
    const contentWidthMm = width - 2 * pad;
    const contentHeightMm = pageHeight - 2 * pad;

    const targetSliceHeightPx = Math.max(
      512,
      Math.floor(view.offsetWidth * (contentHeightMm / Math.max(contentWidthMm, 1)))
    );

    const slices = await captureElementSlices(view, safeConfig, bgColor, targetSliceHeightPx);
    if (!slices.length) throw new Error('No capture slices were generated.');

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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, pageHeight] });
    let needsNewPageForFirstSlice = false;

    if (hasCover) {
      drawImageCentered(pdf, coverSource.dataUrl, width, pageHeight, pad, coverSource.aspectRatio, bgColor);
      needsNewPageForFirstSlice = true;
    }

    slices.forEach((slice, index) => {
      if (index > 0 || needsNewPageForFirstSlice) {
        pdf.addPage([width, pageHeight], 'portrait');
        needsNewPageForFirstSlice = false;
      }
      const imgWidthMm = contentWidthMm;
      const imgHeightMm = imgWidthMm * (slice.heightPx / Math.max(slice.widthPx, 1));
      pdf.setFillColor(bgColor);
      pdf.rect(0, 0, width, pageHeight, 'F');
      pdf.addImage(slice.dataUrl, 'JPEG', pad, pad, imgWidthMm, Math.min(imgHeightMm, contentHeightMm));
    });

    pdf.save(`${fileName}-report.pdf`);
  } catch (error) {
    console.error('PDF export error:', error);
    alert('PDF export failed: ' + (error?.message || 'Unknown error'));
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
    alert('PDF export failed: ' + (error?.message || 'Unknown error'));
  } finally {
    document.querySelectorAll('.ex-notes-row.has-notes').forEach(row => row.classList.remove('has-notes'));
    if (typeof afterCapture === 'function') await afterCapture();
  }
}
