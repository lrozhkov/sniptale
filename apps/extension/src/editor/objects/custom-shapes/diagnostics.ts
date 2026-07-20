import type { CustomShapeImportDiagnostic } from './types';

export function createCustomShapeImportDiagnostic(
  code: CustomShapeImportDiagnostic['code'],
  message: string,
  detail?: string,
  severity: CustomShapeImportDiagnostic['severity'] = 'error'
): CustomShapeImportDiagnostic {
  return { code, message, severity, ...(detail ? { detail } : {}) };
}
