/**
 * scanner.js (compatibility facade)
 *
 * Public scanner API is preserved while implementation is split into focused modules.
 */

export { readTextFromHandle, readImageDataUrlFromHandle, readDataUrlFromHandle } from './scan_file-readers.js';

export {
  getExt,
  extractExerciseNumber,
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
} from './scan_file-classifier.js';

export {
  extractOutputSections,
  extractDescription,
  stripLeadingComment,
} from './scan_output-parser.js';

export { scanFolder, scanUtilsFolder } from './scan_scan-service.js';
