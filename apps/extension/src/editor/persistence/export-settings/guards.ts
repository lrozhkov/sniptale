import type { Settings } from '../../../contracts/settings';
import {
  isNumber,
  isRecord,
  isString,
} from '../../../composition/persistence/infrastructure/guards/primitives';

type EditorImageFormat = Settings['imageFormat'];

export interface EditorExportSettings {
  imageFormat: EditorImageFormat;
  imageQuality: number;
}

export const DEFAULT_EDITOR_EXPORT_SETTINGS: EditorExportSettings = {
  imageFormat: 'png',
  imageQuality: 100,
};

function isEditorImageFormat(value: unknown): value is EditorImageFormat {
  return value === 'png' || value === 'jpeg' || value === 'webp';
}

function parseImageFormat(value: unknown): EditorImageFormat {
  return isString(value) && isEditorImageFormat(value)
    ? value
    : DEFAULT_EDITOR_EXPORT_SETTINGS.imageFormat;
}

function parseImageQuality(value: unknown): number {
  return isNumber(value) ? value : DEFAULT_EDITOR_EXPORT_SETTINGS.imageQuality;
}

export function parseStoredEditorExportSettings(value: unknown): EditorExportSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_EDITOR_EXPORT_SETTINGS };
  }

  return {
    imageFormat: parseImageFormat(value['imageFormat']),
    imageQuality: parseImageQuality(value['imageQuality']),
  };
}

export function isEditorExportSettings(value: unknown): value is EditorExportSettings {
  return (
    isRecord(value) &&
    isString(value['imageFormat']) &&
    isEditorImageFormat(value['imageFormat']) &&
    isNumber(value['imageQuality'])
  );
}
