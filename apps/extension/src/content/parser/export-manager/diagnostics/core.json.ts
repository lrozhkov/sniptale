import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ArchiveAsset } from '../archive';

export function buildCoreJsonAsset(path: string, value: unknown): ArchiveAsset {
  return {
    path,
    content: JSON.stringify(sanitizeStructuredDiagnosticExportData(value), null, 2),
  };
}
