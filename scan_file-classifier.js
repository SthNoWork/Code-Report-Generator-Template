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
  return base === 'desc' || /^desc\d+$/.test(base);
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
  const matches = getBaseName(fileName).match(/\d+/g);
  if (!matches || !matches.length) return null;
  const value = Number.parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(value) ? value : null;
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
  return (modeConfig.preferredMainBases || ['main']).includes(base);
}
