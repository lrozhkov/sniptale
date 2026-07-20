import type { SavePreset, ViewportPreset } from '../../../contracts/settings';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

interface ParsedArrayField<TValue> {
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
  value: TValue[] | undefined;
}

function isViewportPreset(value: unknown): value is ViewportPreset {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isNumber(value['width']) &&
    isNumber(value['height']) &&
    isString(value['label'])
  );
}

function isSavePreset(value: unknown): value is SavePreset {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isString(value['path']) &&
    isBoolean(value['enabled']) &&
    isNumber(value['order'])
  );
}

export function parseViewportPresets(value: unknown): ParsedArrayField<ViewportPreset> {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidEntryCount: 0, value: undefined };
  }

  if (!Array.isArray(value)) {
    return { hasInvalidRoot: true, invalidEntryCount: 0, value: undefined };
  }

  const parsedPresets = value.filter(isViewportPreset);
  const invalidEntryCount = value.length - parsedPresets.length;

  if (value.length > 0 && parsedPresets.length === 0) {
    return { hasInvalidRoot: false, invalidEntryCount, value: undefined };
  }

  return { hasInvalidRoot: false, invalidEntryCount, value: parsedPresets };
}

export function parseSavePresets(value: unknown): ParsedArrayField<SavePreset> {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidEntryCount: 0, value: undefined };
  }

  if (!Array.isArray(value)) {
    return { hasInvalidRoot: true, invalidEntryCount: 0, value: undefined };
  }

  const parsedPresets = value.filter(isSavePreset);
  return {
    hasInvalidRoot: false,
    invalidEntryCount: value.length - parsedPresets.length,
    value: parsedPresets,
  };
}
