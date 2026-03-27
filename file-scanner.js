// Canonical file scanner module.
// Keeps naming aligned with responsibility: reading user folders/files and classifying them for block building.

export {
  readTextFromHandle,
  readImageDataUrlFromHandle,
  readDataUrlFromHandle,
  getExt,
  getAttachmentSupports,
  getAttachmentSupport,
  isAttachmentFile,
  isDescriptionBaseName,
  isImageFile,
  isPdfFile,
  isDescriptionImage,
  isDescriptionPdf,
  isDescriptionTxt,
  isOutputArtifact,
  isViewableFile,
  isPrimarySourceFile,
  extractOutputSections,
  extractDescription,
  stripLeadingComment,
  scanFolder,
  scanUtilsFolder,
} from './scanner.js';
