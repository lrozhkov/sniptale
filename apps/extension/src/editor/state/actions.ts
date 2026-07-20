import {
  createResetDocumentState,
  createRuntimePatch,
  type EditorStoreActionDefaults,
  type EditorStoreSet,
} from './helpers';
import {
  createEditorStoreLayoutActions,
  createEditorStoreSetterActions,
  createEditorStoreToolActions,
  type EditorStoreLayoutActions,
  type EditorStoreSetters,
  type EditorStoreToolActions,
} from './factories';
import type { EditorState } from './types';

type EditorStoreActions = EditorStoreSetters &
  EditorStoreToolActions &
  EditorStoreLayoutActions &
  Pick<EditorState, 'syncRuntime' | 'resetDocumentState'>;

export function createEditorStoreActions(
  set: EditorStoreSet,
  defaults: EditorStoreActionDefaults
): EditorStoreActions {
  return {
    ...createEditorStoreSetterActions(set),
    ...createEditorStoreToolActions(set),
    ...createEditorStoreLayoutActions(set),
    syncRuntime: (patch) => set((state) => createRuntimePatch(state, patch)),
    resetDocumentState: () => set((state) => createResetDocumentState(state, defaults)),
  };
}
