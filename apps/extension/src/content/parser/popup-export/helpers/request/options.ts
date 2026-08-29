import type { ExportOptions } from '@sniptale/runtime-contracts/export';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

export function isPopupExportOptions(value: unknown): value is ExportOptions {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isOptionalBoolean(value['includeAnnotations']) &&
    isOptionalBoolean(value['includeViewportScreenshot']) &&
    typeof value['includeJson'] === 'boolean' &&
    typeof value['includeMarkdown'] === 'boolean' &&
    typeof value['includeFiles'] === 'boolean' &&
    typeof value['includeImages'] === 'boolean' &&
    typeof value['includeBasicLogs'] === 'boolean' &&
    typeof value['includePageDiagnostics'] === 'boolean' &&
    typeof value['includeCssDiagnostics'] === 'boolean' &&
    typeof value['includeFullPageScreenshot'] === 'boolean'
  );
}
