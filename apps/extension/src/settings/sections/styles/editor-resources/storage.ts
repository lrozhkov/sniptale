import { useEffect, useState } from 'react';
import type { EditorPresetStorageState } from '../../../../features/editor/document/presets';
import {
  createDefaultEditorPresetStorageState,
  loadEditorPresetState,
  subscribeToEditorPresetState,
} from '../../../../composition/persistence/editor-presets';

export function useEditorPresetStorageState() {
  const [state, setState] = useState<EditorPresetStorageState>(() =>
    createDefaultEditorPresetStorageState()
  );
  useEffect(() => {
    let active = true;
    const apply = (next: EditorPresetStorageState) => {
      if (active) setState(next);
    };
    void loadEditorPresetState()
      .then(apply)
      .catch(() => undefined);
    const unsubscribe = subscribeToEditorPresetState(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}
