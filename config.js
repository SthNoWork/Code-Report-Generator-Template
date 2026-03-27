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
    descriptionLabel: 'Description'
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
    imageQuality: 0.95
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
  }
};
