import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { parseStoredEditorWorkspaceDefaults } from './guards';
import type { EditorWorkspaceDefaults } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_WORKSPACE_DEFAULTS } from '../../../features/editor/document/constants';

const EDITOR_WORKSPACE_DEFAULTS_KEY = 'sniptale_editor_workspace_defaults';
let editorWorkspaceDefaultsWriteQueue: Promise<EditorWorkspaceDefaults> = Promise.resolve(
  DEFAULT_EDITOR_WORKSPACE_DEFAULTS
);

export async function loadEditorWorkspaceDefaults(): Promise<EditorWorkspaceDefaults> {
  const result = await browserStorage.local.get([EDITOR_WORKSPACE_DEFAULTS_KEY]);

  return parseStoredEditorWorkspaceDefaults(result[EDITOR_WORKSPACE_DEFAULTS_KEY]);
}

export async function patchEditorWorkspaceDefaults(
  patch: Partial<EditorWorkspaceDefaults>
): Promise<EditorWorkspaceDefaults> {
  editorWorkspaceDefaultsWriteQueue = editorWorkspaceDefaultsWriteQueue
    .catch(() => DEFAULT_EDITOR_WORKSPACE_DEFAULTS)
    .then(async () => {
      const current = await loadEditorWorkspaceDefaults();
      const next = parseStoredEditorWorkspaceDefaults({ ...current, ...patch });

      await browserStorage.local.set({ [EDITOR_WORKSPACE_DEFAULTS_KEY]: next });
      return next;
    });

  return editorWorkspaceDefaultsWriteQueue;
}
