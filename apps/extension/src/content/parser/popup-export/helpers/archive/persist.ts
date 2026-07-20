import type { ExportResult } from '@sniptale/runtime-contracts/export';
import { fallbackToDirectDownload } from './fallback';

export async function persistPopupExportArchive(result: ExportResult): Promise<string[]> {
  if (!result.blob || !result.filename) {
    return [];
  }

  return fallbackToDirectDownload(result);
}
