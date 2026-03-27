import { getAppConfig } from './app-config-resolver.js';

const APP_CFG = getAppConfig();
const SECTION_MARKERS = APP_CFG.output.sectionMarkers;

function stripNoise(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(l => {
      const t = l.trim();
      if (!t) return true;
      if (/^[A-Za-z]:\\.*\.exe.*exited with code/i.test(t)) return false;
      if (/^Press any key to close this window/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/^\s+|\s+$/g, '');
}

export function extractOutputSections(rawText) {
  if (!rawText) return [];
  const rx = new RegExp(
    `(?:^|\\r?\\n)(?:${SECTION_MARKERS.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\r?\\n|$)`,
    'g'
  );
  return String(rawText).split(rx).map(stripNoise).filter(Boolean);
}

export function extractDescription(content) {
  if (!content) return '';
  const m = String(content).match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!m) return '';
  return m[1]
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

export function stripLeadingComment(content) {
  return content ? String(content).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '') : '';
}
