import { extractExerciseNumber, getAttachmentSupports } from './scan_file-classifier.js';
import { readFilesInDirectory, readFilesRecursively, shouldSkipSubdir } from './scan_directory-reader.js';
import { materializeScanEntries } from './scan_materializer.js';

const ATTACHMENT_SUPPORTS = getAttachmentSupports();

function createCollectedEntries() {
  const collected = { fileEntries: [], descTxtEntries: [], outputEntries: [] };
  ATTACHMENT_SUPPORTS.forEach(support => {
    collected[support.entryKey] = [];
    collected[support.descEntryKey] = [];
  });
  return collected;
}

function mergeCollectedEntries(target, source) {
  target.fileEntries.push(...(source.fileEntries || []));
  target.descTxtEntries.push(...(source.descTxtEntries || []));
  target.outputEntries.push(...(source.outputEntries || []));
  ATTACHMENT_SUPPORTS.forEach(support => {
    target[support.entryKey].push(...(source[support.entryKey] || []));
    target[support.descEntryKey].push(...(source[support.descEntryKey] || []));
  });
}

function hasMaterializedContent(loaded) {
  if (!loaded) return false;
  if (loaded.files?.length || loaded.descTexts?.length || loaded.descFromComment || loaded.outputSectionsCache?.length) return true;
  return ATTACHMENT_SUPPORTS.some(support => (loaded[support.exerciseKey]?.length || loaded[support.descExerciseKey]?.length));
}

async function groupFilesByNumber(allEntries, modeConfig) {
  const groups = new Map();
  const fallback = createCollectedEntries();

  const ensureGroup = (n) => {
    if (!groups.has(n)) {
      groups.set(n, { number: n, ...createCollectedEntries() });
    }
    return groups.get(n);
  };

  for (const item of allEntries.fileEntries || []) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).fileEntries.push(item);
    else fallback.fileEntries.push(item);
  }

  for (const item of allEntries.outputEntries || []) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).outputEntries.push(item);
    else fallback.outputEntries.push(item);
  }

  ATTACHMENT_SUPPORTS.forEach(support => {
    for (const item of allEntries[support.entryKey] || []) {
      const n = extractExerciseNumber(item.name);
      if (n !== null) ensureGroup(n)[support.entryKey].push(item);
      else fallback[support.entryKey].push(item);
    }

    for (const item of allEntries[support.descEntryKey] || []) {
      const n = extractExerciseNumber(item.name);
      if (n !== null) ensureGroup(n)[support.descEntryKey].push(item);
      else fallback[support.descEntryKey].push(item);
    }
  });

  for (const item of allEntries.descTxtEntries || []) {
    const n = extractExerciseNumber(item.name);
    if (n !== null) ensureGroup(n).descTxtEntries.push(item);
    else fallback.descTxtEntries.push(item);
  }

  const cards = [];
  const ordered = Array.from(groups.values()).sort((a, b) => a.number - b.number);

  for (const g of ordered) {
    const loaded = await materializeScanEntries(g, modeConfig);
    loaded.files.forEach(f => { f.main = true; });
    if (hasMaterializedContent(loaded)) {
      cards.push({
        name: `Exercise ${g.number}`,
        _mode: modeConfig.id,
        _notes: '',
        ...loaded,
      });
    }
  }

  if (Object.values(fallback).some(arr => Array.isArray(arr) && arr.length)) {
    const loaded = await materializeScanEntries(fallback, modeConfig);
    if (hasMaterializedContent(loaded)) {
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

export async function scanFolder(rootHandle, rootName, modeConfig, onProgress) {
  const cards = [];

  onProgress?.(10);

  const subdirEntries = [];
  for await (const entry of rootHandle.values()) {
    if (entry.kind === 'directory' && !shouldSkipSubdir(entry.name)) {
      subdirEntries.push({ entry, name: entry.name });
    }
  }
  subdirEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  onProgress?.(20);

  const numFolders = [];
  const unNumFolders = [];
  for (const { entry, name } of subdirEntries) {
    if (extractExerciseNumber(name) !== null) numFolders.push({ entry, name });
    else unNumFolders.push({ entry, name });
  }

  if (numFolders.length > 0) {
    let processed = 0;
    for (const { entry: dirHandle, name: dirName } of numFolders) {
      const allFiles = await readFilesRecursively(dirHandle, modeConfig);
      const loaded = await materializeScanEntries(allFiles, modeConfig);
      loaded.files.forEach(f => { f.main = true; });
      if (hasMaterializedContent(loaded)) {
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
  } else if (unNumFolders.length > 0) {
    const allCollected = createCollectedEntries();

    const rootFiles = await readFilesInDirectory(rootHandle, modeConfig);
    mergeCollectedEntries(allCollected, rootFiles);

    for (const { entry: dirHandle } of unNumFolders) {
      const sub = await readFilesRecursively(dirHandle, modeConfig);
      mergeCollectedEntries(allCollected, sub);
    }

    const grouped = await groupFilesByNumber(allCollected, modeConfig);
    cards.push(...grouped);

    onProgress?.(90);
  } else {
    const rootFiles = await readFilesInDirectory(rootHandle, modeConfig);

    if (Object.values(rootFiles).some(arr => Array.isArray(arr) && arr.length)) {
      const allFiles = await readFilesRecursively(rootHandle, modeConfig);
      const grouped = await groupFilesByNumber(allFiles, modeConfig);
      cards.push(...grouped);
    }

    onProgress?.(90);
  }

  onProgress?.(100);
  return cards;
}

export async function scanUtilsFolder(handle, modeConfig) {
  const { fileEntries } = await readFilesInDirectory(handle, modeConfig);
  const { files } = await materializeScanEntries({ fileEntries }, modeConfig);
  return files;
}
