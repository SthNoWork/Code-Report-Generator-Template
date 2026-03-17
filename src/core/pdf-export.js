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
  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117';

  document.body.classList.add('exporting-pdf');
  if (button) button.style.visibility = 'hidden';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const canvas = await window.html2canvas(view, {
      scale: captureConfig.captureScale,
      backgroundColor: bgColor,
      useCORS: true,
      logging: false,
      width: view.offsetWidth,
      height: view.scrollHeight,
      windowWidth: captureConfig.viewportWidthPx,
      windowHeight: view.scrollHeight
    });

    const imgData = canvas.toDataURL('image/jpeg', captureConfig.imageQuality);
    const { jsPDF } = window.jspdf;
    const pad = captureConfig.pagePaddingMm ?? 8;
    const width = captureConfig.pageWidthMm;
    const coverPageHeight = captureConfig.pageHeightMm ?? 297;
    const imgWidth = width - 2 * pad;
    const imgHeight = imgWidth * (canvas.height / canvas.width);
    const height = imgHeight + 2 * pad;

    let coverSource = null;
    if (coverImageDataUrl) {
      coverSource = {
        dataUrl: coverImageDataUrl,
        aspectRatio: await getImageAspectRatio(coverImageDataUrl)
      };
    } else if (coverElementId) {
      coverSource = await captureElementToImage(coverElementId, captureConfig, bgColor);
    }

    const hasCover = Boolean(coverSource?.dataUrl);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, hasCover ? coverPageHeight : height] });

    if (hasCover) {
      drawImageCentered(pdf, coverSource.dataUrl, width, coverPageHeight, pad, coverSource.aspectRatio, bgColor);
      pdf.addPage([width, height], 'portrait');
    }

    pdf.setFillColor(bgColor);
    pdf.rect(0, 0, width, height, 'F');
    pdf.addImage(imgData, 'JPEG', pad, pad, imgWidth, imgHeight);
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
