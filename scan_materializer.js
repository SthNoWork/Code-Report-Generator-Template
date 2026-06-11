import { readTextFromHandle, readImageDataUrlFromHandle, readDataUrlFromHandle } from './scan_file-readers.js';
import { getExt, extractExerciseNumber, isPrimarySourceFile, getAttachmentSupports } from './scan_file-classifier.js';
import { extractDescription, stripLeadingComment, extractOutputSections } from './scan_output-parser.js';

function toPathMeta(name, path) {
  const rel = String(path || name || '');
  const idx = rel.lastIndexOf('/');
  return {
    path: rel,
    directory: idx > -1 ? rel.slice(0, idx) : ''
  };
}

function getAttachmentReader(readAs) {
  return readAs === 'image-data-url' ? readImageDataUrlFromHandle : readDataUrlFromHandle;
}

export async function materializeScanEntries(scanEntries, modeConfig) {
  const {
    fileEntries = [],
    descTxtEntries = [],
    outputEntries = [],
  } = scanEntries || {};

  const supports = getAttachmentSupports();
  const files = [];
  const attachmentResults = {};
  supports.forEach(support => {
    attachmentResults[support.exerciseKey] = [];
    attachmentResults[support.descExerciseKey] = [];
  });
  let descFromComment = '';
  let blockId = 1;
  const blockRows = [];

  const pushBlockRow = (row) => {
    blockRows.push({
      id: `block-${blockId++}`,
      ...row
    });
  };

  const fileReads = await Promise.all(
    fileEntries.map(async ({ entry, name, path }) => ({ name, path, raw: await readTextFromHandle(entry) }))
  );

  for (const { name, path, raw } of fileReads) {
    if (!raw && raw !== '') continue;
    if (raw.includes('\u0000')) continue;

    const main = isPrimarySourceFile(name, modeConfig);
    let content = raw;
    if (modeConfig.descExtractionEnabled && main) {
      if (!descFromComment) {
        const extracted = extractDescription(raw);
        if (extracted) descFromComment = extracted;
      }
      content = stripLeadingComment(raw);
    }

    const ext = getExt(name);
    const proseMode = modeConfig.renderAsProse({ ext });
    files.push({ name, ext, main, content, proseMode });

    const meta = toPathMeta(name, path);
    pushBlockRow({
      kind: 'code',
      name,
      ext,
      directory: meta.directory,
      path: meta.path,
      states: {
        buildAsExerciseDesc: false,
        isMain: main,
        isOutput: false,
        isImage: false,
      },
      payload: { content, proseMode }
    });
  }

  files.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  for (const support of supports) {
    const readData = getAttachmentReader(support.readAs);
    const normalEntries = Array.isArray(scanEntries?.[support.entryKey]) ? scanEntries[support.entryKey] : [];
    const descEntries = Array.isArray(scanEntries?.[support.descEntryKey]) ? scanEntries[support.descEntryKey] : [];

    const normalReads = await Promise.all(
      normalEntries.map(async ({ entry, name, path }) => ({ fileName: name, path, dataUrl: await readData(entry) }))
    );

    normalReads.filter(item => !!item.dataUrl).forEach(item => {
      attachmentResults[support.exerciseKey].push(item);
      const meta = toPathMeta(item.fileName, item.path);
      pushBlockRow({
        kind: support.blockKind,
        name: item.fileName,
        ext: getExt(item.fileName),
        directory: meta.directory,
        path: meta.path,
        states: {
          buildAsExerciseDesc: false,
          isMain: false,
          isOutput: false,
          isImage: support.visibilityGroup === 'image',
        },
        payload: { dataUrl: item.dataUrl }
      });
    });

    const descReads = await Promise.all(
      descEntries.map(async ({ entry, name, path }) => ({ fileName: name, path, dataUrl: await readData(entry) }))
    );

    descReads.filter(item => !!item.dataUrl).forEach(item => {
      attachmentResults[support.descExerciseKey].push(item);
      const meta = toPathMeta(item.fileName, item.path);
      pushBlockRow({
        kind: support.descBlockKind,
        name: item.fileName,
        ext: getExt(item.fileName),
        directory: meta.directory,
        path: meta.path,
        states: {
          buildAsExerciseDesc: true,
          isMain: false,
          isOutput: false,
          isImage: support.descVisibilityGroup === 'image',
        },
        payload: { dataUrl: item.dataUrl }
      });
    });
  }

  const descTexts = await Promise.all(
    descTxtEntries.map(async ({ entry, name, path }) => ({ fileName: name, path, text: (await readTextFromHandle(entry) || '').trim() }))
  );

  descTexts.sort((a, b) => {
    const an = extractExerciseNumber(a.fileName) ?? Number.MAX_SAFE_INTEGER;
    const bn = extractExerciseNumber(b.fileName) ?? Number.MAX_SAFE_INTEGER;
    return an - bn || a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
  });

  descTexts.forEach(desc => {
    const meta = toPathMeta(desc.fileName, desc.path);
    pushBlockRow({
      kind: 'desc-text',
      name: desc.fileName,
      ext: getExt(desc.fileName),
      directory: meta.directory,
      path: meta.path,
      states: {
        buildAsExerciseDesc: true,
        isMain: false,
        isOutput: false,
        isImage: false,
      },
      payload: { text: desc.text }
    });
  });

  const outputReads = await Promise.all(
    outputEntries.map(async ({ entry, name, path }) => {
      const raw = await readTextFromHandle(entry);
      const sections = extractOutputSections(raw);
      return { fileName: name, path, sections: sections.length ? sections : [raw || ''] };
    })
  );

  const outputSectionsCache = outputReads.filter(Boolean);
  outputSectionsCache.forEach(entry => {
    const meta = toPathMeta(entry.fileName, entry.path);
    entry.sections.forEach((section, sectionIdx) => {
      pushBlockRow({
        kind: 'output',
        name: entry.fileName,
        ext: getExt(entry.fileName),
        directory: meta.directory,
        path: meta.path,
        states: {
          buildAsExerciseDesc: false,
          isMain: false,
          isOutput: true,
          isImage: false,
        },
        payload: { section, sectionIdx, sectionTotal: entry.sections.length }
      });
    });
  });

  if (descFromComment) {
    pushBlockRow({
      kind: 'desc-text',
      name: 'main comment',
      ext: 'txt',
      directory: '',
      path: 'main comment',
      states: {
        buildAsExerciseDesc: true,
        isMain: true,
        isOutput: false,
        isImage: false,
      },
      payload: {
        text: descFromComment,
        source: 'comment'
      }
    });
  }

  return {
    files,
    ...attachmentResults,
    descTexts,
    descFromComment,
    outputSectionsCache,
    blockRows,
  };
}
