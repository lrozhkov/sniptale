import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { PopupExportSelection } from './state';

export function buildPopupExportOptions(selection: PopupExportSelection): ExportOptions {
  return {
    ...(selection.includeAnnotations ? { includeAnnotations: true } : {}),
    includeBasicLogs: selection.includeBasicLogs,
    includeCssDiagnostics: selection.includeCssDiagnostics,
    includeFiles: selection.includeFiles,
    includeFullPageScreenshot: selection.includeFullPageScreenshot,
    ...(selection.includeViewportScreenshot === true ? { includeViewportScreenshot: true } : {}),
    includePageDiagnostics: selection.includePageDiagnostics,
    includeImages: selection.includeImages,
    includeJson: selection.includeJson,
    includeMarkdown: selection.includeMarkdown,
  };
}
