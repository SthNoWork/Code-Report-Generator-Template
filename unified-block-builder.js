import { getAppConfig } from './app-config-resolver.js';
import { getAttachmentSupports, getAttachmentSupport, isDescriptionBaseName } from './scan_file-classifier.js';

const CFG = getAppConfig();
const MAIN_COMMENT_NAME = CFG.labels.mainCommentName || 'main comment';
const ATTACHMENT_SUPPORTS = getAttachmentSupports();

function getExt(fileName) {
  const idx = String(fileName || '').lastIndexOf('.');
  return (idx > 0 && idx < String(fileName).length - 1)
    ? String(fileName).slice(idx + 1).toLowerCase()
    : '';
}

function getAttachmentSupportByExt(ext) {
  const normalized = String(ext || '').toLowerCase();
  if (!normalized) return null;
  return ATTACHMENT_SUPPORTS.find(support => support.extensions.has(normalized)) || null;
}

function createAttachmentBuckets() {
  const buckets = {};
  ATTACHMENT_SUPPORTS.forEach(support => {
    buckets[support.exerciseKey] = [];
    buckets[support.descExerciseKey] = [];
  });
  return buckets;
}

function extractFileNumber(fileName) {
  const matches = String(fileName || '').match(/\d+/g);
  if (!matches || !matches.length) return null;
  const value = Number.parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(value) ? value : null;
}

function compareByFileName(a, b) {
  const an = String(a || '').toLowerCase();
  const bn = String(b || '').toLowerCase();
  return an.localeCompare(bn, undefined, { numeric: true });
}

function setVisibilityForBlocks(blocks, visible) {
  blocks.forEach(block => {
    block.style.display = visible ? '' : 'none';
  });
}

function splitOutputSections(text, markers = ['=== CUT ===']) {
  const rawText = String(text || '');
  if (!rawText.trim()) return [];
  const safeMarkers = Array.isArray(markers) && markers.length ? markers : ['=== CUT ==='];
  const rx = new RegExp(
    `(?:^|\\r?\\n)(?:${safeMarkers.map(m => String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\r?\\n|$)`,
    'g'
  );
  return rawText.split(rx).map(part => part.trim()).filter(Boolean);
}

function normalizeBuildConfig(buildConfig = {}) {
  const next = {
    codeMode: true,
    utilsTag: false,
    includeEmptyOutputBlock: false,
    state: {},
    booleans: {},
    outputSectionMarkers: ['=== CUT ==='],
    ...buildConfig
  };

  next.booleans = {
    exerciseDescImage: true,
    exerciseDescTxt: true,
    ...(buildConfig.booleans || {})
  };

  next.state = {
    code: next.codeMode,
    output: true,
    image: true,
    descText: true,
    descImage: true,
    emptyOutput: next.includeEmptyOutputBlock,
    ...(buildConfig.state || {})
  };

  return next;
}

function normalizeGroupedData(inputEx = {}, cfg) {
  const genericFiles = Array.isArray(inputEx.files) ? inputEx.files : [];

  if (Array.isArray(inputEx.blockRows) && inputEx.blockRows.length) {
    const fromRows = {
      files: [],
      outputSectionsCache: [],
      descTexts: [],
      ...createAttachmentBuckets(),
      descFromComment: ''
    };

    inputEx.blockRows.forEach(row => {
      const kind = row?.kind || '';
      const name = row?.name || row?.fileName || '';
      const ext = String(row?.ext || getExt(name)).toLowerCase();
      const payload = row?.payload || {};
      const states = row?.states || {};

      if (kind === 'code') {
        fromRows.files.push({
          name,
          ext,
          main: Boolean(states.isMain),
          content: String(payload.content ?? ''),
          proseMode: Boolean(payload.proseMode)
        });
        return;
      }

      if (kind === 'output') {
        const section = String(payload.section ?? '');
        if (!section.trim()) return;
        fromRows.outputSectionsCache.push({
          fileName: name,
          sections: [section]
        });
        return;
      }

      const kindSupport = ATTACHMENT_SUPPORTS.find(support => support.blockKind === kind || support.descBlockKind === kind);
      if (kindSupport && payload.dataUrl) {
        const key = kind === kindSupport.descBlockKind ? kindSupport.descExerciseKey : kindSupport.exerciseKey;
        fromRows[key].push({ fileName: name, dataUrl: payload.dataUrl });
        return;
      }

      if (kind === 'desc-text') {
        const text = String(payload.text ?? '').trim();
        if (!text) return;
        if (payload.source === 'comment' || name === MAIN_COMMENT_NAME) {
          if (!fromRows.descFromComment) fromRows.descFromComment = text;
        } else {
          fromRows.descTexts.push({ fileName: name, text });
        }
        return;
      }

      // Fallback for unknown row kind using states/ext hints.
      const extSupport = getAttachmentSupport(name) || getAttachmentSupportByExt(ext);
      if (extSupport && payload.dataUrl) {
        const key = states.buildAsExerciseDesc ? extSupport.descExerciseKey : extSupport.exerciseKey;
        fromRows[key].push({ fileName: name, dataUrl: payload.dataUrl });
        return;
      }

      if (ext === 'txt' && states.buildAsExerciseDesc) {
        const text = String(payload.text ?? payload.content ?? '').trim();
        if (text) fromRows.descTexts.push({ fileName: name, text });
        return;
      }

      if (states.isOutput) {
        const section = String(payload.section ?? payload.content ?? '').trim();
        if (section) fromRows.outputSectionsCache.push({ fileName: name, sections: [section] });
        return;
      }

      fromRows.files.push({
        name,
        ext,
        main: Boolean(states.isMain),
        content: String(payload.content ?? payload.text ?? ''),
        proseMode: Boolean(payload.proseMode)
      });
    });

    return fromRows;
  }

  // If caller already provides grouped arrays from scanner, use those directly.
  const alreadyGrouped =
    Array.isArray(inputEx.outputSectionsCache) ||
    Array.isArray(inputEx.descTexts) ||
    ATTACHMENT_SUPPORTS.some(support => Array.isArray(inputEx[support.exerciseKey]) || Array.isArray(inputEx[support.descExerciseKey]));

  if (alreadyGrouped) {
    return {
      files: inputEx.files || [],
      outputSectionsCache: inputEx.outputSectionsCache || [],
      descTexts: inputEx.descTexts || [],
      ...Object.fromEntries(
        ATTACHMENT_SUPPORTS.flatMap(support => [
          [support.exerciseKey, inputEx[support.exerciseKey] || []],
          [support.descExerciseKey, inputEx[support.descExerciseKey] || []],
        ])
      ),
      descFromComment: inputEx.descFromComment || ''
    };
  }

  const grouped = {
    files: [],
    outputSectionsCache: [],
    descTexts: [],
    ...createAttachmentBuckets(),
    descFromComment: inputEx.descFromComment || ''
  };

  genericFiles.forEach(item => {
    const name = item?.name || item?.fileName || '';
    const ext = String(item?.ext || getExt(name)).toLowerCase();

    if (!name) return;

    if (item && Array.isArray(item.sections)) {
      if (item.sections.length) {
        grouped.outputSectionsCache.push({ fileName: name, sections: item.sections });
      }
      return;
    }

    const support = getAttachmentSupport(name) || getAttachmentSupportByExt(ext);
    if (support && item?.dataUrl) {
      const isDesc = cfg.booleans.exerciseDescImage && isDescriptionBaseName(name);
      const key = isDesc ? support.descExerciseKey : support.exerciseKey;
      grouped[key].push({ fileName: name, dataUrl: item.dataUrl });
      return;
    }

    if (ext === 'txt' && cfg.booleans.exerciseDescTxt && isDescriptionBaseName(name)) {
      grouped.descTexts.push({ fileName: name, text: String(item?.text ?? item?.content ?? '').trim() });
      return;
    }

    if (ext === 'txt' && item?.content && (name.toLowerCase().includes('output') || name.toLowerCase() === 'output.txt')) {
      const sections = splitOutputSections(item.content, cfg.outputSectionMarkers);
      if (sections.length) grouped.outputSectionsCache.push({ fileName: name, sections });
      return;
    }

    grouped.files.push({
      name,
      ext,
      main: Boolean(item?.main),
      content: String(item?.content ?? item?.text ?? ''),
      proseMode: Boolean(item?.proseMode)
    });
  });

  return grouped;
}

export function buildUnifiedBlocks({
  ex,
  files,
  modeConfig,
  renderOutputContent,
  buildBlock,
  buildConfig = {}
}) {
  if (typeof buildBlock !== 'function') {
    throw new Error('buildUnifiedBlocks requires a buildBlock function');
  }

  const cfg = normalizeBuildConfig(buildConfig);
  const source = ex || { files: Array.isArray(files) ? files : [] };
  const grouped = normalizeGroupedData(source, cfg);

  const descTexts = grouped.descTexts;
  const codeFiles = grouped.files;
  const outputs = grouped.outputSectionsCache;

  const registry = {
    code: [],
    output: [],
    descText: [],
    emptyOutput: []
  };
  ATTACHMENT_SUPPORTS.forEach(support => {
    registry[`attachment:${support.id}`] = [];
    registry[`attachment-desc:${support.id}`] = [];
  });

  const fragment = document.createDocumentFragment();

  const appendBlock = (block, type) => {
    if (!block) return;
    registry[type].push(block);
    fragment.appendChild(block);
  };

  const allNamedItems = [];
  descTexts.forEach(d => allNamedItems.push(d.fileName));
  codeFiles.forEach(f => allNamedItems.push(f.name));
  outputs.forEach(o => allNamedItems.push(o.fileName));
  ATTACHMENT_SUPPORTS.forEach(support => {
    (grouped[support.descExerciseKey] || []).forEach(item => allNamedItems.push(item.fileName));
    (grouped[support.exerciseKey] || []).forEach(item => allNamedItems.push(item.fileName));
  });

  const hasNumberedItems = allNamedItems.some(name => extractFileNumber(name) !== null);

  const appendDescText = (fileName, text, sourceType) => {
    appendBlock(buildBlock({ type: 'desc-text', fileName, text, source: sourceType }), 'descText');
  };

  const appendAttachment = (support, item, isDescription) => {
    const type = isDescription ? support.descBuildType : support.buildType;
    const registryKey = isDescription ? `attachment-desc:${support.id}` : `attachment:${support.id}`;
    appendBlock(buildBlock({ type, fileName: item.fileName, dataUrl: item.dataUrl }), registryKey);
  };

  const appendCode = (file) => {
    if (!cfg.codeMode) return;
    appendBlock(buildBlock({ type: 'code', file, ex: source, modeConfig }), 'code');
  };

  const appendOutputEntry = (entry) => {
    (entry.sections || []).forEach((section, i) => {
      appendBlock(
        buildBlock({
          type: 'output',
          fileName: entry.fileName,
          section,
          sectionIdx: i,
          sectionTotal: entry.sections.length,
          renderContent: renderOutputContent
        }),
        'output'
      );
    });
  };

  const maybeAppendEmptyOutput = () => {
    if (!outputs.length && cfg.includeEmptyOutputBlock) {
      appendBlock(buildBlock({ type: 'empty-output' }), 'emptyOutput');
    }
  };

  const renderGroup = (group) => {
    group.descTexts
      .slice()
      .sort((a, b) => compareByFileName(a.fileName, b.fileName))
      .forEach(desc => appendDescText(desc.fileName, desc.text, 'file'));

    ATTACHMENT_SUPPORTS.forEach(support => {
      (group[support.descExerciseKey] || [])
        .slice()
        .sort((a, b) => compareByFileName(a.fileName, b.fileName))
        .forEach(item => appendAttachment(support, item, true));
    });

    group.files
      .slice()
      .sort((a, b) => compareByFileName(a.name, b.name))
      .forEach(appendCode);

    group.outputs
      .slice()
      .sort((a, b) => compareByFileName(a.fileName, b.fileName))
      .forEach(appendOutputEntry);

    ATTACHMENT_SUPPORTS.forEach(support => {
      (group[support.exerciseKey] || [])
        .slice()
        .sort((a, b) => compareByFileName(a.fileName, b.fileName))
        .forEach(item => appendAttachment(support, item, false));
    });
  };

  if (!hasNumberedItems) {
    descTexts.forEach(desc => appendDescText(desc.fileName, desc.text, 'file'));
    if (grouped.descFromComment) appendDescText(MAIN_COMMENT_NAME, grouped.descFromComment, 'comment');
    ATTACHMENT_SUPPORTS.forEach(support => {
      (grouped[support.descExerciseKey] || []).forEach(item => appendAttachment(support, item, true));
    });
    codeFiles.forEach(appendCode);
    outputs.forEach(appendOutputEntry);
    maybeAppendEmptyOutput();
    ATTACHMENT_SUPPORTS.forEach(support => {
      (grouped[support.exerciseKey] || []).forEach(item => appendAttachment(support, item, false));
    });
  } else {
    const groups = new Map();
    const fallback = { descTexts: [], files: [], outputs: [], ...createAttachmentBuckets() };

    const ensureGroup = (n) => {
      if (!groups.has(n)) {
        groups.set(n, { number: n, descTexts: [], files: [], outputs: [], ...createAttachmentBuckets() });
      }
      return groups.get(n);
    };

    const assign = (fileName, key, item) => {
      const n = extractFileNumber(fileName);
      if (n === null) fallback[key].push(item);
      else ensureGroup(n)[key].push(item);
    };

    descTexts.forEach(item => assign(item.fileName, 'descTexts', item));
    ATTACHMENT_SUPPORTS.forEach(support => {
      (grouped[support.descExerciseKey] || []).forEach(item => assign(item.fileName, support.descExerciseKey, item));
    });
    codeFiles.forEach(item => assign(item.name, 'files', item));
    outputs.forEach(item => assign(item.fileName, 'outputs', item));
    ATTACHMENT_SUPPORTS.forEach(support => {
      (grouped[support.exerciseKey] || []).forEach(item => assign(item.fileName, support.exerciseKey, item));
    });

    if (grouped.descFromComment) appendDescText(MAIN_COMMENT_NAME, grouped.descFromComment, 'comment');

    Array.from(groups.values()).sort((a, b) => a.number - b.number).forEach(renderGroup);
    renderGroup(fallback);
    maybeAppendEmptyOutput();
  }

  const currentState = { ...cfg.state };

  const updateState = (patch = {}) => {
    Object.assign(currentState, patch);
    setVisibilityForBlocks(registry.code, Boolean(currentState.code));
    setVisibilityForBlocks(registry.output, Boolean(currentState.output));
    setVisibilityForBlocks(registry.descText, Boolean(currentState.descText));
    ATTACHMENT_SUPPORTS.forEach(support => {
      setVisibilityForBlocks(registry[`attachment:${support.id}`], Boolean(currentState[support.visibilityGroup]));
      setVisibilityForBlocks(registry[`attachment-desc:${support.id}`], Boolean(currentState[support.descVisibilityGroup]));
    });
    setVisibilityForBlocks(registry.emptyOutput, Boolean(currentState.emptyOutput));
  };

  updateState();

  return {
    fragment,
    updateState,
    getState: () => ({ ...currentState }),
    meta: {
      utilsTag: Boolean(cfg.utilsTag),
      codeMode: Boolean(cfg.codeMode)
    }
  };
}

export function applyBlockStatePatch(body, statePatch) {
  body?.__exerciseBlocks?.updateState?.(statePatch);
}
