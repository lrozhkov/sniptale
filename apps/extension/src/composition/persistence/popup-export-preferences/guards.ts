import { isBoolean, isRecord } from '../infrastructure/guards/primitives';
import type { PopupExportPreferences } from './contracts';

export function parseStoredPopupExportPreferences(value: unknown): {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  value: Partial<PopupExportPreferences>;
} {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidFieldCount: 0, value: {} };
  }
  if (!isRecord(value)) {
    return { hasInvalidRoot: true, invalidFieldCount: 0, value: {} };
  }

  const parsed: Partial<PopupExportPreferences> = {};
  let invalidFieldCount = 0;
  for (const key of POPUP_EXPORT_PREFERENCE_KEYS) {
    if (isBoolean(value[key])) parsed[key] = value[key];
    else if (value[key] !== undefined) invalidFieldCount += 1;
  }
  return { hasInvalidRoot: false, invalidFieldCount, value: parsed };
}

const POPUP_EXPORT_PREFERENCE_KEYS = [
  'includeBasicLogs',
  'includeCssDiagnostics',
  'includeFiles',
  'includeFullPageScreenshot',
  'includeHarDomLogs',
  'includeImages',
  'includeJson',
  'includeMarkdown',
] as const;
