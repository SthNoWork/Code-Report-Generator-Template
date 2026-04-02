const DEFAULT_APP_CONFIG = {
  subtitle: '',
  debug: false,
  ui: {
    pageTitle: 'Report Generator',
    topbar: {
      useRootFolderName: true,
      staticPrefixSegments: [],
      useActiveCategoryAsTail: false,
      tailLabel: '',
      separator: ' > '
    },
    breadcrumb: {
      homeLabel: '',
      separator: ' > '
    },
    text: {
      landingLabel: 'Code Report Viewer',
      landingTitle: 'Lab Report Generator',
      landingDescription: 'Open a folder to begin.',
      openProjectButton: 'Open Folder',
      browserSupportNote: 'Requires Chrome or Edge',
      emptyFolderMessage: 'No files found in this folder.',
      notesPlaceholder: 'Notes for this exercise (shown in PDF if filled)...',
      noOutputMessage: 'No output file found for this exercise.',
      footer: 'Report Generator - Chrome & Edge',
      sharedUtilsNote: 'Shared utils code is shown at the very bottom of this report.'
    }
  },
  category: {
    preferredFolderNames: []
  },
  naming: {
    labPrefix: '',
    labSeparator: '',
    exercisePrefix: '',
    exerciseSeparator: '',
    showSubtitleInLabTitle: true
  },
  cover: {
    defaultLogoPath: './ITC_logo.png',
    includeInPdfByDefault: true,
    logoSize: 120,
    titleSize: 28,
    defaultTitle: 'Institute Technology of Cambodia',
    defaultSubtitle: 'Lab Report',
    labLabelPrefix: 'Lab',
    labLabelSuffix: ' - Report',
    fallbackSubtitle: 'Lab Report',
    detailRows: [
      { label: 'Course', value: 'Course' },
      { label: 'Author', value: 'Author' },
      { label: 'Instructor', value: 'Instructor' },
      { label: 'Date', value: '__TODAY__' }
    ]
  },
  runtime: {
    loadingResetDelayMs: 350,
    utilsChipFlashMs: 1200,
    copyFeedbackMs: 1800,
    newCardFocusDelayMs: 50,
    readmeFetchTimeoutMs: 2000
  },
  paths: {
    utilsFolderName: 'utils'
  },
  labels: {
    utilsSectionTitle: 'Shared Utilities',
    outputLabel: 'OUTPUT',
    imageLabel: 'IMAGE',
    pdfLabel: 'PDF',
    descriptionLabel: 'Description',
    mainCommentName: 'main comment'
  },
  output: {
    sectionMarkers: ['=== CUT ==='],
    fileCandidates: ['output.txt', '*.txt', '*.json', '*.csv']
  },
  pdf: {
    contentWidthPx: 900,
    viewportWidthPx: 960,
    captureScale: 2,
    pageWidthMm: 210,
    pageHeightMm: 297,
    pagePaddingMm: 8,
    imageQuality: 0.95,
    fallbackAspectRatio: 297 / 210,
    elementWindowMinHeightPx: 900,
    sliceWindowMinHeightPx: 512,
    minSliceHeightPx: 256,
    safeViewportWidthPx: 1100,
    exerciseStartTopPaddingMm: 8,
    generalIgnoreSelectors: ['#utils-banner', '#utils-info-notice'],
    messages: {
      librariesMissing: 'PDF libraries not loaded. Please refresh.',
      contentViewMissing: 'PDF export failed: content view not found.',
      genericFailedPrefix: 'PDF export failed: '
    }
  },
  fileDiscovery: {
    skipCodeFileExtensions: [
      'ilk', 'pdb', 'obj', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'zip', '7z',
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg', 'pdf',
      'mp3', 'wav', 'ogg', 'mp4', 'mov', 'avi',
      'html', 'htm', 'css', 'js', 'jsx', 'mjs', 'cjs'
    ],
    preferredMainFileBases: ['main'],
    skipDirectories: ['.git', 'node_modules', '.DS_Store'],
    codeFileExtensions: [
      'c', 'h', 'cpp', 'hpp', 'cc', 'cxx',
      'py', 'java', 'cs', 'js', 'ts', 'tsx', 'jsx', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'scala',
      'sql', 'sh', 'ps1', 'xml', 'yaml', 'yml', 'toml', 'ini', 'md'
    ]
  },
  themes: {
    storageKey: 'rg-theme',
    legacyStorageKeys: ['reportgen-theme'],
    options: [
      { id: 'default', className: '', title: 'Default (dark)', swatch: 'radial-gradient(circle at 40% 40%, #58a6ff, #0d1117)' },
      { id: 'blossom', className: 'theme-blossom', title: 'Blossom (light pink)', swatch: 'radial-gradient(circle at 40% 40%, #ff9fd4, #fdf0f5)' },
      { id: 'synthwave', className: 'theme-synthwave', title: 'Synthwave', swatch: 'radial-gradient(circle at 40% 40%, #00d9ff, #f0e8ff)' },
      { id: 'coral', className: 'theme-coral', title: 'Coral', swatch: 'radial-gradient(circle at 40% 40%, #ff8c42, #fff3ed)' }
    ]
  }
};

function mergeObjects(baseObj, overrideObj) {
  return { ...(baseObj || {}), ...(overrideObj || {}) };
}

function normalizeCoverRows(rows, fallbackRows) {
  const sourceRows = Array.isArray(rows) && rows.length ? rows : fallbackRows;
  return sourceRows.map(row => ({
    label: String(row?.label ?? ''),
    value: String(row?.value ?? '')
  }));
}

function normalizeThemes(themeConfig, fallbackThemeConfig) {
  const source = themeConfig || fallbackThemeConfig || {};
  const fallback = fallbackThemeConfig || {};
  const rawOptions = Array.isArray(source.options) && source.options.length
    ? source.options
    : (fallback.options || []);

  const options = rawOptions
    .map((theme, idx) => ({
      id: String(theme?.id || `theme-${idx + 1}`),
      className: String(theme?.className || ''),
      title: String(theme?.title || theme?.id || `Theme ${idx + 1}`),
      swatch: String(theme?.swatch || 'var(--surface)'),
    }))
    .filter(theme => theme.id.trim().length > 0);

  return {
    storageKey: String(source.storageKey || fallback.storageKey || 'rg-theme'),
    legacyStorageKeys: Array.isArray(source.legacyStorageKeys)
      ? source.legacyStorageKeys.map(key => String(key)).filter(Boolean)
      : (Array.isArray(fallback.legacyStorageKeys) ? fallback.legacyStorageKeys : []),
    options,
  };
}

let resolvedCache = null;

export function resolveAppConfig(userConfig = {}) {
  const cfg = userConfig || {};

  const merged = {
    ...DEFAULT_APP_CONFIG,
    ...cfg,
    ui: mergeObjects(DEFAULT_APP_CONFIG.ui, cfg.ui),
    category: mergeObjects(DEFAULT_APP_CONFIG.category, cfg.category),
    naming: mergeObjects(DEFAULT_APP_CONFIG.naming, cfg.naming),
    cover: mergeObjects(DEFAULT_APP_CONFIG.cover, cfg.cover),
    runtime: mergeObjects(DEFAULT_APP_CONFIG.runtime, cfg.runtime),
    paths: mergeObjects(DEFAULT_APP_CONFIG.paths, cfg.paths),
    labels: mergeObjects(DEFAULT_APP_CONFIG.labels, cfg.labels),
    output: mergeObjects(DEFAULT_APP_CONFIG.output, cfg.output),
    pdf: mergeObjects(DEFAULT_APP_CONFIG.pdf, cfg.pdf),
    fileDiscovery: mergeObjects(DEFAULT_APP_CONFIG.fileDiscovery, cfg.fileDiscovery),
    themes: mergeObjects(DEFAULT_APP_CONFIG.themes, cfg.themes)
  };

  merged.ui.topbar = mergeObjects(DEFAULT_APP_CONFIG.ui.topbar, cfg.ui?.topbar);
  merged.ui.breadcrumb = mergeObjects(DEFAULT_APP_CONFIG.ui.breadcrumb, cfg.ui?.breadcrumb);
  merged.ui.text = mergeObjects(DEFAULT_APP_CONFIG.ui.text, cfg.ui?.text);

  merged.output.sectionMarkers = Array.isArray(merged.output.sectionMarkers) && merged.output.sectionMarkers.length
    ? merged.output.sectionMarkers
    : DEFAULT_APP_CONFIG.output.sectionMarkers;

  merged.pdf.messages = mergeObjects(DEFAULT_APP_CONFIG.pdf.messages, cfg.pdf?.messages);
  merged.pdf.generalIgnoreSelectors = Array.isArray(merged.pdf.generalIgnoreSelectors) && merged.pdf.generalIgnoreSelectors.length
    ? merged.pdf.generalIgnoreSelectors
    : DEFAULT_APP_CONFIG.pdf.generalIgnoreSelectors;

  merged.fileDiscovery.skipCodeFileExtensions = Array.isArray(merged.fileDiscovery.skipCodeFileExtensions) && merged.fileDiscovery.skipCodeFileExtensions.length
    ? merged.fileDiscovery.skipCodeFileExtensions
    : DEFAULT_APP_CONFIG.fileDiscovery.skipCodeFileExtensions;

  merged.fileDiscovery.preferredMainFileBases = Array.isArray(merged.fileDiscovery.preferredMainFileBases) && merged.fileDiscovery.preferredMainFileBases.length
    ? merged.fileDiscovery.preferredMainFileBases
    : DEFAULT_APP_CONFIG.fileDiscovery.preferredMainFileBases;

  merged.fileDiscovery.skipDirectories = Array.isArray(merged.fileDiscovery.skipDirectories) && merged.fileDiscovery.skipDirectories.length
    ? merged.fileDiscovery.skipDirectories
    : DEFAULT_APP_CONFIG.fileDiscovery.skipDirectories;

  merged.fileDiscovery.codeFileExtensions = Array.isArray(merged.fileDiscovery.codeFileExtensions) && merged.fileDiscovery.codeFileExtensions.length
    ? merged.fileDiscovery.codeFileExtensions
    : DEFAULT_APP_CONFIG.fileDiscovery.codeFileExtensions;

  merged.cover.detailRows = normalizeCoverRows(merged.cover.detailRows, DEFAULT_APP_CONFIG.cover.detailRows);
  merged.themes = normalizeThemes(merged.themes, DEFAULT_APP_CONFIG.themes);

  return merged;
}

export function getAppConfig() {
  if (!resolvedCache) {
    resolvedCache = resolveAppConfig(window.APP_CONFIG || {});
  }
  return resolvedCache;
}
