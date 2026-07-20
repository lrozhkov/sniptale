import {
  isEditorExportSettings,
  type EditorExportSettings,
} from '../../persistence/export-settings/guards';

export const EDITOR_EXPORT_SETTINGS_CHANGED_EVENT = 'sniptale:editor-export-settings-changed';

export function dispatchEditorExportSettingsChanged(settings: EditorExportSettings): void {
  window.dispatchEvent(
    new CustomEvent<EditorExportSettings>(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, {
      detail: settings,
    })
  );
}

export function readEditorExportSettingsChangedEvent(event: Event): EditorExportSettings | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail: unknown = event.detail;
  return isEditorExportSettings(detail) ? detail : null;
}
