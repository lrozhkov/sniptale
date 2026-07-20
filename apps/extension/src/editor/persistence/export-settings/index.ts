import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  DEFAULT_EDITOR_EXPORT_SETTINGS,
  parseStoredEditorExportSettings,
  type EditorExportSettings,
} from './guards';

const EDITOR_EXPORT_SETTINGS_KEY = 'sniptale_editor_export_settings';
let editorExportSettingsWriteQueue: Promise<EditorExportSettings> = Promise.resolve(
  DEFAULT_EDITOR_EXPORT_SETTINGS
);

export { DEFAULT_EDITOR_EXPORT_SETTINGS, type EditorExportSettings };

export async function loadEditorExportSettings(): Promise<EditorExportSettings> {
  const result = await browserStorage.local.get([EDITOR_EXPORT_SETTINGS_KEY]);

  return parseStoredEditorExportSettings(result[EDITOR_EXPORT_SETTINGS_KEY]);
}

export async function patchEditorExportSettings(
  patch: Partial<EditorExportSettings>
): Promise<EditorExportSettings> {
  editorExportSettingsWriteQueue = editorExportSettingsWriteQueue
    .catch(() => DEFAULT_EDITOR_EXPORT_SETTINGS)
    .then(async () => {
      const current = await loadEditorExportSettings();
      const next = parseStoredEditorExportSettings({ ...current, ...patch });

      await browserStorage.local.set({ [EDITOR_EXPORT_SETTINGS_KEY]: next });
      return next;
    });

  return editorExportSettingsWriteQueue;
}
