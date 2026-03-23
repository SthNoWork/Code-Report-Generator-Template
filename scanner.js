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
 * Detect if an image is a description image (names: desc, desc1, desc2, etc.)
 * Description images are shown as exercise descriptions instead of image blocks.
 */
export function isDescriptionImage(fileName) {
  if (!isImageFile(fileName)) return false;
  const base = getBaseName(fileName).toLowerCase();
  return base === 'desc' || /^desc\d+$/.test(base);
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
 * Returns { files, images, descImages, outputEntries } — raw handles not yet read.
 *
 * Files are classified according to modeConfig.
 */
async function readFilesInDirectory(dirHandle, modeConfig) {
  const fileEntries   = [];
  const imageEntries  = [];
  const descImageEntries  = [];
  const outputEntries = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const name = entry.name;

    if (isImageFile(name)) {
      if (isDescriptionImage(name)) {
        descImageEntries.push({ entry, name });
      } else {
        imageEntries.push({ entry, name });
      }
    } else if (isOutputArtifact(name, modeConfig)) {
      outputEntries.push({ entry, name });
    } else if (isViewableFile(name, modeConfig)) {
      fileEntries.push({ entry, name });
    }
    // else: skip (binary, no extension, etc.)
  }

  return { fileEntries, imageEntries, descImageEntries, outputEntries };
}

// ── Recursive file reader (flat-mode deep scan) ────────────────────────────

/**
 * Recursively read ALL files from dirHandle and all nested subdirectories.
 * Returns { files, images, descImages, outputEntries } aggregated from the entire tree.
 * Each entry includes { entry, name, path } where path is the relative path.
 */
async function readFilesRecursively(dirHandle, modeConfig, basePath = '') {
  const SKIP = new Set(['.git', 'node_modules', '.DS_Store']);
  const fileEntries   = [];
  const imageEntries  = [];
  const descImageEntries  = [];
  const outputEntries = [];

  for await (const entry of dirHandle.values()) {
    if (SKIP.has(entry.name)) continue;

    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      const name = entry.name;
      if (isImageFile(name)) {
        if (isDescriptionImage(name)) {
          descImageEntries.push({ entry, name, path: entryPath });
        } else {
          imageEntries.push({ entry, name, path: entryPath });
        }
      } else if (isOutputArtifact(name, modeConfig)) {
        outputEntries.push({ entry, name, path: entryPath });
      } else if (isViewableFile(name, modeConfig)) {
        fileEntries.push({ entry, name, path: entryPath });
      }
    } else if (entry.kind === 'directory') {
      // Recurse into subdirectory
      const sub = await readFilesRecursively(entry, modeConfig, entryPath);
      fileEntries.push(...sub.fileEntries);
      imageEntries.push(...sub.imageEntries);
      descImageEntries.push(...sub.descImageEntries);
      outputEntries.push(...sub.outputEntries);
    }
  }

  return { fileEntries, imageEntries, descImageEntries, outputEntries };
}

/**
 * Materialize raw file handles into loaded data arrays.
 * Each viewable file gets: { name, ext, main, content, proseMode }
 */
async function materialize(fileEntries, imageEntries, descImageEntries, outputEntries, modeConfig) {
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

  // Regular images
  const images = [];
  for (const { entry, name } of imageEntries) {
    const dataUrl = await readImageDataUrlFromHandle(entry);
    if (dataUrl) images.push({ fileName: name, dataUrl });
  }

  // Description images
  const descImages = [];
  for (const { entry, name } of descImageEntries) {
    const dataUrl = await readImageDataUrlFromHandle(entry);
    if (dataUrl) descImages.push({ fileName: name, dataUrl });
  }

  // Output artifacts
  const outputSectionsCache = [];
  for (const { entry, name } of outputEntries) {
    const raw      = await readTextFromHandle(entry);
    const sections = extractOutputSections(raw);
    if (sections.length) outputSectionsCache.push({ fileName: name, sections });
  }

  return { files, images, descImages, outputSectionsCache };
}

/**
 * Group files by exercise number.
 * Used for folders with no number in name, or root-level files.
 */
async function groupFilesByNumber(fileEntries, imageEntries, descImageEntries, outputEntries, modeConfig) {
  const groups = new Map();
  const fallback = { fileEntries: [], imageEntries: [], descImageEntries: [], outputEntries: [] };

  const ensureGroup = (n) => {
    if (!groups.has(n)) {
      groups.set(n, { number: n, fileEntries: [], imageEntries: [], descImageEntries: [], outputEntries: [] });
    }
    return groups.get(n);
  };

  for (const item of fileEntries) {
    const n = extractExerciseNumber(item.name);
    const ext = getExt(item.name);
    if (STORAGE_OUTPUT_EXTS.has(ext)) {
      if (n !== null) ensureGroup(n).outputEntries.push(item);
      else fallback.outputEntries.push(item);
    } else {
      if (n !== null) ensureGroup(n).fileEntries.push(item);
      else fallback.fileEntries.push(item);
    }
  }

  for (const item of outputEntries) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).outputEntries.push(item);
    else fallback.outputEntries.push(item);
  }

  for (const item of imageEntries) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).imageEntries.push(item);
    else fallback.imageEntries.push(item);
  }

  for (const item of descImageEntries) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).descImageEntries.push(item);
    else fallback.descImageEntries.push(item);
  }

  const cards = [];
  const ordered = Array.from(groups.values()).sort((a, b) => a.number - b.number);

  for (const g of ordered) {
    const loaded = await materialize(g.fileEntries, g.imageEntries, g.descImageEntries, g.outputEntries, modeConfig);
    loaded.files.forEach(f => { f.main = true; });
    if (loaded.files.length || loaded.images.length || loaded.descImages.length || loaded.outputSectionsCache.length) {
      cards.push({
        name: `Exercise ${g.number}`,
        _mode: modeConfig.id,
        _notes: '',
        ...loaded,
      });
    }
  }

  if (fallback.fileEntries.length || fallback.imageEntries.length || fallback.descImageEntries.length || fallback.outputEntries.length) {
    const loaded = await materialize(fallback.fileEntries, fallback.imageEntries, fallback.descImageEntries, fallback.outputEntries, modeConfig);
    if (loaded.files.length || loaded.images.length || loaded.descImages.length || loaded.outputSectionsCache.length) {
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
 * Unified scan strategy:
 * 
 * 1. If a subfolder name contains a number (e.g., "1_Lab", "Exercise2"):
 *    - Recursively collect all files from it as a single section
 *    - Create one exercise card named after the folder
 *
 * 2. If a subfolder name has NO number (e.g., "utils", "helpers"):
 *    - Collect files from it and group by file NAME numbers
 *    - Create multiple cards by exercise number if found
 *
 * 3. If there are no subfolders but files at root:
 *    - Recursively collect ALL files from nested structure
 *    - Group by file NAME numbers
 *    - Create multiple cards by exercise number
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

  onProgress?.(10);

  // Collect immediate subdirectories
  const subdirEntries = [];
  for await (const entry of rootHandle.values()) {
    if (entry.kind === 'directory' && !SKIP.has(entry.name)) {
      subdirEntries.push({ entry, name: entry.name });
    }
  }
  subdirEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  onProgress?.(20);

  // Separate numbered from unnumbered folders
  const numFolders = [];
  const unNumFolders = [];
  for (const { entry, name } of subdirEntries) {
    if (extractExerciseNumber(name) !== null) {
      numFolders.push({ entry, name });
    } else {
      unNumFolders.push({ entry, name });
    }
  }

  // CASE 1: If there are numbered folders, process them (and ignore unnumbered)
  if (numFolders.length > 0) {
    let processed = 0;
    for (const { entry: dirHandle, name: dirName } of numFolders) {
      // FOLDER-NUMBER mode: treat entire folder as one section
      const allFiles = await readFilesRecursively(dirHandle, modeConfig);
      const loaded = await materialize(
        allFiles.fileEntries,
        allFiles.imageEntries,
        allFiles.descImageEntries,
        allFiles.outputEntries,
        modeConfig
      );
      // Auto-mark files in numbered folders as main
      loaded.files.forEach(f => { f.main = true; });
      if (loaded.files.length || loaded.images.length || loaded.descImages.length || loaded.outputSectionsCache.length) {
        cards.push({
          name: dirName,
          _mode: modeConfig.id,
          _notes: '',
          ...loaded,
        });
      }
      processed++;
      onProgress?.(20 + Math.round((processed / numFolders.length) * 70));
    }
  } 
  // CASE 2: If only unnumbered folders exist, treat them all as one pool
  else if (unNumFolders.length > 0) {
    // Recursively collect from ALL unnumbered folders + any root files
    let allCollected = { fileEntries: [], imageEntries: [], descImageEntries: [], outputEntries: [] };

    // Scan root level first
    const rootFiles = await readFilesInDirectory(rootHandle, modeConfig);
    allCollected.fileEntries.push(...rootFiles.fileEntries);
    allCollected.imageEntries.push(...rootFiles.imageEntries);
    allCollected.descImageEntries.push(...rootFiles.descImageEntries);
    allCollected.outputEntries.push(...rootFiles.outputEntries);

    // Then scan all unnumbered folders recursively
    for (const { entry: dirHandle } of unNumFolders) {
      const sub = await readFilesRecursively(dirHandle, modeConfig);
      allCollected.fileEntries.push(...sub.fileEntries);
      allCollected.imageEntries.push(...sub.imageEntries);
      allCollected.descImageEntries.push(...sub.descImageEntries);
      allCollected.outputEntries.push(...sub.outputEntries);
    }

    // Group everything by file numbers globally
    const grouped = await groupFilesByNumber(
      allCollected.fileEntries,
      allCollected.imageEntries,
      allCollected.descImageEntries,
      allCollected.outputEntries,
      modeConfig
    );
    cards.push(...grouped);

    onProgress?.(90);
  } 
  // CASE 3: No subfolders
  else {
    // NO SUBFOLDERS: check for root-level files
    const { fileEntries, imageEntries, descImageEntries, outputEntries } = await readFilesInDirectory(rootHandle, modeConfig);

    if (fileEntries.length || imageEntries.length || descImageEntries.length || outputEntries.length) {
      // Recursively collect all nested files
      const allFiles = await readFilesRecursively(rootHandle, modeConfig);
      // Group by file NAME numbers
      const grouped = await groupFilesByNumber(
        allFiles.fileEntries,
        allFiles.imageEntries,
        allFiles.descImageEntries,
        allFiles.outputEntries,
        modeConfig
      );
      cards.push(...grouped);
    }

    onProgress?.(90);
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
  const { files } = await materialize(fileEntries, [], [], [], modeConfig);
  return files;
}
