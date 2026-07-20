import { useEffect, useState } from 'react';

import {
  createDefaultEditorPresetStorageState,
  loadEditorPresetState,
  subscribeToEditorPresetState,
} from '../../../composition/persistence/editor-presets';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';

export function useEditorPresetStorageState(): EditorPresetStorageState {
  const [editorPresetState, setEditorPresetState] = useState<EditorPresetStorageState>(() =>
    createDefaultEditorPresetStorageState()
  );

  useEffect(() => {
    let cancelled = false;

    const applyState = (nextState: EditorPresetStorageState) => {
      if (!cancelled) {
        setEditorPresetState(nextState);
      }
    };

    void loadEditorPresetState()
      .then(applyState)
      .catch(() => undefined);
    const unsubscribe = subscribeToEditorPresetState(applyState);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return editorPresetState;
}
