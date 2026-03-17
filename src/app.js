import {
  readTextFromFileHandle,
  readExerciseFromDirectoryHandle as readExerciseFromHandleCore,
  loadGeneralExercisesFromDirectoryHandle
} from './core/exercise-loader.js';
import { exportExerciseListPdf } from './core/pdf-export.js';

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 1: CONFIG — default values + user config merge
  ═══════════════════════════════════════════════════════════════════ */
  const DEFAULT_VIEWER_CONFIG = {
    subtitle: '', debug: false,
    ui: {
      pageTitle: 'Report Generator',
      topbar: { useRootFolderName:true, staticPrefixSegments:[], useActiveCategoryAsTail:false, tailLabel:'', separator:' > ' },
      breadcrumb: { homeLabel:'', separator:' > ' },
      text: {
        landingLabel: 'Code Report Viewer',
        landingTitle: 'Lab Report Generator',
        landingDescription: 'Click below and select your project root folder. Everything loads automatically.',
        openProjectButton: 'Open Project Folder',
        browserSupportNote: 'Requires Chrome or Edge — Firefox not supported',
        homeHeroLabel: 'Project Explorer',
        homeHeroTitle: 'Project Folders',
        homeSubtitlePrefix: '//',
        homeSubtitleTemplate: '{count} folder{plural} found in root',
        footer: 'Open your project root folder — Chrome & Edge',
        sharedUtilsNote: 'Shared utils code shown at the bottom of this report.'
      }
    },
    category:      { preferredFolderNames: [] },
    naming:        { labPrefix:'', labSeparator:'', exercisePrefix:'', exerciseSeparator:'', showSubtitleInLabTitle:true },
    paths:         { utilsFolderName: 'utils' },
    labels:        { utilsSectionTitle: 'Shared Utilities', outputLabel: 'OUTPUT' },
    output:        { sectionMarkers: ['=== CUT ==='], fileCandidates: ['output.txt', '*.txt', '*.json', '*.csv'] },
    pdf:           { contentWidthPx:900, viewportWidthPx:960, captureScale:2, pageWidthMm:210, imageQuality:0.95 },
    fileDiscovery: {
      skipCodeFileExtensions: [
        'ilk','pdb','obj','exe','dll','so','dylib','class','jar','zip','7z',
        'mp3','wav','ogg','mp4','mov','avi'
        // NOTE: png/jpg/gif are handled separately as image outputs, not code
      ],
      preferredMainFileBases: ['main']
    }
  };

  function resolveViewerConfig(userConfig) {
    const cfg = userConfig || {};
    return {
      ...DEFAULT_VIEWER_CONFIG, ...cfg,
      category:  { ...DEFAULT_VIEWER_CONFIG.category,  ...(cfg.category  || {}) },
      naming:    { ...DEFAULT_VIEWER_CONFIG.naming,    ...(cfg.naming    || {}) },
      paths:     { ...DEFAULT_VIEWER_CONFIG.paths,     ...(cfg.paths     || {}) },
      labels:    { ...DEFAULT_VIEWER_CONFIG.labels,    ...(cfg.labels    || {}) },
      output:    { ...DEFAULT_VIEWER_CONFIG.output,    ...(cfg.output    || {}) },
      pdf:       { ...DEFAULT_VIEWER_CONFIG.pdf,       ...(cfg.pdf       || {}) },
      fileDiscovery: { ...DEFAULT_VIEWER_CONFIG.fileDiscovery, ...(cfg.fileDiscovery || {}) },
      ui: {
        ...DEFAULT_VIEWER_CONFIG.ui, ...(cfg.ui || {}),
        topbar:    { ...DEFAULT_VIEWER_CONFIG.ui.topbar,    ...((cfg.ui && cfg.ui.topbar)    || {}) },
        breadcrumb:{ ...DEFAULT_VIEWER_CONFIG.ui.breadcrumb,...((cfg.ui && cfg.ui.breadcrumb)|| {}) },
        text:      { ...DEFAULT_VIEWER_CONFIG.ui.text,      ...((cfg.ui && cfg.ui.text)      || {}) }
      }
    };
  }

  const VIEWER_CONFIG = resolveViewerConfig(window.APP_CONFIG);

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 2: APP STATE
     - folderData: scanned project structure (lab mode)
     - generalData: flat file list (general mode)
     - selectedRootHandle: FileSystem API handle (lab mode)
     - selectedGeneralHandle: FileSystem API handle (general mode)
  ═══════════════════════════════════════════════════════════════════ */
  let folderData          = [];
  let selectedCategory    = null;
  let selectedLab         = null;
  let labUtilsRenderPromise = null;
  const sharedUtilsCache  = {};
  let selectedRootHandle  = null;
  let selectedRootName    = '';
  let activeSubtitle      = '';
  let readmeHowToContent  = '';

  // General mode state
  let generalData             = [];
  let selectedGeneralHandle   = null;
  let selectedGeneralRootName = '';
  let coverImageDataUrl       = '';
  let coverLogoDataUrl        = './ITC_logo.png';
  let coverLogoSize           = 120;
  let coverTitleSize          = 28;
  let includeCoverInPdf       = true;
  const coverInfo = {
    topLabel: 'Y2-S2-DATA-STRUCTURE',
    title: 'Institute Technology of Cambodia',
    subtitle: 'Lab Report',
  };
  let coverSections = [
    { label: 'Course', value: 'Course' },
    { label: 'Author', value: 'Author' },
    { label: 'Instructor', value: 'Instructor' },
    { label: 'Date', value: new Date().toLocaleDateString() }
  ];

  function ensureCoverSections() {
    if (!Array.isArray(coverSections)) coverSections = [];
    coverSections = coverSections.map(section => ({
      label: String(section?.label || ''),
      value: String(section?.value || '')
    }));
  };

  // Inline HTML still references selectedCategory in one onclick expression.
  window.selectedCategory = selectedCategory;

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 3: UI UTILITIES — text, breadcrumb, topbar
  ═══════════════════════════════════════════════════════════════════ */

  function escapeHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function getFallbackRootName() {
    const seg = window.location.pathname.replace(/\/+$/,'').split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : '';
  }
  function getResolvedRootLabel()  { return selectedRootName || getFallbackRootName() || ''; }
  function getActiveTopbarTail()   { return VIEWER_CONFIG.ui.topbar.useActiveCategoryAsTail ? (selectedCategory || findPreferredCategoryName(folderData) || '') : (VIEWER_CONFIG.ui.topbar.tailLabel || ''); }
  function getHomeCrumbLabel()     { return VIEWER_CONFIG.ui.breadcrumb.homeLabel || getResolvedRootLabel() || 'Home'; }

  function updateTopbarTitle() {
    const node = document.getElementById('topbar-title');
    if (!node) return;
    const parts = [...(Array.isArray(VIEWER_CONFIG.ui.topbar.staticPrefixSegments) ? VIEWER_CONFIG.ui.topbar.staticPrefixSegments.filter(Boolean) : [])];
    if (VIEWER_CONFIG.ui.topbar.useRootFolderName) parts.push(getResolvedRootLabel());
    parts.push(getActiveTopbarTail());
    node.textContent = parts.filter(Boolean).join(VIEWER_CONFIG.ui.topbar.separator || ' > ');
  }

  function initializeSubtitle()  { activeSubtitle = String(VIEWER_CONFIG.subtitle || '').trim(); }
  function formatLabTitle(name)  { return (VIEWER_CONFIG.naming.showSubtitleInLabTitle && activeSubtitle) ? `${name} · ${activeSubtitle}` : name; }

  function updateStaticUiText() {
    document.title = VIEWER_CONFIG.ui.pageTitle || 'Report Generator';
    const t = VIEWER_CONFIG.ui.text;
    const set = (id, v) => { const n = document.getElementById(id); if (n && typeof v === 'string') n.textContent = v; };
    set('landing-label', t.landingLabel);
    const lt = document.getElementById('landing-title');
    if (lt && typeof t.landingTitle === 'string') lt.innerHTML = t.landingTitle.split(/\r?\n/).map(escapeHtml).join('<br />');
    set('landing-description', t.landingDescription);
    set('open-project-button-text', t.openProjectButton);
    set('browser-support-note', t.browserSupportNote);
    set('home-hero-label', t.homeHeroLabel);
    set('home-hero-title', t.homeHeroTitle);
    set('app-footer', t.footer);
    set('shared-utils-note', t.sharedUtilsNote);
  }

  function renderBreadcrumb(items) {
    const c = document.getElementById('breadcrumb');
    const sep = escapeHtml(VIEWER_CONFIG.ui.breadcrumb.separator || ' > ');
    c.innerHTML = items.map((item, i) => {
      const lbl = escapeHtml(item.label);
      const crumb = item.active ? `<span class="crumb active">${lbl}</span>` : `<span class="crumb" onclick="${item.onClick}">${lbl}</span>`;
      return i === 0 ? crumb : `<span class="sep">${sep}</span>${crumb}`;
    }).join('');
  }

  function activate(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
  function setLoading(pct) {
    const bar = document.getElementById('loading-bar');
    bar.style.width = pct + '%';
    bar.style.opacity = (pct > 0 && pct <= 100) ? '1' : '0';
  }
  function setGlobalHowToVisibility(show) {
    const p = document.getElementById('global-howto-panel');
    if (p) p.style.display = show ? '' : 'none';
  }
  function syncHowToPanels(text) {
    const a = document.getElementById('howto-content');
    const b = document.getElementById('global-howto-content');
    if (a) a.textContent = text;
    if (b) b.textContent = text;
  }

  function setCoverPanelVisible(show) {
    const panel = document.getElementById('global-cover-panel');
    if (!panel) return;
    panel.classList.toggle('show', !!show);
  }

  function syncCoverPreview() {
    ensureCoverSections();
    const setText = (id, value, fallback = '') => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value || fallback || '');
    };

    setText('cover-top-text', coverInfo.topLabel, 'Y2-S2-DATA-STRUCTURE');
    setText('cover-title-text', coverInfo.title, 'Institute Technology of Cambodia');
    setText('cover-subtitle-text', coverInfo.subtitle, 'Lab Report');

    const logoSlot = document.getElementById('cover-logo-slot');
    const card = document.getElementById('cover-card-export');
    if (card) {
      card.style.setProperty('--cover-logo-size', `${coverLogoSize}px`);
      card.style.setProperty('--cover-title-size', `${coverTitleSize}px`);
    }
    const placeholder = document.getElementById('cover-logo-placeholder');
    if (logoSlot) {
      logoSlot.querySelectorAll('img').forEach(node => node.remove());
      if (coverLogoDataUrl) {
        const image = document.createElement('img');
        image.src = coverLogoDataUrl;
        image.alt = 'Cover logo';
        logoSlot.appendChild(image);
        if (placeholder) placeholder.style.display = 'none';
      } else if (placeholder) {
        placeholder.style.display = '';
      }
    }

    const preview = document.getElementById('cover-sections-preview');
    if (!preview) return;
    preview.innerHTML = '';

    const visible = coverSections.filter(row => String(row.label || '').trim() || String(row.value || '').trim());
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'cover-foot-row';
      empty.textContent = 'Add detail rows from the editor.';
      preview.appendChild(empty);
      return;
    }

    visible.forEach(row => {
      const line = document.createElement('div');
      line.className = 'cover-foot-row';
      const label = String(row.label || '').trim();
      const value = String(row.value || '').trim();
      line.textContent = label && value ? `${label}: ${value}` : (label || value);
      preview.appendChild(line);
    });
  }

  function renderCoverSectionsEditor() {
    ensureCoverSections();
    const container = document.getElementById('cover-sections-editor');
    if (!container) return;
    container.innerHTML = '';

    coverSections.forEach((row, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'cover-field-row';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Label';
      labelInput.value = row.label;
      labelInput.addEventListener('input', () => {
        coverSections[index].label = labelInput.value;
        syncCoverPreview();
      });

      const valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.placeholder = 'Value';
      valueInput.value = row.value;
      valueInput.addEventListener('input', () => {
        coverSections[index].value = valueInput.value;
        syncCoverPreview();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.title = 'Remove row';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', () => {
        coverSections.splice(index, 1);
        renderCoverSectionsEditor();
        syncCoverPreview();
      });

      wrap.appendChild(labelInput);
      wrap.appendChild(valueInput);
      wrap.appendChild(removeBtn);
      container.appendChild(wrap);
    });

    if (!coverSections.length) {
      const note = document.createElement('div');
      note.style.fontFamily = 'var(--mono)';
      note.style.fontSize = '11px';
      note.style.color = 'var(--muted)';
      note.textContent = 'No detail rows yet. Click Add Detail Row.';
      container.appendChild(note);
    }
  }

  function addCoverSection() {
    coverSections.push({ label: 'New Label', value: 'New Value' });
    renderCoverSectionsEditor();
    syncCoverPreview();
  }

  async function pickCoverLogo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (!dataUrl) {
        alert('Unable to read selected logo image.');
        return;
      }
      coverLogoDataUrl = dataUrl;
      syncCoverPreview();
    };
    input.click();
  }

  function clearCoverLogo() {
    coverLogoDataUrl = '';
    syncCoverPreview();
  }

  function initCoverEditor() {
    const binding = [
      ['cover-top-input', 'topLabel'],
      ['cover-title-input', 'title'],
      ['cover-subtitle-input', 'subtitle']
    ];

    binding.forEach(([id, key]) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.value = coverInfo[key] || '';
      input.addEventListener('input', () => {
        coverInfo[key] = input.value;
        syncCoverPreview();
      });
    });

    const logoBtn = document.getElementById('cover-logo-btn');
    if (logoBtn) logoBtn.onclick = pickCoverLogo;
    const clearLogoBtn = document.getElementById('cover-logo-clear-btn');
    if (clearLogoBtn) clearLogoBtn.onclick = clearCoverLogo;
    const logoSizeInput = document.getElementById('cover-logo-size-input');
    if (logoSizeInput) {
      logoSizeInput.value = String(coverLogoSize);
      logoSizeInput.addEventListener('input', () => {
        coverLogoSize = Number(logoSizeInput.value) || 72;
        syncCoverPreview();
      });
    }
    const titleSizeInput = document.getElementById('cover-title-size-input');
    if (titleSizeInput) {
      titleSizeInput.value = String(coverTitleSize);
      titleSizeInput.addEventListener('input', () => {
        coverTitleSize = Number(titleSizeInput.value) || 28;
        syncCoverPreview();
      });
    }
    const addSectionBtn = document.getElementById('cover-add-section-btn');
    if (addSectionBtn) addSectionBtn.onclick = addCoverSection;

    renderCoverSectionsEditor();
    syncCoverPreview();
  }

  function updateCoverControls() {
    const addBtn = document.getElementById('add-cover-image-btn');
    const toggleBtn = document.getElementById('toggle-cover-pdf-btn');
    if (!toggleBtn) return;
    toggleBtn.disabled = false;
    const mode = coverImageDataUrl ? 'Image' : 'Default';
    toggleBtn.textContent = `Cover in PDF: ${includeCoverInPdf ? 'On' : 'Off'} (${mode})`;
    if (addBtn) addBtn.textContent = coverImageDataUrl ? 'Replace Cover Image' : 'Add Cover Image';
  }

  async function pickCoverImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (!dataUrl) {
        alert('Unable to read selected image.');
        return;
      }
      coverImageDataUrl = dataUrl;
      includeCoverInPdf = true;
      updateCoverControls();
    };
    input.click();
  }

  function toggleCoverInPdf() {
    includeCoverInPdf = !includeCoverInPdf;
    updateCoverControls();
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 4: SETTINGS PANEL — toggles per view
  ═══════════════════════════════════════════════════════════════════ */

  function toggleSettings(panelId) {
    document.getElementById(panelId).classList.toggle('open');
  }

  /** Read toggle state and show/hide matching block types in an ex-list */
  function applyToggles(mode) {
    const prefix    = mode === 'lab' ? 'tog-lab' : 'tog-gen';
    const listId    = mode === 'lab' ? 'ex-list' : 'general-ex-list';
    const showOut   = document.getElementById(prefix + '-output')?.checked ?? true;
    const showImg   = document.getElementById(prefix + '-images')?.checked ?? true;
    const showEmpty = document.getElementById(prefix + '-empty-output')?.checked ?? true;
    const showDesc  = document.getElementById(prefix + '-desc')?.checked ?? true;
    const showNotes = document.getElementById(prefix + '-notes')?.checked ?? true;
    const showUtils = mode === 'lab' ? (document.getElementById('tog-lab-utils')?.checked ?? true) : true;

    const list = document.getElementById(listId);
    if (!list) return;

    list.querySelectorAll('.output-block').forEach(ob => {
      const isEmpty = ob.querySelector('.output-text')?.textContent.startsWith('No supported') ?? false;
      ob.style.display = (isEmpty ? showEmpty : showOut) ? '' : 'none';
    });
    list.querySelectorAll('.image-block').forEach(ib => { ib.style.display = showImg ? '' : 'none'; });

    // Only toggle auto-extracted desc notes; respect per-note user-hidden flag
    list.querySelectorAll('.exercise-note[data-auto-desc]').forEach(en => {
      en.style.display = (!showDesc || en.dataset.userHidden === '1') ? 'none' : '';
    });

    // Notes textarea rows
    list.querySelectorAll('.ex-notes-row').forEach(nr => { nr.style.display = showNotes ? '' : 'none'; });

    if (mode === 'lab') {
      const utils = document.getElementById('lab-utils');
      if (utils) utils.style.display = showUtils ? '' : 'none';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 5: FILE CLASSIFICATION HELPERS
  ═══════════════════════════════════════════════════════════════════ */

  const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','gif','bmp','webp','svg']);

  function normalizeExtension(fileName) {
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
  }
  function isImageFile(fileName)  { return IMAGE_EXTENSIONS.has(normalizeExtension(fileName)); }
  function isOutputArtifact(fileName) {
    const patterns = (VIEWER_CONFIG.output.fileCandidates || ['output.txt']).filter(Boolean).map(n => String(n).toLowerCase());
    const lower    = String(fileName || '').toLowerCase();
    return patterns.some(p => {
      if (!p.includes('*')) return p === lower;
      return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*') + '$','i').test(lower);
    });
  }
  function isLikelyBinaryName(fileName) {
    return VIEWER_CONFIG.fileDiscovery.skipCodeFileExtensions.includes(normalizeExtension(fileName));
  }
  function isCodeSourceFile(fileName) {
    const ext = normalizeExtension(fileName);
    if (!ext) return false;
    if (isOutputArtifact(fileName)) return false;
    if (isImageFile(fileName)) return false;        // images handled separately
    if (isLikelyBinaryName(fileName)) return false;
    return true;
  }
  function isPrimarySourceFileName(fileName) {
    const dot  = fileName.indexOf('.');
    const base = (dot > -1 ? fileName.slice(0, dot) : fileName).toLowerCase();
    return VIEWER_CONFIG.fileDiscovery.preferredMainFileBases.includes(base);
  }
  function languageClassFromExt(ext) {
    const map = {
      cpp:'language-cpp', cc:'language-cpp', cxx:'language-cpp', c:'language-c',
      h:'language-cpp', hpp:'language-cpp', hxx:'language-cpp',
      java:'language-java', kt:'language-kotlin', kts:'language-kotlin',
      scala:'language-scala', cs:'language-csharp',
      py:'language-python', rb:'language-ruby', php:'language-php',
      sh:'language-bash', bash:'language-bash', ps1:'language-powershell',
      js:'language-javascript', jsx:'language-javascript', mjs:'language-javascript',
      cjs:'language-javascript', ts:'language-typescript', tsx:'language-typescript',
      json:'language-json', html:'language-xml', htm:'language-xml',
      css:'language-css', scss:'language-scss', less:'language-less',
      go:'language-go', rs:'language-rust', swift:'language-swift',
      sql:'language-sql', r:'language-r', lua:'language-lua',
      yaml:'language-yaml', yml:'language-yaml', toml:'language-ini',
      ini:'language-ini', xml:'language-xml', md:'language-markdown', txt:'language-plaintext'
    };
    return map[(ext || '').toLowerCase()] || 'language-plaintext';
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 6: FILESYSTEM SCANNING — FileSystem Access API
     Both lab mode (readExerciseFromDirectoryHandle) and general mode
     (loadGeneralDataFromDirectoryHandle) use readImageFromFileHandle.
  ═══════════════════════════════════════════════════════════════════ */

  const exerciseReadHelpers = {
    isImageFile,
    isOutputArtifact,
    isCodeSourceFile,
    normalizeExtension,
    isPrimarySourceFileName,
    extractReportOutputSections
  };

  async function readExerciseFromDirectoryHandle(exerciseHandle) {
    return readExerciseFromHandleCore(exerciseHandle, exerciseReadHelpers);
  }

  async function readExerciseFromDirectoryHandleWithName(handle, name) {
    const ex = await readExerciseFromHandleCore(handle, exerciseReadHelpers);
    ex.name = name;
    return ex;
  }

  async function scanCategoriesFromDirectoryHandle(rootHandle) {
    const categories = [];
    for await (const entry of rootHandle.values()) {
      if (entry.kind !== 'directory' || entry.name === '.git') continue;
      categories.push({ name: entry.name, labs: await scanLabsFromDirectoryHandle(entry) });
    }
    categories.sort((a, b) => natSort(a.name, b.name));
    return categories;
  }

  async function scanLabsFromDirectoryHandle(categoryHandle) {
    const labs = [];
    const pref = String(VIEWER_CONFIG.naming.labPrefix || '').toLowerCase();
    for await (const entry of categoryHandle.values()) {
      if (entry.kind !== 'directory') continue;
      if (pref && !entry.name.toLowerCase().startsWith(pref)) continue;
      if (!pref && !containsNumber(entry.name)) continue;
      labs.push({ name: entry.name, exercises: await scanExercisesFromDirectoryHandle(entry) });
    }
    labs.sort(compareByDetectedNumberThenName);
    return labs;
  }

  async function scanExercisesFromDirectoryHandle(labHandle) {
    const exercises = [];
    const pref = String(VIEWER_CONFIG.naming.exercisePrefix || '').toLowerCase();
    for await (const entry of labHandle.values()) {
      if (entry.kind !== 'directory') continue;
      if (pref && !entry.name.toLowerCase().startsWith(pref)) continue;
      if (!pref && !containsNumber(entry.name)) continue;
      exercises.push(await readExerciseFromDirectoryHandle(entry));
    }
    exercises.sort(compareByDetectedNumberThenName);
    return exercises;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 7: HTTP FALLBACK SCANNING — for static-server deployments
  ═══════════════════════════════════════════════════════════════════ */

  async function fetchTextFromHttp(path) {
    try { const r = await fetch(path, {cache:'no-store'}); return r.ok ? await r.text() : ''; } catch { return ''; }
  }
  async function listDirectoryNamesFromHttp(path) {
    const html = await fetchTextFromHttp(path.endsWith('/') ? path : `${path}/`);
    return html ? parseDirectoryListingNames(html).directories : [];
  }
  async function listFilesFromHttp(path) {
    const html = await fetchTextFromHttp(path.endsWith('/') ? path : `${path}/`);
    return html ? parseDirectoryListingNames(html).files : [];
  }
  function parseDirectoryListingNames(html) {
    const directories = [], files = [], seenDir = new Set(), seenFile = new Set();
    const re = /href\s*=\s*["']([^"']+)["']/gi; let m;
    while ((m = re.exec(html))) {
      let href = m[1] || '';
      if (!href || href === '/' || href.startsWith('?') || href.startsWith('#')) continue;
      href = href.split('#')[0].split('?')[0];
      try { href = decodeURIComponent(href); } catch {}
      const isDir = href.endsWith('/');
      const base  = href.split('/').filter(Boolean).pop();
      if (!base || base === '.' || base === '..') continue;
      if (isDir) { if (!seenDir.has(base)) { seenDir.add(base); directories.push(base); } }
      else        { if (!seenFile.has(base)){ seenFile.add(base); files.push(base); } }
    }
    directories.sort(natSort); files.sort(natSort);
    return { directories, files };
  }
  function parseDirectoryListingFileNames(html) {
    const out = [], seen = new Set();
    const re  = /href\s*=\s*["']([^"']+)["']/gi; let m;
    while ((m = re.exec(html))) {
      let href = m[1] || '';
      if (!href || href === '/' || href.startsWith('?') || href.startsWith('#')) continue;
      href = href.split('#')[0].split('?')[0];
      try { href = decodeURIComponent(href); } catch {}
      if (href.endsWith('/')) continue;
      const base = href.split('/').pop();
      if (!base || base === '.' || base === '..') continue;
      if (!seen.has(base)) { seen.add(base); out.push(base); }
    }
    return out;
  }

  async function scanCategoriesFromHttp(basePath) {
    const names = (await listDirectoryNamesFromHttp(basePath)).filter(n => n !== '.git');
    if (!names.length) return [];
    const cats = await Promise.all(names.map(async n => ({ name:n, labs: await scanLabsFromHttp(`${basePath}/${encodeURIComponent(n)}`) })));
    cats.sort((a,b) => natSort(a.name, b.name));
    return cats;
  }
  async function scanLabsFromHttp(catPath) {
    const names = await listDirectoryNamesFromHttp(catPath);
    const pref  = String(VIEWER_CONFIG.naming.labPrefix || '').toLowerCase();
    const labNames = pref ? names.filter(n => n.toLowerCase().startsWith(pref)) : names.filter(containsNumber);
    const labs = await Promise.all(labNames.map(async n => ({ name:n, exercises: await scanExercisesFromHttp(`${catPath}/${encodeURIComponent(n)}`) })));
    labs.sort(compareByDetectedNumberThenName);
    return labs;
  }
  async function scanExercisesFromHttp(labPath) {
    const names = await listDirectoryNamesFromHttp(labPath);
    const pref  = String(VIEWER_CONFIG.naming.exercisePrefix || '').toLowerCase();
    const exNames = pref ? names.filter(n => n.toLowerCase().startsWith(pref)) : names.filter(containsNumber);
    const exercises = await Promise.all(exNames.map(async name => {
      const exPath = `${labPath}/${encodeURIComponent(name)}`;
      const fileNames = await listFilesFromHttp(exPath);
      const files = [], outputSectionsCache = [], imageEntries = [];
      for (const fn of fileNames) {
        if (isImageFile(fn)) { /* HTTP image loading skipped — use FileSystem API */ continue; }
        if (!isCodeSourceFile(fn) && !isOutputArtifact(fn)) continue;
        const content = await fetchTextFromHttp(`${exPath}/${encodeURIComponent(fn)}`);
        if (!content || content.includes('\u0000')) continue;
        if (isOutputArtifact(fn)) {
          const sections = extractReportOutputSections(content);
          if (sections.length) outputSectionsCache.push({ fileName:fn, sections });
        } else {
          files.push({ name:fn, ext:normalizeExtension(fn), main:isPrimarySourceFileName(fn), content });
        }
      }
      files.sort((a,b) => (b.main?1:0)-(a.main?1:0) || natSort(a.name,b.name));
      return { name, files, images:imageEntries, outputSectionsCache };
    }));
    exercises.sort(compareByDetectedNumberThenName);
    return exercises;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 8: PROJECT OPEN — lab mode entry point
  ═══════════════════════════════════════════════════════════════════ */

  async function openLabFolder() {
    if (!window.showDirectoryPicker) { alert('Use Chrome or Edge — folder picker not supported here.'); return; }
    try {
      const handle = await window.showDirectoryPicker();
      selectedRootHandle = handle;
      selectedRootName   = handle.name || '';
      updateTopbarTitle();
      await loadFolderDataFromDirectoryHandle(handle);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      alert(`Unable to open folder: ${err?.message || 'Unknown error'}`);
    }
  }

  async function rescan() {
    if (selectedRootHandle) { await loadFolderDataFromDirectoryHandle(selectedRootHandle); return; }
    await openLabFolder();
  }

  async function loadFolderDataFromDirectoryHandle(rootHandle) {
    setLoading(10);
    Object.keys(sharedUtilsCache).forEach(k => delete sharedUtilsCache[k]);
    await loadReadmeHowTo();
    folderData = await scanCategoriesFromDirectoryHandle(rootHandle);
    setLoading(100);
    setTimeout(() => setLoading(0), 350);
    if (!folderData.length) { alert(`No folder/lab structure found in "${selectedRootName || 'selected folder'}".`); showHome(); renderHome(); return; }
    renderHome();
    const pref = findPreferredCategoryName(folderData);
    if (pref) showCategory(pref); else showHome();
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 9: GENERAL MODE — open any folder flat or subfolder-per-card
  ═══════════════════════════════════════════════════════════════════ */

  async function openGeneralFolder() {
    if (!window.showDirectoryPicker) { alert('Use Chrome or Edge.'); return; }
    try {
      const handle = await window.showDirectoryPicker();
      selectedGeneralHandle   = handle;
      selectedGeneralRootName = handle.name || '';
      await loadGeneralDataFromDirectoryHandle(handle);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      alert(`Unable to open folder: ${err?.message || 'Unknown error'}`);
    }
  }

  async function loadGeneralDataFromDirectoryHandle(rootHandle) {
    setLoading(10);
    generalData = await loadGeneralExercisesFromDirectoryHandle(rootHandle, {
      rootName: selectedGeneralRootName,
      setProgress: setLoading,
      readExercise: (handle, nameOverride) => readExerciseFromDirectoryHandleWithName(handle, nameOverride)
    });

    setLoading(100);
    setTimeout(() => setLoading(0), 350);
    renderGeneral();
    showGeneral();
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 10: RENDERING — home, category, lab, general
  ═══════════════════════════════════════════════════════════════════ */

  function renderHome() {
    const grid = document.getElementById('lab-grid');
    grid.innerHTML = '';
    const pref   = VIEWER_CONFIG.ui.text.homeSubtitlePrefix || '//';
    const tmpl   = VIEWER_CONFIG.ui.text.homeSubtitleTemplate || '{count} folder{plural} found in root';
    document.getElementById('home-sub').textContent = `${pref} ${tmpl.replace('{count}', folderData.length).replace('{plural}', folderData.length !== 1 ? 's' : '')}`;

    folderData.forEach(folder => {
      const n    = folder.labs.length;
      const card = document.createElement('div');
      card.className = 'lab-card';
      card.innerHTML = `
        <span class="folder-icon">📁</span>
        <h2>${escapeHtml(folder.name)}</h2>
        <div class="meta">${n} lab${n !== 1 ? 's' : ''}</div>
        <span class="badge${n === 0 ? ' empty' : ''}">${n > 0 ? 'populated' : 'empty'}</span>
        <div class="card-actions">
          <button class="card-btn" data-action="exercises">Open as exercises</button>
        </div>`;
      card.onclick = () => showCategory(folder.name);
      card.querySelector('[data-action="exercises"]').onclick = ev => { ev.stopPropagation(); showCategory(folder.name); };
      grid.appendChild(card);
    });
  }

  function renderCategory(folderName) {
    const folder = folderData.find(f => f.name === folderName);
    if (!folder) return;
    document.getElementById('category-title').textContent = folder.name;
    document.getElementById('category-tag').textContent   = `${folder.labs.length} labs`;
    const grid = document.getElementById('category-lab-grid');
    grid.innerHTML = '';
    if (!folder.labs.length) {
      grid.innerHTML = `<div class="empty-card"><div class="big">📂</div>No numbered lab folders found in ${escapeHtml(folder.name)}</div>`;
      return;
    }
    folder.labs.forEach(lab => {
      const n    = lab.exercises.length;
      const card = document.createElement('div');
      card.className = 'lab-card';
      card.innerHTML = `<span class="folder-icon">🧪</span><h2>${escapeHtml(lab.name)}</h2><div class="meta">${n} exercise${n !== 1 ? 's' : ''}</div><span class="badge${n === 0 ? ' empty' : ''}">${n > 0 ? 'populated' : 'empty'}</span>`;
      card.onclick = () => showLab(lab.name);
      grid.appendChild(card);
    });
  }

  function renderLab(labName) {
    if (!selectedCategory) return;
    const folder = folderData.find(f => f.name === selectedCategory);
    const lab    = folder?.labs.find(l => l.name === labName);
    if (!lab) return;

    document.getElementById('lab-title').textContent = formatLabTitle(lab.name);
    document.getElementById('lab-tag').textContent   = `${lab.exercises.length} exercises`;

    const list     = document.getElementById('ex-list');
    const utilsRoot= document.getElementById('lab-utils');
    list.innerHTML = ''; utilsRoot.innerHTML = '';

    if (!lab.exercises.length) {
      list.innerHTML = `<div class="empty-card"><div class="big">📂</div>No supported files found in ${escapeHtml(lab.name)}</div>`;
    } else {
      lab.exercises.forEach((ex, idx) => {
        const item = buildExerciseItem(ex, idx);
        // lab mode populates body via populateBody (async hydration + fetch)
        item.querySelector('.ex-header').onclick = e => {
          if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
          item.classList.toggle('open');
          if (item.classList.contains('open')) populateBody(item.querySelector('.ex-body'), ex);
        };
        list.appendChild(item);
      });
      initDragSort(list);
    }
    labUtilsRenderPromise = renderLabUtilsSection();
  }

  function renderGeneral() {
    const list = document.getElementById('general-ex-list');
    list.innerHTML = '';
    document.getElementById('general-title').textContent = selectedGeneralRootName || 'Files';
    document.getElementById('general-tag').textContent   = `${generalData.length} item${generalData.length !== 1 ? 's' : ''}`;
    setElementDisplay('export-general-pdf-btn', '');

    if (!generalData.length) {
      list.innerHTML = `<div class="empty-card"><div class="big">📂</div>No code files found in this folder.</div>`;
      return;
    }
    generalData.forEach((ex, idx) => {
      const item = buildExerciseItem(ex, idx);
      item.querySelector('.ex-header').onclick = e => {
        if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
        item.classList.toggle('open');
        if (item.classList.contains('open')) populateBodyGeneral(item.querySelector('.ex-body'), ex);
      };
      list.appendChild(item);
    });
    initDragSort(list);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 11: EXERCISE ITEM BUILDER — shared by lab + general
  ═══════════════════════════════════════════════════════════════════ */

  function buildExerciseItem(ex, idx) {
    const num      = ex.name.replace(/\D/g, '') || String(idx + 1);
    const fileMeta = `${ex.files.length} file${ex.files.length !== 1 ? 's' : ''}`;
    const item     = document.createElement('div');
    item.className       = 'ex-item';
    item.draggable       = true;
    item.dataset.exName  = ex.name;
    item.innerHTML = `
      <div class="ex-header">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <div class="ex-num">${escapeHtml(num)}</div>
        <input class="ex-title-input" type="text" value="${escapeHtml(ex.name)}" title="Click to rename" />
        <span class="ex-meta">${escapeHtml(fileMeta)}</span>
        <button class="ex-delete-btn" title="Remove this card">✕</button>
        <span class="ex-chevron">▶</span>
      </div>
      <div class="ex-body"></div>`;

    const titleInput = item.querySelector('.ex-title-input');
    titleInput.addEventListener('click', e => e.stopPropagation());
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') titleInput.blur(); });
    titleInput.addEventListener('change', () => {
      const v = titleInput.value.trim();
      if (v) { ex.name = v; item.dataset.exName = v; } else titleInput.value = ex.name;
    });

    item.querySelector('.ex-delete-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Remove "${ex.name}"?`)) item.remove();
    });

    return item;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 12: BODY POPULATION — builds code/output/image blocks
  ═══════════════════════════════════════════════════════════════════ */

  /** Lab mode: async — may hydrate via HTTP fetch, then renders */
  function populateBody(body, ex) {
    if (body.dataset.loaded === '1') return Promise.resolve();
    if (body._loadPromise) return body._loadPromise;

    body._loadPromise = (async () => {
      body.dataset.loading = '1';
      await hydrateExerciseFiles(ex);

      // Descriptions are now embedded per-file inside each code-with-desc wrapper.
      const outputEntries = await fetchExerciseOutputSections(ex);
      renderBodyContents(body, ex, outputEntries);

      body.dataset.loaded   = '1';
      delete body.dataset.loading;
      body._loadPromise = null;
    })();
    return body._loadPromise;
  }

  /** General mode: synchronous — data already loaded from FileSystem API */
  function populateBodyGeneral(body, ex) {
    if (body.dataset.loaded === '1') return;
    body.dataset.loaded = '1';
    const outputEntries = normalizeOutputEntries(ex.outputSectionsCache || []);
    renderBodyContents(body, ex, outputEntries);
  }

  /** Helper: build an auto-extracted description note element */
  function buildAutoDescNote(desc, userHidden) {
    const note = document.createElement('div');
    note.className = 'exercise-note';
    note.dataset.autoDesc = '1';
    if (userHidden) { note.dataset.userHidden = '1'; note.style.display = 'none'; }
    note.innerHTML = '<div class="exercise-note-head">Exercise Description <button class="desc-toggle-btn" title="Hide/show this description">✕</button></div><pre class="exercise-note-text"></pre>';
    note.querySelector('.exercise-note-text').textContent = desc;
    note.querySelector('.desc-toggle-btn').addEventListener('click', e => {
      e.stopPropagation();
      const hidden = note.dataset.userHidden === '1';
      note.style.display = hidden ? '' : 'none';
      note.dataset.userHidden = hidden ? '0' : '1';
      // Update ✕ label
      e.target.textContent = hidden ? '✕' : '↩';
      e.target.title = hidden ? 'Hide this description' : 'Show this description';
    });
    return note;
  }

  /**
   * renderBodyContents — the single renderer used by BOTH lab and general mode.
   * Appends: code blocks → output blocks → image blocks
   * Then wires up file-level drag-sort within the body.
   */
  function renderBodyContents(body, ex, outputEntries) {
    // Code files — each wrapped in code-with-desc (desc note + code block)
    ex.files.forEach(f => body.appendChild(buildCodeBlock(f, ex)));

    // Text/CSV/JSON outputs
    if (!outputEntries || !outputEntries.length) {
      body.appendChild(buildEmptyOutputBlock());
    } else {
      outputEntries.forEach(entry => {
        (entry.sections || []).forEach((section, i) =>
          body.appendChild(buildOutputBlock(entry.fileName, section, i, entry.sections.length))
        );
      });
    }

    // Image outputs (png / jpg / gif)
    (ex.images || []).forEach(img => body.appendChild(buildImageBlock(img.fileName, img.dataUrl)));

    initFileDragSort(body);

    // Notes textarea
    const notesRow = document.createElement('div');
    notesRow.className = 'ex-notes-row';
    const ta = document.createElement('textarea');
    ta.className = 'ex-notes-area';
    ta.placeholder = 'Add notes for this exercise (shown in PDF if filled in)…';
    ta.value = ex._notes || '';
    ta.addEventListener('input', () => { ex._notes = ta.value; });
    notesRow.appendChild(ta);
    body.appendChild(notesRow);

    // Add file / add image buttons
    const addRow = document.createElement('div');
    addRow.className = 'ex-add-row';
    const addFileBtn = document.createElement('button');
    addFileBtn.className = 'add-file-btn';
    addFileBtn.innerHTML = '＋ Add File';
    addFileBtn.title = 'Add code/text files';
    addFileBtn.onclick = e => { e.stopPropagation(); pickAndAddFiles(body, ex, addRow); };
    const addImgBtn = document.createElement('button');
    addImgBtn.className = 'add-image-btn';
    addImgBtn.innerHTML = '＋ Add Image';
    addImgBtn.title = 'Add image files';
    addImgBtn.onclick = e => { e.stopPropagation(); pickAndAddImages(body, ex, addRow); };
    addRow.appendChild(addFileBtn);
    addRow.appendChild(addImgBtn);
    body.appendChild(addRow);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 13: BLOCK BUILDERS — code, output, image
  ═══════════════════════════════════════════════════════════════════ */

  /**
   * buildCodeBlock — returns a .code-with-desc wrapper:
   *   [auto-desc note if f.main & has comment]  +  inner .code-block
   * Both travel together when dragged.
   */
  function buildCodeBlock(f, ex) {
    const wrap = document.createElement('div');
    wrap.className         = 'code-with-desc';
    wrap.draggable         = true;
    wrap.dataset.blockType = 'code';
    wrap.dataset.fileName  = f.name;

    // Desc note above (only for main files that have a block comment)
    refreshDescNoteInWrap(wrap, f);

    const displayContent = f.main ? stripLeadingBlockComment(f.content) : f.content;
    const cb = document.createElement('div');
    cb.className    = 'code-block';
    cb.dataset.codeInner = '1';
    cb.innerHTML = `
      <div class="code-header">
        <span class="file-drag-handle" title="Drag to reorder">⠿</span>
        <div class="code-dot${f.main ? ' main-dot' : ''}"></div>
        <span class="fname">${escapeHtml(f.name)}</span>
        ${f.main ? '<span class="main-tag" data-maintag>main</span>' : `<span class="ext-tag" data-exttag>.${escapeHtml(f.ext)}</span>`}
      </div>
      <pre><code class="${languageClassFromExt(f.ext)}"></code></pre>`;
    wrap.appendChild(cb);

    const header   = cb.querySelector('.code-header');
    const codeNode = cb.querySelector('code');
    codeNode.textContent = displayContent;
    addCopyButton(header, () => codeNode.textContent);
    if (ex) addMarkMainButton(header, f, wrap, ex);
    // Remove-block button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-block-btn';
    removeBtn.title = 'Remove this file block';
    removeBtn.textContent = '✕';
    removeBtn.onclick = e => {
      e.stopPropagation();
      if (ex) { const i = ex.files.indexOf(f); if (i > -1) ex.files.splice(i, 1); updateFileCount(wrap, ex); }
      wrap.remove();
    };
    header.appendChild(removeBtn);
    if (window.hljs) window.hljs.highlightElement(codeNode);
    return wrap;
  }

  /** Create/update/remove the auto-desc note inside a code-with-desc wrapper */
  function refreshDescNoteInWrap(wrap, f) {
    const existing = wrap.querySelector('.exercise-note[data-auto-desc]');
    const desc = (f.main && f.content) ? extractDescFromFile(f) : '';
    if (desc) {
      if (existing) {
        existing.querySelector('.exercise-note-text').textContent = desc;
        if (existing.dataset.userHidden !== '1') existing.style.display = '';
      } else {
        wrap.insertBefore(buildAutoDescNote(desc, false), wrap.firstChild);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  /** Extract leading block-comment text from a file object */
  function extractDescFromFile(f) {
    if (!f?.content) return '';
    const m = f.content.match(/\/\*([\s\S]*?)\*\//);
    if (!m) return '';
    return m[1].split('\n').map(l => l.replace(/^\s*\*\s?/,'').trimEnd()).join('\n').trim();
  }

  /** Update the file-count meta badge on the exercise header */
  function updateFileCount(blockEl, ex) {
    const item = blockEl.closest('.ex-item');
    if (!item || !ex) return;
    const meta = item.querySelector('.ex-meta');
    if (meta) meta.textContent = `${ex.files.length} file${ex.files.length !== 1 ? 's' : ''}`;
  }

  function buildOutputBlock(fileName, section, index, totalSections) {
    const ob = document.createElement('div');
    ob.className        = 'output-block';
    ob.draggable        = true;
    ob.dataset.blockType= 'output';
    ob.innerHTML = `
      <div class="out-header">
        <span class="file-drag-handle" title="Drag to reorder">⠿</span>
        <div class="out-dot"></div>
        <span class="fname">${escapeHtml(fileName)}${totalSections > 1 ? ` · section ${index + 1}` : ''}</span>
        <span class="out-label">${VIEWER_CONFIG.labels.outputLabel}</span>
      </div>
      <div class="output-content"></div>`;
    renderOutputSectionContent(ob.querySelector('.output-content'), fileName, section);
    addRemoveBlockBtn(ob.querySelector('.out-header'), ob);
    return ob;
  }

  function buildEmptyOutputBlock() {
    const ob = document.createElement('div');
    ob.className        = 'output-block';
    ob.draggable        = true;
    ob.dataset.blockType= 'output';
    ob.innerHTML = `
      <div class="out-header">
        <span class="file-drag-handle" title="Drag to reorder">⠿</span>
        <div class="out-dot"></div>
        <span class="fname">output</span>
        <span class="out-label">${VIEWER_CONFIG.labels.outputLabel}</span>
      </div>
      <pre class="output-text">No supported text file found for this exercise (.txt, .json, .csv).</pre>`;
    addRemoveBlockBtn(ob.querySelector('.out-header'), ob);
    return ob;
  }

  /** Builds an image output block from a pre-loaded data-URL */
  function buildImageBlock(fileName, dataUrl) {
    const ib = document.createElement('div');
    ib.className        = 'image-block';
    ib.draggable        = true;
    ib.dataset.blockType= 'image';
    ib.innerHTML = `
      <div class="image-header">
        <span class="file-drag-handle" title="Drag to reorder">⠿</span>
        <div class="image-dot"></div>
        <span class="fname">${escapeHtml(fileName)}</span>
        <span class="image-label">IMAGE</span>
      </div>
      <div class="image-content"><img src="${dataUrl}" alt="${escapeHtml(fileName)}" loading="lazy" /></div>`;
    addRemoveBlockBtn(ib.querySelector('.image-header'), ib);
    return ib;
  }

  function addRemoveBlockBtn(header, blockEl) {
    if (!header) return;
    const btn = document.createElement('button');
    btn.className = 'remove-block-btn';
    btn.title = 'Remove this block';
    btn.textContent = '✕';
    btn.onclick = e => { e.stopPropagation(); blockEl.remove(); };
    header.appendChild(btn);
  }

  function appendHighlightedCodeBlock(parent, file, isMainFile) {
    // Used for shared utils section — no mark-main (ex = null)
    parent.appendChild(buildCodeBlock({ ...file, main: isMainFile }, null));
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 14: COPY BUTTON
  ═══════════════════════════════════════════════════════════════════ */

  function addCopyButton(header, getCode) {
    const btn = document.createElement('button');
    btn.className   = 'copy-btn';
    btn.textContent = 'copy';
    btn.onclick = e => {
      e.stopPropagation();
      navigator.clipboard.writeText(getCode()).then(() => {
        btn.textContent = 'copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1800);
      }).catch(() => {});
    };
    header.appendChild(btn);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 15: MARK-AS-MAIN BUTTON
     Lets users override auto-detected main file per exercise.
  ═══════════════════════════════════════════════════════════════════ */

  function addMarkMainButton(header, f, wrapEl, ex) {
    const btn = document.createElement('button');
    btn.className   = 'mark-main-btn' + (f.main ? ' is-main' : '');
    btn.title       = f.main ? 'Unmark as main' : 'Mark as main file';
    btn.textContent = f.main ? '★ main' : '☆ main';
    // No exclusivity — multiple files can be marked main simultaneously
    btn.onclick = e => {
      e.stopPropagation();
      f.main = !f.main;
      syncMainUI(wrapEl, f, f.main);
    };
    header.appendChild(btn);
  }

  /**
   * syncMainUI — update one code-with-desc wrapper after its main flag changes.
   * wrapEl: the .code-with-desc element; f: file data; isMain: new value.
   */
  function syncMainUI(wrapEl, f, isMain) {
    f.main = isMain;
    const cb      = wrapEl.querySelector('.code-block');
    const dot     = cb?.querySelector('.code-dot');
    const btn     = cb?.querySelector('.mark-main-btn');
    const mainTag = cb?.querySelector('[data-maintag]');
    const extTag  = cb?.querySelector('[data-exttag]');

    if (dot) dot.className = 'code-dot' + (isMain ? ' main-dot' : '');
    if (btn) {
      btn.textContent = isMain ? '★ main' : '☆ main';
      btn.className   = 'mark-main-btn' + (isMain ? ' is-main' : '');
      btn.title       = isMain ? 'Unmark as main' : 'Mark as main file';
    }
    if (isMain && !mainTag && extTag) {
      extTag.removeAttribute('data-exttag'); extTag.className = 'main-tag';
      extTag.setAttribute('data-maintag',''); extTag.textContent = 'main';
    } else if (!isMain && !extTag && mainTag) {
      mainTag.removeAttribute('data-maintag'); mainTag.className = 'ext-tag';
      mainTag.setAttribute('data-exttag',''); mainTag.textContent = '.' + f.ext;
    }

    const codeNode = cb?.querySelector('code');
    if (codeNode) {
      // Remove hljs "already highlighted" marker so colours are restored
      codeNode.removeAttribute('data-highlighted');
      codeNode.textContent = isMain ? stripLeadingBlockComment(f.content) : f.content;
      if (window.hljs) window.hljs.highlightElement(codeNode);
    }

    // Refresh description note inside this wrapper
    refreshDescNoteInWrap(wrapEl, f);

    // Honour the current global desc toggle
    const body   = wrapEl.closest('.ex-body');
    const listEl = body?.closest('#ex-list, #general-ex-list');
    const mode   = listEl?.id === 'ex-list' ? 'lab' : 'general';
    const togId  = mode === 'lab' ? 'tog-lab-desc' : 'tog-gen-desc';
    const showDesc = document.getElementById(togId)?.checked ?? true;
    const note   = wrapEl.querySelector('.exercise-note[data-auto-desc]');
    if (note && !showDesc) note.style.display = 'none';
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 16: DRAG SORT
     initDragSort    — exercise-level (reorder exercise cards)
     initFileDragSort — file-level (reorder blocks inside one exercise body)
  ═══════════════════════════════════════════════════════════════════ */

  function initDragSort(list) {
    let src = null;

    list.addEventListener('dragstart', e => {
      const item = e.target.closest('.ex-item');
      if (!item) return;
      src = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragend', () => {
      list.querySelectorAll('.dragging').forEach(i => i.classList.remove('dragging'));
      list.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
      src = null;
    });
    list.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.ex-item');
      if (!target || target === src) return;
      list.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
      target.classList.add('drag-over');
    });
    list.addEventListener('dragleave', e => { const t = e.target.closest('.ex-item'); if (t) t.classList.remove('drag-over'); });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('.ex-item');
      if (!target || target === src || !src) return;
      target.classList.remove('drag-over');
      const items  = Array.from(list.querySelectorAll('.ex-item'));
      const srcIdx = items.indexOf(src);
      const tgtIdx = items.indexOf(target);
      list.insertBefore(src, srcIdx < tgtIdx ? target.nextSibling : target);
      // Re-number badges
      Array.from(list.querySelectorAll('.ex-item')).forEach((el, i) => {
        const b = el.querySelector('.ex-num'); if (b) b.textContent = String(i + 1);
      });
      src = null;
    });
  }

  function initFileDragSort(body) {
    let src = null;
    const DRAG_SEL  = '.code-with-desc[draggable],.output-block[draggable],.image-block[draggable]';
    const HOVER_SEL = '.code-with-desc,.output-block,.image-block';

    body.addEventListener('dragstart', e => {
      const block = e.target.closest(DRAG_SEL);
      if (!block) return;
      src = block; block.classList.add('file-dragging'); e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    }, true);
    body.addEventListener('dragend', () => {
      body.querySelectorAll('.file-dragging').forEach(b => b.classList.remove('file-dragging'));
      body.querySelectorAll('.file-drag-over').forEach(b => b.classList.remove('file-drag-over'));
      src = null;
    }, true);
    body.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      const block = e.target.closest(HOVER_SEL);
      if (!block || block === src) return;
      body.querySelectorAll('.file-drag-over').forEach(b => b.classList.remove('file-drag-over'));
      block.classList.add('file-drag-over');
    }, true);
    body.addEventListener('dragleave', e => {
      const block = e.target.closest(HOVER_SEL);
      if (block) block.classList.remove('file-drag-over');
      e.stopPropagation();
    }, true);
    body.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const target = e.target.closest(HOVER_SEL);
      if (!target || target === src || !src) return;
      target.classList.remove('file-drag-over');
      const blocks = Array.from(body.querySelectorAll(HOVER_SEL));
      const si = blocks.indexOf(src), ti = blocks.indexOf(target);
      body.insertBefore(src, si < ti ? target.nextSibling : target);
      src = null;
    }, true);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 17: COLLAPSE / EXPAND ALL
  ═══════════════════════════════════════════════════════════════════ */

  function collapseAll(listId) {
    document.querySelectorAll(`#${listId} .ex-item`).forEach(i => i.classList.remove('open'));
  }

  function expandAll(listId, mode) {
    document.querySelectorAll(`#${listId} .ex-item`).forEach(item => {
      item.classList.add('open');
      const body   = item.querySelector('.ex-body');
      const exName = item.dataset.exName;
      if (mode === 'lab') {
        const lab = getCurrentLab();
        const ex  = lab?.exercises.find(e => e.name === exName);
        if (ex) populateBody(body, ex);
      } else {
        const ex = generalData.find(e => e.name === exName);
        if (ex) populateBodyGeneral(body, ex);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 18: NAVIGATION — show/hide views
  ═══════════════════════════════════════════════════════════════════ */

  function setElementDisplay(id, displayValue) {
    const element = document.getElementById(id);
    if (element) element.style.display = displayValue;
  }

  function showLanding() {
    activate('view-landing');
    setCoverPanelVisible(false);
    setGlobalHowToVisibility(false);
    setElementDisplay('export-pdf-btn', 'none');
    renderBreadcrumb([{ label:getHomeCrumbLabel(), active:true }]);
    updateTopbarTitle();
  }
  function showHome() {
    activate('view-home');
    setCoverPanelVisible(false);
    setGlobalHowToVisibility(true);
    setElementDisplay('export-pdf-btn', 'none');
    renderBreadcrumb([{ label:getHomeCrumbLabel(), active:true }]);
    updateTopbarTitle();
  }
  function showCategory(name) {
    selectedCategory = name; selectedLab = null;
    window.selectedCategory = selectedCategory;
    renderCategory(name); activate('view-category');
    setCoverPanelVisible(false);
    setGlobalHowToVisibility(true);
    setElementDisplay('export-pdf-btn', 'none');
    renderBreadcrumb([
      { label:getHomeCrumbLabel(), onClick:'showHome()', active:false },
      { label:name, active:true }
    ]);
    updateTopbarTitle();
    window.scrollTo({ top:0, behavior:'smooth' });
  }
  function showLab(name) {
    selectedLab = name;
    renderLab(name); activate('view-lab');
    setCoverPanelVisible(true);
    if (!coverInfo.title) {
      coverInfo.title = formatLabTitle(name);
      const inp = document.getElementById('cover-title-input');
      if (inp) inp.value = coverInfo.title;
      syncCoverPreview();
    }
    setGlobalHowToVisibility(true);
    setElementDisplay('export-pdf-btn', '');
    renderBreadcrumb([
      { label:getHomeCrumbLabel(), onClick:'showHome()', active:false },
      { label:selectedCategory, onClick:`showCategory('${selectedCategory.replace(/'/g,"\\'")}')`, active:false },
      { label:name, active:true }
    ]);
    updateTopbarTitle();
    window.scrollTo({ top:0, behavior:'smooth' });
  }
  function showGeneral() {
    activate('view-general');
    setCoverPanelVisible(true);
    if (!coverInfo.title) {
      coverInfo.title = selectedGeneralRootName || 'General Report';
      const inp = document.getElementById('cover-title-input');
      if (inp) inp.value = coverInfo.title;
      syncCoverPreview();
    }
    setGlobalHowToVisibility(false);
    setElementDisplay('export-pdf-btn', 'none');
    renderBreadcrumb([
      { label:getHomeCrumbLabel(), onClick:'showLanding()', active:false },
      { label:selectedGeneralRootName || 'General', active:true }
    ]);
    updateTopbarTitle();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 19: OUTPUT DATA — fetch, normalise, render to DOM
  ═══════════════════════════════════════════════════════════════════ */

  async function fetchExerciseOutputSections(ex) {
    // Data already attached by FileSystem API scan
    if (Object.prototype.hasOwnProperty.call(ex, 'outputSectionsCache')) {
      return normalizeOutputEntries(ex.outputSectionsCache);
    }
    // HTTP fallback
    const baseDir = `${selectedCategory}/${selectedLab}/${ex.name}/`;
    try {
      const res = await fetch(baseDir, { cache:'no-store' });
      if (res.ok) {
        const html = await res.text();
        const entries = [];
        for (const fn of parseDirectoryListingFileNames(html).filter(n => isOutputArtifact(n))) {
          try {
            const r = await fetch(`${baseDir}${encodeURIComponent(fn)}`, { cache:'no-store' });
            if (!r.ok) continue;
            const secs = extractReportOutputSections(await r.text());
            if (secs.length) entries.push({ fileName:fn, sections:secs });
          } catch {}
        }
        ex.outputSectionsCache = entries;
        return entries;
      }
    } catch {}
    // Final fallback: probe named candidates
    const fallback = [];
    for (const candidate of VIEWER_CONFIG.output.fileCandidates) {
      if (String(candidate).includes('*')) continue;
      try {
        const r = await fetch(`${baseDir}${encodeURIComponent(candidate)}`, { cache:'no-store' });
        if (!r.ok) continue;
        const secs = extractReportOutputSections(await r.text());
        if (secs.length) fallback.push({ fileName:String(candidate), sections:secs });
      } catch {}
    }
    ex.outputSectionsCache = fallback;
    return fallback;
  }

  function normalizeOutputEntries(entries) {
    if (!Array.isArray(entries) || !entries.length) return [];
    if (typeof entries[0] === 'string') return [{ fileName:'output.txt', sections:entries.filter(Boolean) }];
    return entries.filter(e => e && typeof e.fileName === 'string' && Array.isArray(e.sections))
                  .map(e => ({ fileName:e.fileName, sections:e.sections.filter(Boolean) }))
                  .filter(e => e.sections.length > 0);
  }

  function renderOutputSectionContent(container, fileName, sectionText) {
    if (!container) return;
    if (normalizeExtension(fileName) === 'csv') {
      const rows = parseCsvRows(sectionText);
      if (rows.length) {
        const wrap  = document.createElement('div'); wrap.className = 'output-table-wrap';
        const table = document.createElement('table'); table.className = 'output-table';
        const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
        const norm    = rows.map(r => r.length >= maxCols ? r : r.concat(Array(maxCols - r.length).fill('')));
        const [hdr, ...body] = norm;
        if (hdr) { const thead = document.createElement('thead'), tr = document.createElement('tr'); hdr.forEach(v => { const th = document.createElement('th'); th.textContent = v; tr.appendChild(th); }); thead.appendChild(tr); table.appendChild(thead); }
        const tbody = document.createElement('tbody');
        body.forEach(row => { const tr = document.createElement('tr'); row.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }); tbody.appendChild(tr); });
        table.appendChild(tbody); wrap.appendChild(table); container.appendChild(wrap);
        return;
      }
    }
    const pre = document.createElement('pre'); pre.className = 'output-text'; pre.textContent = sectionText; container.appendChild(pre);
  }

  function extractReportOutputSections(rawText) {
    if (!rawText) return [];
    const markers = (VIEWER_CONFIG.output.sectionMarkers || []).filter(Boolean);
    if (!markers.length) { const c = stripTerminalNoise(rawText); return c ? [c] : []; }
    const rx = new RegExp(`(?:^|\\r?\\n)(?:${markers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?=\\r?\\n|$)`,'g');
    return rawText.split(rx).map(stripTerminalNoise).filter(Boolean);
  }
  function stripTerminalNoise(text) {
    return text.split(/\r?\n/).filter(l => {
      const t = l.trim();
      if (!t) return true;
      if (/^[A-Za-z]:\\.*\.exe\s+\(process\s+\d+\)\s+exited\s+with\s+code/i.test(t)) return false;
      if (/^Press any key to close this window/i.test(t)) return false;
      return true;
    }).join('\n').replace(/^\s+|\s+$/g,'');
  }

  function parseCsvRows(text) {
    const src = String(text || '').replace(/^\uFEFF/,'');
    if (!src.trim()) return [];
    const rows = []; let row = [], cell = '', i = 0, inQ = false;
    while (i < src.length) {
      const ch = src[i];
      if (inQ) { if (ch === '"') { if (src[i+1] === '"') { cell += '"'; i += 2; continue; } inQ = false; i++; continue; } cell += ch; i++; continue; }
      if (ch === '"')  { inQ = true; i++; continue; }
      if (ch === ',')  { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i+1] === '\n') i++;
        row.push(cell); if (row.some(v => String(v).trim())) rows.push(row);
        row = []; cell = ''; i++; continue;
      }
      cell += ch; i++;
    }
    row.push(cell); if (row.some(v => String(v).trim())) rows.push(row);
    return rows;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 20: HTTP FILE HYDRATION — fills ex.files for HTTP-served projects
  ═══════════════════════════════════════════════════════════════════ */

  async function hydrateExerciseFiles(ex) {
    if (ex._fileDiscoveryDone) return;
    const dirPath = `${selectedCategory}/${selectedLab}/${ex.name}/`;
    try {
      const res = await fetch(dirPath, { cache:'no-store' });
      if (!res.ok) { ex._fileDiscoveryDone = true; return; }
      const html       = await res.text();
      const fileNames  = parseDirectoryListingFileNames(html);
      const candidates = fileNames.filter(n => isCodeSourceFile(n));
      const discovered = (await Promise.all(candidates.map(async name => {
        try {
          const r = await fetch(`${dirPath}${encodeURIComponent(name)}`, { cache:'no-store' });
          if (!r.ok) return null;
          const content = await r.text();
          if (content.includes('\u0000')) return null;
          return { name, ext:normalizeExtension(name), main:isPrimarySourceFileName(name), content };
        } catch { return null; }
      }))).filter(Boolean);
      discovered.sort((a,b) => (b.main?1:0)-(a.main?1:0) || a.name.localeCompare(b.name));
      if (discovered.length) ex.files = discovered;
    } catch {}
    ex._fileDiscoveryDone = true;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 21: SHARED UTILS — utils/ folder at category level
  ═══════════════════════════════════════════════════════════════════ */

  async function findChildDirectoryHandleByName(parent, name) {
    if (!parent || !name) return null;
    const want = name.toLowerCase();
    for await (const entry of parent.values()) {
      if (entry.kind === 'directory' && entry.name.toLowerCase() === want) return entry;
    }
    return null;
  }

  async function getSharedUtilsFiles() {
    if (!selectedCategory) return [];
    if (Object.prototype.hasOwnProperty.call(sharedUtilsCache, selectedCategory)) return sharedUtilsCache[selectedCategory];
    let files = [];
    if (selectedRootHandle) {
      const catH   = await findChildDirectoryHandleByName(selectedRootHandle, selectedCategory);
      const utilsH = catH ? await findChildDirectoryHandleByName(catH, VIEWER_CONFIG.paths.utilsFolderName) : null;
      if (utilsH) {
        for await (const entry of utilsH.values()) {
          if (entry.kind !== 'file' || !isCodeSourceFile(entry.name)) continue;
          const content = await readTextFromFileHandle(entry);
          if (!content || content.includes('\u0000')) continue;
          files.push({ name:entry.name, ext:normalizeExtension(entry.name), content });
        }
        files.sort((a,b) => natSort(a.name, b.name));
      }
    } else {
      // HTTP fallback
      const dirPath = `${selectedCategory}/${VIEWER_CONFIG.paths.utilsFolderName}/`;
      try {
        const res = await fetch(dirPath, { cache:'no-store' });
        if (res.ok) {
          const html = await res.text();
          files = (await Promise.all(parseDirectoryListingFileNames(html).filter(n => isCodeSourceFile(n)).map(async name => {
            try {
              const r = await fetch(`${dirPath}${encodeURIComponent(name)}`, { cache:'no-store' });
              if (!r.ok) return null;
              const content = await r.text();
              return content.includes('\u0000') ? null : { name, ext:normalizeExtension(name), content };
            } catch { return null; }
          }))).filter(Boolean);
          files.sort((a,b) => natSort(a.name, b.name));
        }
      } catch {}
    }
    sharedUtilsCache[selectedCategory] = files;
    return files;
  }

  async function renderLabUtilsSection() {
    const root = document.getElementById('lab-utils');
    if (!root) return;
    root.innerHTML = `<div class="exercise-note"><div class="exercise-note-head">${VIEWER_CONFIG.labels.utilsSectionTitle}</div><pre class="exercise-note-text">Loading ${escapeHtml(selectedCategory)}/${escapeHtml(VIEWER_CONFIG.paths.utilsFolderName)}…</pre></div>`;
    const files = await getSharedUtilsFiles();
    root.innerHTML = `<div class="exercise-note"><div class="exercise-note-head">${VIEWER_CONFIG.labels.utilsSectionTitle}</div><div class="lab-utils-meta">Source: ${escapeHtml(selectedCategory)}/${escapeHtml(VIEWER_CONFIG.paths.utilsFolderName)}</div></div>`;
    if (!files.length) { const p = document.createElement('pre'); p.className = 'exercise-note-text'; p.textContent = `No code files found in ${selectedCategory}/${VIEWER_CONFIG.paths.utilsFolderName}.`; root.appendChild(p); return; }
    files.forEach(f => appendHighlightedCodeBlock(root, f, false));
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 22: PDF EXPORT — lab mode + general mode
  ═══════════════════════════════════════════════════════════════════ */

  async function exportPdf() {
    await exportExerciseListPdf({
      listSelector: '#ex-list',
      resolveExercise: item => {
        const exName = item.dataset.exName;
        return getCurrentLab()?.exercises.find(e => e.name === exName) || null;
      },
      ensureBodyLoaded: (body, ex) => populateBody(body, ex),
      notesSelector: '#ex-list .ex-notes-area',
      viewId: 'view-lab',
      fileName: (selectedLab || 'lab').toLowerCase(),
      buttonId: 'export-pdf-btn',
      captureConfig: VIEWER_CONFIG.pdf,
      coverImageDataUrl: includeCoverInPdf ? coverImageDataUrl : '',
      coverElementId: includeCoverInPdf && !coverImageDataUrl ? 'cover-card-export' : '',
      beforeCapture: async () => {
        if (labUtilsRenderPromise) await labUtilsRenderPromise;
      }
    });
  }

  async function exportGeneralPdf() {
    await exportExerciseListPdf({
      listSelector: '#general-ex-list',
      resolveExercise: item => {
        const exName = item.dataset.exName;
        return generalData.find(e => e.name === exName) || null;
      },
      ensureBodyLoaded: (body, ex) => populateBodyGeneral(body, ex),
      notesSelector: '#general-ex-list .ex-notes-area',
      viewId: 'view-general',
      fileName: (selectedGeneralRootName || 'general').toLowerCase().replace(/\s+/g,'-'),
      buttonId: 'export-general-pdf-btn',
      captureConfig: VIEWER_CONFIG.pdf,
      coverImageDataUrl: includeCoverInPdf ? coverImageDataUrl : '',
      coverElementId: includeCoverInPdf && !coverImageDataUrl ? 'cover-card-export' : '',
      waitMs: 200
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 23: README LOADING
  ═══════════════════════════════════════════════════════════════════ */

  async function loadReadmeHowTo() {
    syncHowToPanels('Loading README.md…');
    const text = selectedRootHandle ? await readReadmeFromDirectoryHandle(selectedRootHandle) : await fetchReadmeFromHttp();
    readmeHowToContent = text || 'README.md not found. Add one next to index.html to show usage instructions here.';
    syncHowToPanels(readmeHowToContent);
  }
  async function readReadmeFromDirectoryHandle(handle) {
    for (const name of ['README.md','readme.md','Readme.md']) {
      try { const h = await handle.getFileHandle(name); return await readTextFromFileHandle(h); } catch {}
    }
    return '';
  }
  async function fetchReadmeFromHttp() {
    for (const name of ['README.md','readme.md','Readme.md']) {
      const t = await fetchTextFromHttp(name); if (t) return t;
    }
    return '';
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 24: THEME PICKER — saves to localStorage
  ═══════════════════════════════════════════════════════════════════ */

  const THEME_CLASSES    = ['theme-blossom','theme-synthwave','theme-coral'];
  const THEME_STORAGE_KEY= 'reportgen-theme';

  function applyTheme(name) {
    const nextTheme = THEME_CLASSES.includes(name) ? name : '';
    THEME_CLASSES.forEach(c => document.documentElement.classList.remove(c));
    if (nextTheme) document.documentElement.classList.add(nextTheme);
    document.querySelectorAll('.theme-swatch').forEach(sw => sw.classList.toggle('active', (sw.dataset.theme || '') === nextTheme));
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch {}
  }
  function initThemePicker() {
    document.querySelectorAll('.theme-swatch').forEach(sw => sw.addEventListener('click', () => applyTheme(sw.dataset.theme || '')));
    try { const saved = localStorage.getItem(THEME_STORAGE_KEY); if (saved !== null) applyTheme(saved); } catch {}
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 25: MISC HELPERS — sorting, number extraction, code utils
  ═══════════════════════════════════════════════════════════════════ */

  function natSort(a, b)          { return a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }); }
  function containsNumber(name)   { return /\d+/.test(String(name || '')); }
  function extractFirstNumber(n)  { const m = String(n || '').match(/\d+/); return m ? parseInt(m[0], 10) : Infinity; }
  function compareByDetectedNumberThenName(a, b) {
    const na = typeof a === 'string' ? a : a.name, nb = typeof b === 'string' ? b : b.name;
    const da = extractFirstNumber(na), db = extractFirstNumber(nb);
    return da !== db ? da - db : natSort(na, nb);
  }
  function findPreferredCategoryName(folders) {
    for (const cand of (VIEWER_CONFIG.category.preferredFolderNames || [])) {
      const found = folders.find(f => f.name.toLowerCase() === String(cand).toLowerCase());
      if (found) return found.name;
    }
    return null;
  }
  function getCurrentLab() {
    if (!selectedCategory || !selectedLab) return null;
    return folderData.find(f => f.name === selectedCategory)?.labs.find(l => l.name === selectedLab) || null;
  }
  function extractExerciseHeaderFromMain(ex) {
    const main = (ex.files || []).find(f => f.main);
    return main ? extractDescFromFile(main) : '';
  }
  function stripLeadingBlockComment(content) {
    return content ? content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/,'') : '';
  }


  /* ═══════════════════════════════════════════════════════════════════
     SECTION QOL: ADD FILES/IMAGES, NEW CARD, RESCAN, DROP ZONE
  ═══════════════════════════════════════════════════════════════════ */

  function pickAndAddFiles(body, ex, addRow) {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = async () => {
      for (const file of Array.from(input.files)) {
        let content;
        try { content = await file.text(); } catch { content = '[binary — cannot display]'; }
        const ext = normalizeExtension(file.name);
        const fileObj = { name: file.name, ext, main: false, content };
        ex.files.push(fileObj);
        const wrap = buildCodeBlock(fileObj, ex);
        body.insertBefore(wrap, addRow);
        const cn = wrap.querySelector('code');
        if (cn && window.hljs) window.hljs.highlightElement(cn);
        updateFileCount(wrap, ex);
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
        ex.images.push({ fileName: file.name, dataUrl });
        body.insertBefore(buildImageBlock(file.name, dataUrl), addRow);
      }
      initFileDragSort(body);
    };
    input.click();
  }

  function addNewGeneralCard() {
    const newEx = { name: 'New Card', files: [], images: [], outputSectionsCache: [], _notes: '' };
    generalData.push(newEx);
    const list = document.getElementById('general-ex-list');
    const item = buildExerciseItem(newEx, generalData.length - 1);
    item.querySelector('.ex-header').onclick = e => {
      if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
      item.classList.toggle('open');
      if (item.classList.contains('open')) populateBodyGeneral(item.querySelector('.ex-body'), newEx);
    };
    list.appendChild(item);
    item.classList.add('open');
    populateBodyGeneral(item.querySelector('.ex-body'), newEx);
    const ti = item.querySelector('.ex-title-input');
    if (ti) { ti.select(); setTimeout(() => ti.focus(), 50); }
    const tag = document.getElementById('general-tag');
    if (tag) tag.textContent = `${generalData.length} item${generalData.length !== 1 ? 's' : ''}`;
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addFilesToNewCard() {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = async () => {
      if (!input.files.length) return;
      const newEx = { name: 'Dropped Files', files: [], images: [], outputSectionsCache: [], _notes: '' };
      generalData.push(newEx);
      for (const file of Array.from(input.files)) {
        if (isImageFile(file.name)) {
          const dataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result); r.onerror = () => res('');
            r.readAsDataURL(file);
          });
          if (dataUrl) newEx.images.push({ fileName: file.name, dataUrl });
        } else {
          let content;
          try { content = await file.text(); } catch { content = '[binary]'; }
          const ext = normalizeExtension(file.name);
          newEx.files.push({ name: file.name, ext, main: isPrimarySourceFileName(file.name), content });
        }
      }
      if (newEx.files.length === 1) newEx.name = newEx.files[0].name;
      else if (newEx.files.length === 0 && newEx.images.length === 1) newEx.name = newEx.images[0].fileName;
      const list = document.getElementById('general-ex-list');
      const item = buildExerciseItem(newEx, generalData.length - 1);
      item.querySelector('.ex-header').onclick = e => {
        if (e.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
        item.classList.toggle('open');
        if (item.classList.contains('open')) populateBodyGeneral(item.querySelector('.ex-body'), newEx);
      };
      list.appendChild(item);
      item.classList.add('open');
      populateBodyGeneral(item.querySelector('.ex-body'), newEx);
      const tag = document.getElementById('general-tag');
      if (tag) tag.textContent = `${generalData.length} item${generalData.length !== 1 ? 's' : ''}`;
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    input.click();
  }

  function rescanGeneral() {
    if (selectedGeneralHandle) loadGeneralDataFromDirectoryHandle(selectedGeneralHandle);
    else openGeneralFolder();
  }

  function initGenDropzone() {
    const zone = document.getElementById('gen-dropzone');
    const view = document.getElementById('view-general');
    if (!zone || !view) return;
    view.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('drag-over'); }
    });
    view.addEventListener('dragleave', e => {
      if (!view.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    view.addEventListener('drop', async e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      const newEx = { name: 'Dropped Files', files: [], images: [], outputSectionsCache: [], _notes: '' };
      generalData.push(newEx);
      for (const file of files) {
        if (isImageFile(file.name)) {
          const dataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result); r.onerror = () => res('');
            r.readAsDataURL(file);
          });
          if (dataUrl) newEx.images.push({ fileName: file.name, dataUrl });
        } else {
          let content;
          try { content = await file.text(); } catch { content = '[binary]'; }
          const ext = normalizeExtension(file.name);
          newEx.files.push({ name: file.name, ext, main: isPrimarySourceFileName(file.name), content });
        }
      }
      if (newEx.files.length === 1) newEx.name = newEx.files[0].name;
      else if (newEx.files.length === 0 && newEx.images.length === 1) newEx.name = newEx.images[0].fileName;
      const list = document.getElementById('general-ex-list');
      const item = buildExerciseItem(newEx, generalData.length - 1);
      item.querySelector('.ex-header').onclick = e2 => {
        if (e2.target.closest('.drag-handle,.ex-title-input,.ex-delete-btn')) return;
        item.classList.toggle('open');
        if (item.classList.contains('open')) populateBodyGeneral(item.querySelector('.ex-body'), newEx);
      };
      list.appendChild(item);
      item.classList.add('open');
      populateBodyGeneral(item.querySelector('.ex-body'), newEx);
      const tag = document.getElementById('general-tag');
      if (tag) tag.textContent = `${generalData.length} item${generalData.length !== 1 ? 's' : ''}`;
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 26: STARTUP
  ═══════════════════════════════════════════════════════════════════ */

  window.addEventListener('DOMContentLoaded', async () => {
    document.documentElement.style.setProperty('--pdf-content-width', `${VIEWER_CONFIG.pdf.contentWidthPx}px`);
    activeSubtitle = String(VIEWER_CONFIG.subtitle || '').trim();
    updateStaticUiText();
    updateTopbarTitle();
    initCoverEditor();
    initThemePicker();
    initGenDropzone();
    updateCoverControls();
    await loadReadmeHowTo();
    showLanding();
  });

  // Keep inline HTML handlers working while app logic lives in modules.
  Object.assign(window, {
    openLabFolder,
    openGeneralFolder,
    exportPdf,
    exportGeneralPdf,
    rescan,
    showLanding,
    showHome,
    showCategory,
    showLab,
    collapseAll,
    expandAll,
    toggleSettings,
    applyToggles,
    pickCoverImage,
    toggleCoverInPdf,
    addNewGeneralCard,
    addFilesToNewCard,
    rescanGeneral
  });
