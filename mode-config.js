/**
 * mode-config.js
 *
 * Each mode is a plain config object.  Every function in scanner.js and
 * renderer.js accepts a ModeConfig rather than branching on a global string.
 * To add a new mode, copy one of these objects and change the values.
 *
 * ModeConfig shape
 * ─────────────────────────────────────────────────────────────────────
 *  id              string    unique key, stored on exercise data
 *  label           string    shown in UI badges / pickers
 *  icon            string    short glyph for the landing picker
 *  description     string    one-liner shown on landing
 *
 *  ── File classification ─────────────────────────────────────────────
 *  proseExtensions     Set<string>   extensions always shown as prose blocks
 *  outputExtensions    Set<string>   extensions always shown as OUTPUT blocks
 *  outputNamePatterns  RegExp[]      file names matching these → OUTPUT block
 *                                   (applied after extension checks)
 *  skipExtensions      Set<string>   binary / ignored extensions
 *
 *  ── Per-file rendering ──────────────────────────────────────────────
 *  renderAsProse(f)    (file) => bool   true  → prose block
 *                                       false → syntax-highlighted code block
 *
 *  ── Description extraction ──────────────────────────────────────────
 *  descExtractionEnabled   bool   extract /* ... *\/ from main files
 *
 *  ── Main-file detection ─────────────────────────────────────────────
 *  preferredMainBases  string[]   base-names that auto-mark as main
 *                                 (no extension, lower-case)
 *
 *  ── Toggle panel ────────────────────────────────────────────────────
 *  togglePrefix    string   e.g. 'tog-main' → checkbox ids are
 *                           'tog-main-output', 'tog-main-desc', …
 */

const BINARY_SKIP = new Set([
  'ilk','pdb','obj','exe','dll','so','dylib','class','jar','zip','7z',
  'mp3','wav','ogg','mp4','mov','avi',
  'html','htm','css','js','jsx','mjs','cjs',
]);

const OUTPUT_NAME_PATTERNS = [
  /^output\./i,           // output.txt, output.csv …
  /_output\./i,           // result_output.txt …
  /output_/i,             // output_data.csv …
];

// ── CODE MODE ───────────────────────────────────────────────────────────────
export const CODE_MODE = Object.freeze({
  id:          'code',
  label:       'Code Mode',
  icon:        '{ }',
  description: 'Source code files with syntax highlighting. .txt/.csv/.json are shown as output.',

  // These are ALWAYS output blocks in code mode
  outputExtensions:   new Set(['csv', 'json']),
  // .txt can be output OR prose depending on name — handled by outputNamePatterns
  proseExtensions:    new Set(['txt', 'md']),
  outputNamePatterns: OUTPUT_NAME_PATTERNS,
  skipExtensions:     BINARY_SKIP,

  renderAsProse: (f) => {
    // In code mode: .txt and .md are prose; everything else is code
    return ['txt', 'md'].includes(f.ext || '');
  },

  descExtractionEnabled: true,
  txtAsDescription:      false,
  preferredMainBases:    ['main'],
  togglePrefix:          'tog-main',
});

// ── TEXT MODE ───────────────────────────────────────────────────────────────
export const TEXT_MODE = Object.freeze({
  id:          'text',
  label:       'Text Mode',
  icon:        '¶',
  description: 'Report-first mode: .txt as exercise description, .csv/.json as output blocks.',

  // In text mode, csv/json should always render as output blocks.
  outputExtensions:   new Set(['csv', 'json']),
  proseExtensions:    new Set(['txt', 'md']),
  outputNamePatterns: OUTPUT_NAME_PATTERNS,
  skipExtensions:     BINARY_SKIP,

  renderAsProse: (f) => {
    // In text mode: .txt and .md are prose; code files are also shown but as code
    return ['txt', 'md'].includes(f.ext || '');
  },

  descExtractionEnabled: true,
  txtAsDescription:      true,
  preferredMainBases:    ['main', 'readme'],
  togglePrefix:          'tog-main',
});

export const ALL_MODES = [CODE_MODE, TEXT_MODE];

/**
 * Given a mode id string, return the matching config (defaults to CODE_MODE).
 */
export function getModeById(id) {
  return ALL_MODES.find(m => m.id === id) ?? CODE_MODE;
}
