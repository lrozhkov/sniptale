import type { EditorWorkspaceDefaults } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_WORKSPACE_DEFAULTS } from '../../../features/editor/document/constants';
import {
  isRecord,
  isString,
} from '../../../composition/persistence/infrastructure/guards/primitives';

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
    hideSelectionWhileDragging:
      typeof value['hideSelectionWhileDragging'] === 'boolean'
        ? value['hideSelectionWhileDragging']
        : DEFAULT_EDITOR_WORKSPACE_DEFAULTS.hideSelectionWhileDragging,
  };
}
