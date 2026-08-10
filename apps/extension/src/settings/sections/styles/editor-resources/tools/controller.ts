import { useState } from 'react';
import type { EditorPresetFamily } from '../../../../../features/editor/document/presets';
import { useEditorPresetStorageState } from '../storage';
import { createToolPresetActions } from './actions';

export function useToolPresetsController() {
  const state = useEditorPresetStorageState();
  const [owner, setOwner] = useState<EditorPresetFamily>('step');
  const collection = state[owner];
  const actions = createToolPresetActions({
    currentPresets: collection.presets,
    owner,
  });
  return {
    actions,
    collection: { defaultPresetId: collection.defaultPresetId, presets: collection.presets },
    selection: { owner, setOwner },
  };
}
