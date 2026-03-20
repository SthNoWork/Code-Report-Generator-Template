/**
 * scanner.js
 *
 * All filesystem scanning logic.  Every public function accepts a ModeConfig
 * object and uses it for all classification decisions — no global state.
 *
 * Scan depth rules (per user spec):
 *   • Root contains files directly → one exercise card for the root
 *   • Root contains sub-folders   → one exercise card per immediate sub-folder
 *   • Root contains both          → root files get their own card +
 *                                   one card per sub-folder
 *   • No deeper than one level below root
 */

// ── Low-level file handle readers ─────────────────────────────────────────

export async function readTextFromHandle(handle) {
  try { return await (await handle.getFile()).text(); } catch { return ''; }
}

export async function readImageDataUrlFromHandle(handle) {
  try {
    const file = await handle.getFile();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result || '');
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    });
  } catch { return ''; }
}

// ── File classification (all param-driven, no globals) ────────────────────

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','bmp','webp','svg']);
const STORAGE_OUTPUT_EXTS = new Set(['txt', 'json', 'csv']);

export function getExt(fileName) {
  const idx = fileName.lastIndexOf('.');
  return (idx > 0 && idx < fileName.length - 1) ? fileName.slice(idx + 1).toLowerCase() : '';
}

function getBaseName(fileName) {
  const idx = fileName.lastIndexOf('.');
  return (idx > 0) ? fileName.slice(0, idx) : fileName;
}

function extractExerciseNumber(fileName) {
  const matches = getBaseName(fileName).match(/\d+/g);
  if (!matches || !matches.length) return null;
  const value = Number.parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(value) ? value : null;
}

export function isImageFile(fileName) {
  return IMAGE_EXTS.has(getExt(fileName));
}

/**
 * Decide whether a file is an OUTPUT artifact given a ModeConfig.
 * Order of precedence:
 *  1. Images → never output
 *  2. Extension in modeConfig.outputExtensions AND not a proseExtension → output
 *  3. Name matches any modeConfig.outputNamePatterns → output
 *  4. Otherwise → viewable file
 */
export function isOutputArtifact(fileName, modeConfig) {
  if (isImageFile(fileName)) return false;
  const ext   = getExt(fileName);
  const lower = fileName.toLowerCase();

  // Extension-based: if ext is a dedicated output ext AND not prose
  if (modeConfig.outputExtensions.has(ext) && !modeConfig.proseExtensions.has(ext)) return true;

  // Name-pattern-based (e.g. output.txt, result_output.csv)
  if (modeConfig.outputNamePatterns.some(p => p.test(lower))) return true;

  return false;
}

/**
 * Decide whether a file should be loaded as a viewable block.
 */
export function isViewableFile(fileName, modeConfig) {
  if (isImageFile(fileName)) return false;
  if (isOutputArtifact(fileName, modeConfig)) return false;
  if (modeConfig.skipExtensions.has(getExt(fileName))) return false;
  const ext = getExt(fileName);
  return ext !== '';  // skip extensionless files
}

export function isPrimarySourceFile(fileName, modeConfig) {
  const dot  = fileName.indexOf('.');
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).toLowerCase();
  return (modeConfig.preferredMainBases || ['main']).includes(base);
}

// ── Output section parsing ────────────────────────────────────────────────

const SECTION_MARKERS = ['=== CUT ==='];

function stripNoise(text) {
  return text.split(/\r?\n/).filter(l => {
    const t = l.trim();
    if (!t) return true;
    if (/^[A-Za-z]:\\.*\.exe.*exited with code/i.test(t)) return false;
    if (/^Press any key to close this window/i.test(t)) return false;
    return true;
  }).join('\n').replace(/^\s+|\s+$/g, '');
}

export function extractOutputSections(rawText) {
  if (!rawText) return [];
  const rx = new RegExp(
    `(?:^|\\r?\\n)(?:${SECTION_MARKERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?=\\r?\\n|$)`,
    'g'
  );
  return rawText.split(rx).map(stripNoise).filter(Boolean);
}

// ── Description extraction ─────────────────────────────────────────────────

export function extractDescription(content) {
  if (!content) return '';
  const m = content.match(/\/\*([\s\S]*?)\*\//);
  if (!m) return '';
  return m[1].split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd()).join('\n').trim();
}

export function stripLeadingComment(content) {
  return content ? content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '') : '';
}

// ── Single-directory file reader ──────────────────────────────────────────

/**
 * Read all files in a single DirectoryHandle (no recursion).
 * Returns { files, images, outputEntries } — raw handles not yet read.
 *
 * Files are classified according to modeConfig.
 */
async function readFilesInDirectory(dirHandle, modeConfig) {
  const fileEntries   = [];
  const imageEntries  = [];
  const outputEntries = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const name = entry.name;

    if (isImageFile(name)) {
      imageEntries.push({ entry, name });
    } else if (isOutputArtifact(name, modeConfig)) {
      outputEntries.push({ entry, name });
    } else if (isViewableFile(name, modeConfig)) {
      fileEntries.push({ entry, name });
    }
    // else: skip (binary, no extension, etc.)
  }

  return { fileEntries, imageEntries, outputEntries };
}

/**
 * Materialize raw file handles into loaded data arrays.
 * Each viewable file gets: { name, ext, main, content, proseMode }
 */
async function materialize(fileEntries, imageEntries, outputEntries, modeConfig) {
  // Viewable files
  const files = [];
  for (const { entry, name } of fileEntries) {
    const content = await readTextFromHandle(entry);
    if (!content && content !== '') continue;
    if (content.includes('\u0000')) continue;  // binary guard
    const ext = getExt(name);
    files.push({
      name,
      ext,
      main:      isPrimarySourceFile(name, modeConfig),
      content,
      proseMode: modeConfig.renderAsProse({ ext }),
    });
  }
  files.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  // Images
  const images = [];
  for (const { entry, name } of imageEntries) {
    const dataUrl = await readImageDataUrlFromHandle(entry);
    if (dataUrl) images.push({ fileName: name, dataUrl });
  }

  // Output artifacts
  const outputSectionsCache = [];
  for (const { entry, name } of outputEntries) {
    const raw      = await readTextFromHandle(entry);
    const sections = extractOutputSections(raw);
    if (sections.length) outputSectionsCache.push({ fileName: name, sections });
  }

  return { files, images, outputSectionsCache };
}

/**
 * Flat root strategy:
 * If root has direct files and no sub-folders, group numbered files as
 * pseudo-exercises (Exercise N), pairing code with txt/json/csv by number.
 * Grouped code files are auto-marked as main.
 */
async function buildFlatNumberedCards(fileEntries, imageEntries, outputEntries, modeConfig) {
  const groups = new Map();
  const rootFallback = {
    fileEntries: [],
    imageEntries: [],
    outputEntries: [],
  };

  const ensureGroup = (n) => {
    if (!groups.has(n)) {
      groups.set(n, { number: n, fileEntries: [], imageEntries: [], outputEntries: [] });
    }
    return groups.get(n);
  };

  for (const item of fileEntries) {
    const n = extractExerciseNumber(item.name);
    const ext = getExt(item.name);

    // Treat txt/json/csv as output artifacts in flat-number grouping mode.
    if (STORAGE_OUTPUT_EXTS.has(ext)) {
      if (n !== null) ensureGroup(n).outputEntries.push(item);
      else rootFallback.outputEntries.push(item);
      continue;
    }

    if (n !== null) ensureGroup(n).fileEntries.push(item);
    else rootFallback.fileEntries.push(item);
  }

  for (const item of outputEntries) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).outputEntries.push(item);
    else rootFallback.outputEntries.push(item);
  }

  for (const item of imageEntries) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).imageEntries.push(item);
    else rootFallback.imageEntries.push(item);
  }

  const cards = [];
  const ordered = Array.from(groups.values()).sort((a, b) => a.number - b.number);

  for (const g of ordered) {
    const loaded = await materialize(g.fileEntries, g.imageEntries, g.outputEntries, modeConfig);
    loaded.files.forEach(f => { f.main = true; });
    if (loaded.files.length || loaded.images.length || loaded.outputSectionsCache.length) {
      cards.push({
        name: `Exercise ${g.number}`,
        _mode: modeConfig.id,
        _notes: '',
        ...loaded,
      });
    }
  }

  if (rootFallback.fileEntries.length || rootFallback.imageEntries.length || rootFallback.outputEntries.length) {
    const loaded = await materialize(rootFallback.fileEntries, rootFallback.imageEntries, rootFallback.outputEntries, modeConfig);
    if (loaded.files.length || loaded.images.length || loaded.outputSectionsCache.length) {
      cards.push({
        name: 'Misc Files',
        _mode: modeConfig.id,
        _notes: '',
        ...loaded,
      });
    }
  }

  return cards;
}

// ── Public: scan a folder into exercise cards ─────────────────────────────

/**
 * Scan a root DirectoryHandle into exercise card data using modeConfig rules.
 *
 * Depth rules:
 *   - Files at root + no sub-folders → one card named after root
 *   - Files at root + sub-folders → root card + one card per sub-folder
 *   - No files at root + sub-folders → one card per sub-folder only
 *   - Each sub-folder card only includes that folder's direct files (depth 1)
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string}                    rootName
 * @param {ModeConfig}                modeConfig
 * @param {(pct: number) => void}     [onProgress]
 * @returns {Promise<ExerciseCard[]>}
 */
export async function scanFolder(rootHandle, rootName, modeConfig, onProgress) {
  const cards   = [];
  const SKIP    = new Set(['.git', 'node_modules', '.DS_Store']);
  const subdirs = [];

  onProgress?.(10);

  // ── Classify root-level entries ─────────────────────────────────────────
  const { fileEntries, imageEntries, outputEntries } = await readFilesInDirectory(rootHandle, modeConfig);
  const subdirEntries = [];
  for await (const entry of rootHandle.values()) {
    if (entry.kind === 'directory' && !SKIP.has(entry.name)) {
      subdirEntries.push(entry);
    }
  }
  subdirEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  onProgress?.(30);

  // Flat folder: group by numeric filename and pair code/output by number.
  if (!subdirEntries.length && (fileEntries.length || imageEntries.length || outputEntries.length)) {
    const grouped = await buildFlatNumberedCards(fileEntries, imageEntries, outputEntries, modeConfig);
    if (grouped.length) {
      onProgress?.(100);
      return grouped;
    }
  }

  // ── Root card (only if materialize produces real content) ───────────────
  if (fileEntries.length || imageEntries.length || outputEntries.length) {
    const loaded = await materialize(fileEntries, imageEntries, outputEntries, modeConfig);
    // Only create a card if there's something visible to show
    if (loaded.files.length || loaded.images.length || loaded.outputSectionsCache.length) {
      cards.push({
        name:  rootName || 'Files',
        _mode: modeConfig.id,
        _notes:'',
        ...loaded,
      });
    }
  }

  onProgress?.(50);

  // ── Sub-folder cards (depth 1, direct files only) ───────────────────────
  for (let i = 0; i < subdirEntries.length; i++) {
    const dir = subdirEntries[i];
    const { fileEntries: sf, imageEntries: si, outputEntries: so } =
      await readFilesInDirectory(dir, modeConfig);

    if (sf.length || si.length || so.length) {
      const loaded = await materialize(sf, si, so, modeConfig);
      cards.push({
        name:  dir.name,
        _mode: modeConfig.id,
        _notes:'',
        ...loaded,
      });
    }
    onProgress?.(50 + Math.round(((i + 1) / subdirEntries.length) * 45));
  }

  onProgress?.(100);
  return cards;
}

/**
 * Scan a folder as a "utils" library — reads all viewable files from the
 * top level only (no sub-folder recursion).  Returns a flat array of file
 * objects ready to render as utils blocks.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @param {ModeConfig}                modeConfig
 * @returns {Promise<FileObject[]>}
 */
export async function scanUtilsFolder(handle, modeConfig) {
  const { fileEntries } = await readFilesInDirectory(handle, modeConfig);
  const { files } = await materialize(fileEntries, [], [], modeConfig);
  return files;
}
