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

// ── CODE MODE ───────────────────────────────────────────────────────────────
export const CODE_MODE = Object.freeze({
  id:          'code',
  label:       'Code Mode',
  icon:        '{ }',
  description: 'Source code with syntax highlighting. desc.txt/desc.png/desc.pdf become exercise descriptions.',

  outputExtensions: new Set(['txt', 'csv', 'json']),
  codeExtensions:   CODE_EXTENSIONS,
  forceAllToOutput: false,
  skipExtensions:   BINARY_SKIP,

  renderAsProse: (f) => {
    return ['md'].includes(f.ext || '');
  },

  descExtractionEnabled: true,
  utilsEnabled:          true,
  preferredMainBases:    PREFERRED_MAIN_BASES,
  togglePrefix:          'tog-main',
});

// ── DOC MODE ────────────────────────────────────────────────────────────────
export const DOC_MODE = Object.freeze({
  id:          'doc',
  label:       'Doc Mode',
  icon:        '¶',
  description: 'Document mode. desc.txt/desc.png/desc.pdf become descriptions, all other files are output blocks.',

  outputExtensions: new Set(),
  codeExtensions:   new Set(),
  forceAllToOutput: true,
  skipExtensions:   BINARY_SKIP,

  renderAsProse: (f) => {
    return ['txt', 'md'].includes(f.ext || '');
  },

  descExtractionEnabled: false,
  utilsEnabled:          false,
  preferredMainBases:    PREFERRED_MAIN_BASES,
  togglePrefix:          'tog-main',
});

export const ALL_MODES = [CODE_MODE, DOC_MODE];

/**
 * Given a mode id string, return the matching config (defaults to CODE_MODE).
 */
export function getModeById(id) {
  return ALL_MODES.find(m => m.id === id) ?? CODE_MODE;
}
