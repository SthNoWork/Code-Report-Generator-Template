// Global viewer configuration for index.html
// Edit values here to adapt the report viewer to different classes/projects.
window.APP_CONFIG = {
  // Subtitle shown in the lab title and used in the browser/page title context.
  subtitle: 'Data Structures',

  // Folder selection behavior.
  category: {
    // The viewer will auto-open the first folder whose name matches (case-insensitive).
    preferredFolderNames: ['Lab', 'lab']
  },

  // Naming/display conventions.
  naming: {
    // Used only for hints/messages. Real folder names are still read from filesystem/data.
    labPrefix: 'Lab',
    labSeparator: '',
    exercisePrefix: 'Ex',
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
    outputLabel: 'OUTPUT'
  },

  // Output file parsing.
  output: {
    sectionMarkers: [
      '=== CUT ===',
    ],
    fileCandidates: ['output.txt', 'output.log', 'stdout.txt', 'result.txt']
  },

  // PDF export quality/layout.
  pdf: {
    contentWidthPx: 900,
    viewportWidthPx: 960,
    captureScale: 2,
    pageWidthMm: 210,
    imageQuality: 0.95
  },

  // File discovery rules.
  fileDiscovery: {
    skipCodeFileExtensions: [
      'ilk', 'pdb', 'obj', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'zip', '7z',
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg', 'pdf',
      'mp3', 'wav', 'ogg', 'mp4', 'mov', 'avi'
    ],
    preferredMainFileBases: ['main', 'app', 'program', 'index']
  }
};
