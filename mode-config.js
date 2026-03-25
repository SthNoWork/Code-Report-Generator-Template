/**
 * mode-config.js
 *
 * Each mode is a plain config object consumed by scanner.js and renderer.js.
 */

const BINARY_SKIP = new Set([
  'ilk','pdb','obj','exe','dll','so','dylib','class','jar','zip','7z',
  'mp3','wav','ogg','mp4','mov','avi',
  'html','htm','css','js','jsx','mjs','cjs',
]);

const CODE_EXTENSIONS = new Set([
  'c','h','cpp','hpp','cc','cxx',
  'py','java','cs','js','ts','tsx','jsx','go','rs','php','rb','swift','kt','scala',
  'sql','sh','ps1','xml','yaml','yml','toml','ini','md'
]);

// ── CODE MODE ───────────────────────────────────────────────────────────────
export const CODE_MODE = Object.freeze({
  id:          'code',
  label:       'Code Mode',
  icon:        '{ }',
  description: 'Source code with syntax highlighting. desc.txt/desc.png become exercise descriptions.',

  outputExtensions: new Set(['txt', 'csv', 'json']),
  codeExtensions:   CODE_EXTENSIONS,
  forceAllToOutput: false,
  skipExtensions:   BINARY_SKIP,

  renderAsProse: (f) => {
    return ['md'].includes(f.ext || '');
  },

  descExtractionEnabled: true,
  utilsEnabled:          true,
  preferredMainBases:    ['main'],
  togglePrefix:          'tog-main',
});

// ── DOC MODE ────────────────────────────────────────────────────────────────
export const DOC_MODE = Object.freeze({
  id:          'doc',
  label:       'Doc Mode',
  icon:        '¶',
  description: 'Document mode. desc.txt/desc.png become descriptions, all other files are output blocks.',

  outputExtensions: new Set(),
  codeExtensions:   new Set(),
  forceAllToOutput: true,
  skipExtensions:   BINARY_SKIP,

  renderAsProse: (f) => {
    return ['txt', 'md'].includes(f.ext || '');
  },

  descExtractionEnabled: false,
  utilsEnabled:          false,
  preferredMainBases:    ['main'],
  togglePrefix:          'tog-main',
});

export const ALL_MODES = [CODE_MODE, DOC_MODE];

/**
 * Given a mode id string, return the matching config (defaults to CODE_MODE).
 */
export function getModeById(id) {
  return ALL_MODES.find(m => m.id === id) ?? CODE_MODE;
}
