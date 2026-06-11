import { renderPdfPreviewSurfaces } from './renderer.js';

// Helper to wait for images
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

// Helper to fetch resource as base64 data URL
async function fetchAsDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to fetch image as data URL:', url, err);
    return url;
  }
}

export function embedImagesInMarkdown(markdownText, imageMap) {
  if (!imageMap || Object.keys(imageMap).length === 0) {
    return markdownText;
  }

  let result = markdownText;
  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const keys = Object.keys(imageMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const base64Val = imageMap[key];
    if (!base64Val) continue;
    const escapedKey = escapeRegExp(key);

    const mdRegex = new RegExp('!\\[([^\\]]*)\\]\\(\\s*' + escapedKey + '\\s*\\)', 'g');
    result = result.replace(mdRegex, (match, alt) => `![${alt}](${base64Val})`);

    const htmlRegex = new RegExp('src=["\']\\s*' + escapedKey + '\\s*["\']', 'g');
    result = result.replace(htmlRegex, `src="${base64Val}"`);
  }

  return result;
}

export function extractImagesFromMarkdown(markdownText) {
  let result = markdownText;
  const imageMap = {};
  let counter = 1;

  const registerBase64 = (base64, suggestedName) => {
    let ext = 'png';
    const match = base64.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    if (match && match[1]) {
      ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    }

    let name = suggestedName ? suggestedName.trim().replace(/[^a-zA-Z0-9_.-]/g, '_') : '';
    if (!name || name.startsWith('data:')) {
      name = `image_${counter++}`;
    }
    if (!name.includes('.')) {
      name = `${name}.${ext}`;
    }

    let finalName = name;
    let dupCounter = 1;
    while (imageMap[finalName]) {
      const parts = name.split('.');
      const base = parts.slice(0, -1).join('.');
      const fileExt = parts[parts.length - 1];
      finalName = `${base}_${dupCounter++}.${fileExt}`;
    }

    imageMap[finalName] = base64;
    return finalName;
  };

  const htmlBase64Regex = /src=["'](data:image\/[^"';]+;base64,[^"']+)["']/g;
  result = result.replace(htmlBase64Regex, (match, base64) => {
    const filename = registerBase64(base64, 'embedded_image');
    return `src="${filename}"`;
  });

  const mdBase64Regex = /!\[([^\]]*)\]\(\s*(data:image\/[^);]+;base64,[^)]+)\s*\)/g;
  result = result.replace(mdBase64Regex, (match, alt, base64) => {
    const filename = registerBase64(base64, alt || 'embedded_image');
    return `![${alt}](${filename})`;
  });

  return { cleanMarkdown: result, imageMap };
}

// Download trigger
export function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoking to let the browser start the download before the blob URL is released
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Convert HTML table element to Markdown table
 */
function tableToMarkdown(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return '';
  let md = '';
  rows.forEach((row, rIdx) => {
    const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim().replace(/\|/g, '\\|'));
    md += '| ' + cells.join(' | ') + ' |\n';
    if (rIdx === 0 && row.querySelector('th')) {
      md += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
    }
  });
  return md + '\n';
}

/**
 * Export exercise list as a self-contained Markdown file
 */
export async function exportExerciseListMarkdown(options) {
  const {
    listSelector = '#general-ex-list',
    resolveExercise,
    ensureBodyLoaded,
    viewId = 'view-general',
    fileName = 'report',
    buttonId,
    coverImageDataUrl = '',
    includeCover = true,
    coverInfo = {},
    coverSections = [],
    coverLogoDataUrl = '',
    coverLogoSize = 72,
    waitMs = 100
  } = options;

  const btnIds = ['export-md-btn', 'export-general-md-btn'];
  const buttons = btnIds.map(id => document.getElementById(id)).filter(Boolean);
  const originalTexts = buttons.map(btn => btn.textContent);
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'Exporting...';
  });

  try {
    const view = document.getElementById(viewId);
    if (!view) throw new Error('Content view missing.');

    // 1. Open and load all exercise card bodies
    const items = Array.from(document.querySelectorAll(`${listSelector} .ex-item`));
    const pending = [];

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

    // 2. Render all PDF canvas surfaces
    await renderPdfPreviewSurfaces(view);

    // 3. Ensure all images are ready
    await ensureImagesReady(document.body);

    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    // 4. Construct Markdown Content
    let md = '';
    window.__mdImageMap = {};

    // Cover Page
    if (includeCover) {
      md += `# ${coverInfo.title || 'Report'}\n`;
      if (coverInfo.subtitle) {
        md += `### ${coverInfo.subtitle}\n`;
      }
      md += '\n';

      if (coverLogoDataUrl) {
        const resolvedLogo = await fetchAsDataUrl(coverLogoDataUrl);
        if (resolvedLogo) {
          window.__mdImageMap['logo.png'] = resolvedLogo;
          md += `<img src="logo.png" width="${coverLogoSize}" alt="Logo" />\n\n`;
        }
      }

      if (coverImageDataUrl) {
        window.__mdImageMap['cover_image.png'] = coverImageDataUrl;
        md += `![Cover Page Image](cover_image.png)\n\n`;
      }

      const visibleSections = coverSections.filter(r => String(r.label || '').trim() || String(r.value || '').trim());
      if (visibleSections.length > 0) {
        md += '| Info | Details |\n';
        md += '| --- | --- |\n';
        visibleSections.forEach(row => {
          const l = String(row.label || '').trim().replace(/\|/g, '\\|');
          const v = String(row.value || '').trim().replace(/\|/g, '\\|');
          md += `| **${l}** | ${v} |\n`;
        });
        md += '\n';
      }

      md += '---\n\n';
    }

    // Process exercises in DOM visual order
    for (const item of items) {
      if (!item.offsetWidth || !item.offsetHeight) continue;

      const exTitle = item.querySelector('.ex-title-input')?.value?.trim() || 'Exercise';
      const body = item.querySelector('.ex-body');
      if (!body) continue;

      md += `## ${exTitle}\n\n`;

      // Select all block elements in their current visual order
      const blocks = Array.from(body.querySelectorAll([
        '.code-with-desc',
        '.output-block',
        '.image-block',
        '.exercise-note.image-description-note',
        '.exercise-note.desc-text-note',
        '.ex-notes-row',
        '.ex-utils-footer'
      ].join(',')));

      for (const block of blocks) {
        // Skip hidden blocks
        if (block.style.display === 'none' || block.dataset.userHidden === '1') {
          continue;
        }

        // Code Block
        if (block.classList.contains('code-with-desc')) {
          const fn = block.dataset.fileName || block.querySelector('.fname')?.textContent?.trim() || 'Code';
          const isProse = block.querySelector('.prose-block') !== null;
          const ext = fn.split('.').pop().toLowerCase();

          if (isProse) {
            const content = block.querySelector('.prose-text')?.textContent || '';
            const codeLang = ext === 'md' ? 'markdown' : (ext === 'txt' ? 'text' : ext);
            md += `#### File: \`${fn}\`\n\`\`\`${codeLang}\n${content}\n\`\`\`\n\n`;
          } else {
            const content = block.querySelector('code')?.textContent || '';
            md += `#### File: \`${fn}\`\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
          }
        }

        // Output Block
        else if (block.classList.contains('output-block')) {
          if (block.dataset.blockType === 'empty-output') {
            md += `#### Output:\n*No output file found for this exercise.*\n\n`;
            continue;
          }

          const fn = block.dataset.fileName || block.querySelector('.fname')?.textContent?.trim() || 'Output';
          const tableEl = block.querySelector('.output-table');

          if (tableEl) {
            md += `#### Output: \`${fn}\`\n\n${tableToMarkdown(tableEl)}`;
          } else {
            const content = block.querySelector('.output-text')?.textContent || '';
            md += `#### Output: \`${fn}\`\n\`\`\`\n${content}\n\`\`\`\n\n`;
          }
        }

        // Image Block
        else if (block.classList.contains('image-block')) {
          const fn = block.dataset.fileName || block.querySelector('.fname')?.textContent?.trim() || 'Attachment';
          const imgEl = block.querySelector('img');
          const canvases = Array.from(block.querySelectorAll('.pdf-page-canvas'));

          md += `#### Attachment: \`${fn}\`\n\n`;

          if (imgEl && imgEl.src) {
            window.__mdImageMap[fn] = imgEl.src;
            md += `![${fn}](${fn})\n\n`;
          } else if (canvases.length > 0) {
            canvases.forEach((canvas, idx) => {
              const dataUrl = canvas.toDataURL('image/png');
              const key = `${fn}_page_${idx + 1}.png`;
              window.__mdImageMap[key] = dataUrl;
              md += `![${fn} - Page ${idx + 1}](${key})\n\n`;
            });
          }
        }

        // Description Text Note
        else if (block.classList.contains('exercise-note') && block.classList.contains('desc-text-note')) {
          const text = block.querySelector('.exercise-note-text')?.textContent || '';
          md += `> **Description:**\n> ${text.split('\n').join('\n> ')}\n\n`;
        }

        // Image Description Note
        else if (block.classList.contains('exercise-note') && block.classList.contains('image-description-note')) {
          const fn = block.dataset.fileName || block.querySelector('.fname')?.textContent?.trim() || 'Description_Attachment';
          const imgEl = block.querySelector('img');
          const canvases = Array.from(block.querySelectorAll('.pdf-page-canvas'));

          md += `> **Description Attachment:**\n> \n`;

          if (imgEl && imgEl.src) {
            window.__mdImageMap[fn] = imgEl.src;
            md += `> ![Description Image](${fn})\n\n`;
          } else if (canvases.length > 0) {
            canvases.forEach((canvas, idx) => {
              const dataUrl = canvas.toDataURL('image/png');
              const key = `${fn}_page_${idx + 1}.png`;
              window.__mdImageMap[key] = dataUrl;
              md += `> ![Description PDF - Page ${idx + 1}](${key})\n`;
            });
            md += '\n';
          }
        }

        // Notes Row
        else if (block.classList.contains('ex-notes-row')) {
          const text = block.querySelector('.ex-notes-area')?.value?.trim() || '';
          if (text) {
            md += `> **Notes:**\n> ${text.split('\n').join('\n> ')}\n\n`;
          }
        }

        // Utils Footer
        else if (block.classList.contains('ex-utils-footer')) {
          const chips = Array.from(block.querySelectorAll('.utils-file-chip'));
          const names = chips.map(c => c.dataset.utilsName).filter(Boolean);
          if (names.length > 0) {
            md += `**Utils used:** ${names.map(name => `\`${name}\``).join(', ')}\n\n`;
          }
        }
      }

      md += '---\n\n';
    }

    return md;

  } catch (error) {
    console.error('Markdown export error:', error);
    alert('Failed to export Markdown: ' + (error?.message || 'Unknown error'));
    return '';
  } finally {
    buttons.forEach((btn, i) => {
      btn.disabled = false;
      btn.textContent = originalTexts[i];
    });
  }
}
