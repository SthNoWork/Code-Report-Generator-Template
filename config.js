// Global viewer configuration for index.html
// Edit values here to adapt the report viewer to different classes/projects.
window.APP_CONFIG = {
  // UI text and navigation display.
  ui: {
    pageTitle: 'Report Generator',
    topbar: {
      // When true, use the opened root folder name as the first segment.
      useRootFolderName: true,
      // Extra segments shown before the final tail label.
      staticPrefixSegments: [],
      // When true, use the currently selected folder/category as the tail segment.
      useActiveCategoryAsTail: false,
      // Optional fixed tail segment when useActiveCategoryAsTail is false.
      tailLabel: '',
      // Visual separator for topbar path.
      separator: ' > '
    },
    breadcrumb: {
      // Leave empty to use opened root folder name.
      homeLabel: '',
      separator: ' > '
    },
    text: {
      landingLabel: 'Code Report Viewer',
      landingTitle: 'Lab Report Generator',
      landingDescription: 'Click below and select your project root folder. Everything loads automatically - folders, labs, exercises, code files, and output text.',
      openProjectButton: 'Open Project Folder',
      browserSupportNote: 'Requires Chrome or Edge - Firefox not supported',
      emptyFolderMessage: 'No files found in this folder.',
      notesPlaceholder: 'Notes for this exercise (shown in PDF if filled)…',
      noOutputMessage: 'No output file found for this exercise.',
      homeHeroLabel: 'Project Explorer',
      homeHeroTitle: 'Project Folders',
      homeSubtitlePrefix: '//',
      homeSubtitleTemplate: '{count} folder{plural} found in root',
      footer: 'Open your project root folder - Shows folders, labs, exercises, code files, and text outputs - Chrome & Edge',
      sharedUtilsNote: 'Shared utils code is shown at the very bottom of this report (after all exercises), in both HTML and exported PDF.'
    }
  },

  // Cover page defaults (non-dynamic values).
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

  // Runtime/UI behavior timings.
  runtime: {
    loadingResetDelayMs: 350,
    utilsChipFlashMs: 1200,
    copyFeedbackMs: 1800,
    newCardFocusDelayMs: 50,
    readmeFetchTimeoutMs: 2000
  },

  // Folder selection behavior.
  category: {
    // The viewer will auto-open the first folder whose name matches (case-insensitive).
    // Leave empty for fully automatic detection.
    preferredFolderNames: []
  },

  // Naming/display conventions.
  naming: {
    // Leave empty for fully automatic detection.
    labPrefix: '',
    labSeparator: '',
    exercisePrefix: '',
    exerciseSeparator: '',

    // If true, lab title shows "<Lab Name> · <subtitle>".
    showSubtitleInLabTitle: true
  },

  // Path and section labels.
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

  // Output file parsing.
  output: {
    sectionMarkers: [
      '=== CUT ===',
    ],
    fileCandidates: ['output.txt', '*.txt', '*.json', '*.csv']
  },

  // PDF export quality/layout.
  pdf: {
    contentWidthPx: 900,
    viewportWidthPx: 960,
    captureScale: 2,
    pageWidthMm: 210,
    pageHeightMm: 297,
    pagePaddingMm: 8,
    pageHorizontalPaddingMm: 8,   // left/right margin in mm
    pageVerticalPaddingMm: 0,     // top/bottom page edge margin in mm (0 = bleed to edge)
    blockVerticalPaddingMm: 4,    // space above/below each block within a page
    exerciseStartTopPaddingMm: 8, // padding at top of each exercise's fresh page
    imageQuality: 0.95,
    fallbackAspectRatio: 297 / 210,
    elementWindowMinHeightPx: 900,
    sliceWindowMinHeightPx: 512,
    minSliceHeightPx: 256,
    safeViewportWidthPx: 1100,
    generalIgnoreSelectors: ['#utils-banner', '#utils-info-notice'],
    messages: {
      librariesMissing: 'PDF libraries not loaded. Please refresh.',
      contentViewMissing: 'PDF export failed: content view not found.',
      genericFailedPrefix: 'PDF export failed: '
    }
  },

  // File discovery rules.
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

  // Theme options for the topbar picker.
  themes: {
    storageKey: 'rg-theme',
    legacyStorageKeys: ['reportgen-theme'],
    options: [
      {
        id: 'default',
        className: '',
        title: 'Default (dark)',
        swatch: 'radial-gradient(circle at 40% 40%, #58a6ff, #0d1117)'
      },
      {
        id: 'blossom',
        className: 'theme-blossom',
        title: 'Blossom (light pink)',
        swatch: 'radial-gradient(circle at 40% 40%, #ff9fd4, #fdf0f5)'
      },
      {
        id: 'synthwave',
        className: 'theme-synthwave',
        title: 'Synthwave',
        swatch: 'radial-gradient(circle at 40% 40%, #00d9ff, #f0e8ff)'
      },
      {
        id: 'coral',
        className: 'theme-coral',
        title: 'Coral',
        swatch: 'radial-gradient(circle at 40% 40%, #ff8c42, #fff3ed)'
      }
    ]
  }
};
