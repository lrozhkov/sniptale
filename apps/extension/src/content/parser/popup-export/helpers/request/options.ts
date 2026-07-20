import type { ExportOptions } from '@sniptale/runtime-contracts/export';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPopupExportOptions(value: unknown): value is ExportOptions {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['includeJson'] === 'boolean' &&
    typeof value['includeMarkdown'] === 'boolean' &&
    typeof value['includeFiles'] === 'boolean' &&
    typeof value['includeImages'] === 'boolean' &&
    typeof value['includeBasicLogs'] === 'boolean' &&
    typeof value['includeHarDomLogs'] === 'boolean' &&
    typeof value['includeCssDiagnostics'] === 'boolean' &&
    typeof value['includeFullPageScreenshot'] === 'boolean'
  );
}
