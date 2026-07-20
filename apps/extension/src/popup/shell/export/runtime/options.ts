import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { PopupExportSelection } from './state';

export function buildPopupExportOptions(selection: PopupExportSelection): ExportOptions {
  return {
    includeBasicLogs: selection.includeBasicLogs,
    includeCssDiagnostics: selection.includeCssDiagnostics,
    includeFiles: selection.includeFiles,
    includeFullPageScreenshot: selection.includeFullPageScreenshot,
    includeHarDomLogs: selection.includeHarDomLogs,
    includeImages: selection.includeImages,
    includeJson: selection.includeJson,
    includeMarkdown: selection.includeMarkdown,
  };
}
