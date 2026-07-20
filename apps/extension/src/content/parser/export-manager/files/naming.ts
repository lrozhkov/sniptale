import type { ExportData, ExportPagePackage } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';

export function getMoscowTimestamp(): string {
  return getMoscowFilenameTimestamp();
}

export function sanitizeFilename(text: string, maxLength = 50): string {
  return text
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_')
    .substring(0, maxLength);
}

export function buildExportArchiveBaseName(
  treeData: ParsedDOMTree,
  data: ExportData | null,
  timestamp = getMoscowTimestamp()
): string {
  const sanitizedTitle = sanitizeFilename(data?.meta?.title || treeData.title || 'export', 50);
  return `${sanitizedTitle}_${timestamp}`;
}

export function createEmptyExportPagePackage(
  archiveBaseName: string
): Pick<ExportPagePackage, 'archiveBaseName' | 'entries'> {
  return {
    archiveBaseName,
    entries: [],
  };
}
