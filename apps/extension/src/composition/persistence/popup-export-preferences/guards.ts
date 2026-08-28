import { isBoolean, isRecord } from '../infrastructure/guards/primitives';
import type {
  PopupExportPreferences,
  PopupPagePackagePreferences,
  PopupPagePackageSelection,
} from './contracts';

function parseStoredPopupExportPreferences(value: unknown): {
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
  'includeAnnotations',
  'includeBasicLogs',
  'includeCssDiagnostics',
  'includeFiles',
  'includeFullPageScreenshot',
  'includePageDiagnostics',
  'includeImages',
  'includeJson',
  'includeMarkdown',
] as const;

function parsePagePackageSelection(value: unknown): PopupPagePackageSelection | null {
  if (!isRecord(value) || !isBoolean(value['includeWebCopy'])) {
    return null;
  }

  const parsed = parseStoredPopupExportPreferences(value);
  if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0) {
    return null;
  }
  if (POPUP_EXPORT_PREFERENCE_KEYS.some((key) => parsed.value[key] === undefined)) {
    return null;
  }

  return {
    ...(parsed.value as PopupExportPreferences),
    includeWebCopy: value['includeWebCopy'],
  };
}

export function parseStoredPopupPagePackagePreferences(
  value: unknown
): PopupPagePackagePreferences | null {
  if (!isRecord(value) || value['schemaVersion'] !== 1) {
    return null;
  }

  const exportSelection = parsePagePackageSelection(value['export']);
  const saveSelection = parsePagePackageSelection(value['save']);
  if (
    !exportSelection ||
    !saveSelection ||
    saveSelection.includeWebCopy !== true ||
    saveSelection.includeFullPageScreenshot !== true
  ) {
    return null;
  }

  return {
    export: exportSelection,
    save: saveSelection,
  };
}
