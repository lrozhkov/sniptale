import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { EditorExportSettings } from '../../persistence/export-settings';

type EditorImageFormat = EditorExportSettings['imageFormat'];

export async function loadPersistedEditorSettings(
  current: EditorExportSettings | null,
  loadSettings: () => Promise<EditorExportSettings>
) {
  if (current) {
    return current;
  }

  return loadSettings();
}

export function syncLoadedSettings(
  settings: EditorExportSettings,
  setImageFormat: Dispatch<SetStateAction<EditorImageFormat>>,
  setImageQuality: Dispatch<SetStateAction<number>>,
  settingsRef: MutableRefObject<EditorExportSettings | null>
) {
  settingsRef.current = settings;
  setImageFormat(settings.imageFormat);
  setImageQuality(settings.imageQuality);
}
