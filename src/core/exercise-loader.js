export async function readTextFromFileHandle(fileHandle) {
  try {
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return '';
  }
}

export async function readImageFromFileHandle(fileHandle) {
  try {
    const file = await fileHandle.getFile();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  } catch {
    return '';
  }
}

export async function readExerciseFromDirectoryHandle(exerciseHandle, helpers) {
  const {
    isImageFile,
    isOutputArtifact,
    isCodeSourceFile,
    normalizeExtension,
    isPrimarySourceFileName,
    extractReportOutputSections
  } = helpers;

  const files = [];
  const outputEntries = [];
  const imageEntries = [];

  for await (const entry of exerciseHandle.values()) {
    if (entry.kind !== 'file') continue;
    const fileName = entry.name;

    if (isImageFile(fileName)) {
      const dataUrl = await readImageFromFileHandle(entry);
      if (dataUrl) imageEntries.push({ fileName, dataUrl });
      continue;
    }

    if (isOutputArtifact(fileName)) {
      const raw = await readTextFromFileHandle(entry);
      const sections = extractReportOutputSections(raw);
      if (sections.length) outputEntries.push({ fileName, sections });
      continue;
    }

    if (!isCodeSourceFile(fileName)) continue;

    const content = await readTextFromFileHandle(entry);
    if (!content || content.includes('\u0000')) continue;

    files.push({
      name: fileName,
      ext: normalizeExtension(fileName),
      main: isPrimarySourceFileName(fileName),
      content
    });
  }

  files.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    name: exerciseHandle.name,
    files,
    images: imageEntries,
    outputSectionsCache: outputEntries
  };
}

export async function loadGeneralExercisesFromDirectoryHandle(rootHandle, options) {
  const {
    rootName,
    readExercise,
    setProgress,
    includeSubdirsWhenRootEmpty = true
  } = options;

  const generalData = [];

  // Reuse the same exercise loader for root-level files by treating root as one exercise card.
  const rootExercise = await readExercise(rootHandle, rootName || 'Files');

  setProgress?.(40);

  if (rootExercise.files.length || rootExercise.images.length) {
    generalData.push(rootExercise);
    return generalData;
  }

  if (!includeSubdirsWhenRootEmpty) return generalData;

  for await (const entry of rootHandle.values()) {
    if (entry.kind !== 'directory' || entry.name === '.git') continue;
    const ex = await readExercise(entry, entry.name);
    if (ex.files.length || ex.images.length) generalData.push(ex);
  }

  generalData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return generalData;
}
