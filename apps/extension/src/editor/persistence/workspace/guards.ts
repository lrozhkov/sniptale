import { DEFAULT_EDITOR_WORKSPACE_SETTINGS } from '../../../features/editor/document/constants';
import {
  isRecord,
  isString,
} from '../../../composition/persistence/infrastructure/guards/primitives';

export interface EditorWorkspaceDefaults {
  backgroundColor: string;
}

export const DEFAULT_EDITOR_WORKSPACE_DEFAULTS: EditorWorkspaceDefaults = {
  backgroundColor: DEFAULT_EDITOR_WORKSPACE_SETTINGS.backgroundColor,
};

function isEditorWorkspaceColor(value: unknown): value is string {
  return isString(value) && (value === 'transparent' || /^#[0-9a-f]{6}$/i.test(value));
}

export function parseStoredEditorWorkspaceDefaults(value: unknown): EditorWorkspaceDefaults {
  if (!isRecord(value)) {
    return DEFAULT_EDITOR_WORKSPACE_DEFAULTS;
  }

  return {
    backgroundColor: isEditorWorkspaceColor(value['backgroundColor'])
      ? value['backgroundColor'].toLowerCase()
      : DEFAULT_EDITOR_WORKSPACE_DEFAULTS.backgroundColor,
  };
}
