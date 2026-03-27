import {
  getAttachmentSupports,
  getAttachmentSupport,
  isDescriptionBaseName,
  isDescriptionTxt,
  isOutputArtifact,
  isViewableFile,
} from './scan_file-classifier.js';
import { getAppConfig } from './app-config-resolver.js';

const APP_CFG = getAppConfig();
const SKIP_DIRS = new Set(APP_CFG.fileDiscovery.skipDirectories || ['.git', 'node_modules', '.DS_Store']);

function createAttachmentBuckets() {
  const buckets = {};
  getAttachmentSupports().forEach(support => {
    buckets[support.entryKey] = [];
    buckets[support.descEntryKey] = [];
  });
  return buckets;
}

function classifyAttachmentName(fileName) {
  const support = getAttachmentSupport(fileName);
  if (!support) return null;
  const entryKey = isDescriptionBaseName(fileName) ? support.descEntryKey : support.entryKey;
  return { support, entryKey };
}

export async function readFilesInDirectory(dirHandle, modeConfig) {
  const fileEntries = [];
  const attachmentBuckets = createAttachmentBuckets();
  const descTxtEntries = [];
  const outputEntries = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const name = entry.name;

    const attachment = classifyAttachmentName(name);
    if (attachment) {
      attachmentBuckets[attachment.entryKey].push({ entry, name });
    } else if (isDescriptionTxt(name)) {
      descTxtEntries.push({ entry, name });
    } else if (isOutputArtifact(name, modeConfig)) {
      outputEntries.push({ entry, name });
    } else if (isViewableFile(name, modeConfig)) {
      fileEntries.push({ entry, name });
    }
  }

  return { fileEntries, ...attachmentBuckets, descTxtEntries, outputEntries };
}

export async function readFilesRecursively(dirHandle, modeConfig, basePath = '') {
  const fileEntries = [];
  const attachmentBuckets = createAttachmentBuckets();
  const descTxtEntries = [];
  const outputEntries = [];

  for await (const entry of dirHandle.values()) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      const name = entry.name;
      const attachment = classifyAttachmentName(name);
      if (attachment) {
        attachmentBuckets[attachment.entryKey].push({ entry, name, path: entryPath });
      } else if (isDescriptionTxt(name)) {
        descTxtEntries.push({ entry, name, path: entryPath });
      } else if (isOutputArtifact(name, modeConfig)) {
        outputEntries.push({ entry, name, path: entryPath });
      } else if (isViewableFile(name, modeConfig)) {
        fileEntries.push({ entry, name, path: entryPath });
      }
    } else if (entry.kind === 'directory') {
      const sub = await readFilesRecursively(entry, modeConfig, entryPath);
      fileEntries.push(...sub.fileEntries);
      getAttachmentSupports().forEach(support => {
        attachmentBuckets[support.entryKey].push(...(sub[support.entryKey] || []));
        attachmentBuckets[support.descEntryKey].push(...(sub[support.descEntryKey] || []));
      });
      descTxtEntries.push(...sub.descTxtEntries);
      outputEntries.push(...sub.outputEntries);
    }
  }

  return { fileEntries, ...attachmentBuckets, descTxtEntries, outputEntries };
}

export function shouldSkipSubdir(name) {
  return SKIP_DIRS.has(name);
}
