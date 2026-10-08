import { getAppConfig } from './app-config-resolver.js';

const ATTACHMENT_SUPPORTS = [
  {
    id: 'image',
    extensions: new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg']),
    entryKey: 'imageEntries',
    descEntryKey: 'descImageEntries',
    exerciseKey: 'images',
    descExerciseKey: 'descImages',
    blockKind: 'image',
    descBlockKind: 'desc-image',
    buildType: 'image',
    descBuildType: 'image-desc',
    visibilityGroup: 'image',
    descVisibilityGroup: 'descImage',
    readAs: 'image-data-url',
  },
  {
    id: 'pdf',
    extensions: new Set(['pdf']),
    entryKey: 'pdfEntries',
    descEntryKey: 'descPdfEntries',
    exerciseKey: 'pdfs',
    descExerciseKey: 'descPdfs',
    blockKind: 'pdf',
    descBlockKind: 'desc-pdf',
    buildType: 'pdf',
    descBuildType: 'pdf-desc',
    visibilityGroup: 'image',
    descVisibilityGroup: 'descImage',
    readAs: 'data-url',
  },
];

export function getExt(fileName) {
  const idx = String(fileName || '').lastIndexOf('.');
  return (idx > 0 && idx < String(fileName).length - 1)
    ? String(fileName).slice(idx + 1).toLowerCase()
    : '';
}

function getBaseName(fileName) {
  const idx = String(fileName || '').lastIndexOf('.');
  return idx > 0 ? String(fileName).slice(0, idx) : String(fileName || '');
}

export function getAttachmentSupports() {
  return ATTACHMENT_SUPPORTS;
}

export function isDescriptionBaseName(fileName) {
  const base = getBaseName(fileName).toLowerCase();
  const cfg = getAppConfig();
  const keywords = cfg.fileDiscovery?.descriptionKeywords || [
    'desc', 'description', 'readme', 'instruction', 'instructions', 'prompt'
  ];
  const pattern = new RegExp(`(?:^|[_\s-])(?:${keywords.join('|')})(?:[_\s-]*\\d+)?$`, 'i');
  return pattern.test(base);
}

export function getAttachmentSupport(fileName) {
  const ext = getExt(fileName);
  if (!ext) return null;
  return ATTACHMENT_SUPPORTS.find(s => s.extensions.has(ext)) || null;
}

export function isAttachmentFile(fileName) {
  return !!getAttachmentSupport(fileName);
}

export function extractExerciseNumber(fileName) {
  if (!fileName) return null;
  const base = getBaseName(fileName);

  // 1. Explicit keyword: ex1, exercise_2, task3, prob04, q5
  const kwMatch = base.match(/(?:ex(?:ercise)?|task|prob(?:lem)?|q(?:uestion)?)[_\s-]*(\d+)/i);
  if (kwMatch) {
    const val = Number.parseInt(kwMatch[1], 10);
    if (Number.isFinite(val)) return val;
  }

  // 2. Starts with a number: "01_main.cpp", "2.cpp", "03-solution.py"
  const leadMatch = base.match(/^(\d+)/);
  if (leadMatch) {
    const val = Number.parseInt(leadMatch[1], 10);
    if (Number.isFinite(val)) return val;
  }

  // 3. Fallback: FIRST standalone number sequence (avoids version numbers or years)
  const matches = base.match(/\d+/g);
  if (!matches || !matches.length) return null;
  const val = Number.parseInt(matches[0], 10);
  return Number.isFinite(val) ? val : null;
}

export function isImageFile(fileName) {
  return getAttachmentSupport(fileName)?.id === 'image';
}

export function isPdfFile(fileName) {
  return getAttachmentSupport(fileName)?.id === 'pdf';
}

export function isDescriptionImage(fileName) {
  if (!isImageFile(fileName)) return false;
  return isDescriptionBaseName(fileName);
}

export function isDescriptionTxt(fileName) {
  if (getExt(fileName) !== 'txt') return false;
  return isDescriptionBaseName(fileName);
}

export function isDescriptionPdf(fileName) {
  if (!isPdfFile(fileName)) return false;
  return isDescriptionBaseName(fileName);
}

export function isOutputArtifact(fileName, modeConfig) {
  if (isAttachmentFile(fileName)) return false;
  if (isDescriptionTxt(fileName)) return false;

  const ext = getExt(fileName);
  if (!ext) return false;
  if (modeConfig.skipExtensions.has(ext)) return false;

  if (modeConfig.forceAllToOutput) return true;
  if (modeConfig.outputExtensions.has(ext)) return true;
  if (!modeConfig.codeExtensions.has(ext)) return true;

  return false;
}

export function isViewableFile(fileName, modeConfig) {
  if (isAttachmentFile(fileName)) return false;
  if (isDescriptionTxt(fileName)) return false;
  if (isOutputArtifact(fileName, modeConfig)) return false;
  if (modeConfig.skipExtensions.has(getExt(fileName))) return false;
  return getExt(fileName) !== '';
}

export function isPrimarySourceFile(fileName, modeConfig) {
  const dot = String(fileName || '').indexOf('.');
  const base = (dot > 0 ? String(fileName).slice(0, dot) : String(fileName || '')).toLowerCase();
  const cfg = getAppConfig();
  const preferred = modeConfig?.preferredMainBases || cfg.fileDiscovery?.preferredMainFileBases || ['main'];
  return preferred.includes(base);
}
