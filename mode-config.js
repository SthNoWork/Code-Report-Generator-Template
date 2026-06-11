/**
 * mode-config.js
 *
 * Each mode is a plain config object consumed by scanner.js and renderer.js.
 */

import { getAppConfig } from './app-config-resolver.js';

const APP_CFG = getAppConfig();
const FILE_DISCOVERY_CFG = APP_CFG.fileDiscovery;

const BINARY_SKIP = new Set(FILE_DISCOVERY_CFG.skipCodeFileExtensions);
const CODE_EXTENSIONS = new Set(FILE_DISCOVERY_CFG.codeFileExtensions);
const PREFERRED_MAIN_BASES = FILE_DISCOVERY_CFG.preferredMainFileBases;

// ── PDF MODE ────────────────────────────────────────────────────────────────
export const PDF_MODE = Object.freeze({
  id: 'pdf',
  label: 'PDF Mode',
  icon: '📝',
  description: 'Unified Code and Document mode. Auto-highlights code and renders outputs.',

  outputExtensions: new Set(['txt', 'csv', 'json']),
  codeExtensions: CODE_EXTENSIONS,
  forceAllToOutput: false,
  skipExtensions: BINARY_SKIP,

  renderAsProse: (f) => {
    return ['txt', 'md'].includes(f.ext || '');
  },

  descExtractionEnabled: true,
  utilsEnabled: true,
  preferredMainBases: PREFERRED_MAIN_BASES,
  togglePrefix: 'tog-main',
});

export const ALL_MODES = [PDF_MODE];

/**
 * Given a mode id string, return the matching config (defaults to PDF_MODE).
 */
export function getModeById(id) {
  return PDF_MODE;
}
