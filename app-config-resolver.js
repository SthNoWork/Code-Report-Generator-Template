/**
 * app-config-resolver.js
 *
 * Loads, resolves, and caches application configuration from config.json.
 */

const BASE_FALLBACK_CONFIG = {
  subtitle: '',
  debug: false,
  ordering: {
    priorities: {
      description: 1,
      mainCode: 2,
      code: 3,
      output: 4,
      media: 5,
      utils: 6,
    },
  },
  fileDiscovery: {
    preferredMainFileBases: ['main', 'app', 'index', 'solution'],
    descriptionKeywords: ['desc', 'description', 'readme', 'instruction', 'instructions', 'prompt'],
    skipDirectories: ['.git', 'node_modules', '.DS_Store'],
    codeFileExtensions: [
      'c', 'h', 'cpp', 'hpp', 'cc', 'cxx',
      'py', 'java', 'cs', 'js', 'ts', 'tsx', 'jsx', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'scala',
      'sql', 'sh', 'ps1', 'xml', 'yaml', 'yml', 'toml', 'ini', 'md',
    ],
    outputExtensions: ['txt', 'csv', 'json'],
    skipCodeFileExtensions: [
      'ilk', 'pdb', 'obj', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'zip', '7z',
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg', 'pdf',
      'mp3', 'wav', 'ogg', 'mp4', 'mov', 'avi',
      'html', 'htm', 'css', 'js', 'jsx', 'mjs', 'cjs',
    ],
  },
  ui: {
    pageTitle: 'Report Generator',
    topbar: {
      useRootFolderName: true,
      staticPrefixSegments: [],
      useActiveCategoryAsTail: false,
      tailLabel: '',
      separator: ' > ',
    },
    breadcrumb: {
      homeLabel: '',
      separator: ' > ',
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
      sharedUtilsNote: 'Shared utils code is shown at the very bottom of this report.',
    },
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
      { label: 'Date', value: '__TODAY__' },
    ],
  },
  runtime: {
    loadingResetDelayMs: 350,
    utilsChipFlashMs: 1200,
    copyFeedbackMs: 1800,
    newCardFocusDelayMs: 50,
    readmeFetchTimeoutMs: 2000,
  },
  paths: {
    utilsFolderName: 'utils',
  },
  labels: {
    utilsSectionTitle: 'Shared Utilities',
    outputLabel: 'OUTPUT',
    imageLabel: 'IMAGE',
    pdfLabel: 'PDF',
    descriptionLabel: 'Description',
    mainCommentName: 'main comment',
  },
  output: {
    sectionMarkers: ['=== CUT ==='],
    fileCandidates: ['output.txt', '*.txt', '*.json', '*.csv'],
  },
  pdf: {
    contentWidthPx: 900,
    viewportWidthPx: 960,
    captureScale: 2,
    pageWidthMm: 210,
    pageHeightMm: 297,
    pagePaddingMm: 8,
    pageHorizontalPaddingMm: 8,
    pageVerticalPaddingMm: 0,
    blockVerticalPaddingMm: 4,
    exerciseStartTopPaddingMm: 8,
    imageQuality: 0.95,
    fallbackAspectRatio: 1.414,
    elementWindowMinHeightPx: 900,
    sliceWindowMinHeightPx: 512,
    minSliceHeightPx: 256,
    safeViewportWidthPx: 1100,
    generalIgnoreSelectors: ['#utils-banner', '#utils-info-notice'],
    messages: {
      librariesMissing: 'PDF libraries not loaded. Please refresh.',
      contentViewMissing: 'PDF export failed: content view not found.',
      genericFailedPrefix: 'PDF export failed: ',
    },
  },
  themes: {
    storageKey: 'rg-theme',
    legacyStorageKeys: ['reportgen-theme'],
    options: [
      { id: 'default', className: '', title: 'Default (dark)', swatch: 'radial-gradient(circle at 40% 40%, #58a6ff, #0d1117)' },
      { id: 'blossom', className: 'theme-blossom', title: 'Blossom (light pink)', swatch: 'radial-gradient(circle at 40% 40%, #ff9fd4, #fdf0f5)' },
      { id: 'synthwave', className: 'theme-synthwave', title: 'Synthwave', swatch: 'radial-gradient(circle at 40% 40%, #00d9ff, #f0e8ff)' },
      { id: 'coral', className: 'theme-coral', title: 'Coral', swatch: 'radial-gradient(circle at 40% 40%, #ff8c42, #fff3ed)' },
    ],
  },
};

export function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = target[key];
    if (sVal && typeof sVal === 'object' && !Array.isArray(sVal)) {
      if (!tVal || typeof tVal !== 'object' || Array.isArray(tVal)) {
        target[key] = {};
      }
      deepMerge(target[key], sVal);
    } else {
      target[key] = sVal;
    }
  }
  return target;
}

export function resolveAppConfig(userConfig = {}) {
  const merged = JSON.parse(JSON.stringify(BASE_FALLBACK_CONFIG));
  deepMerge(merged, userConfig);
  return merged;
}

let resolvedCache = resolveAppConfig(window.APP_CONFIG || {});
let externalConfigPromise = null;

export function getAppConfig() {
  return resolvedCache;
}

export async function loadExternalConfig() {
  if (!externalConfigPromise) {
    externalConfigPromise = (async () => {
      try {
        const res = await fetch('./config.json', { cache: 'no-cache' });
        if (res.ok) {
          const json = await res.json();
          deepMerge(resolvedCache, json);
        }
      } catch {
        // Fallback silently if offline or on restricted scheme
      }
      return resolvedCache;
    })();
  }
  return externalConfigPromise;
}
