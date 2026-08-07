import { useState } from 'react';
import type { EditorPresetFamily } from '../../../../../features/editor/document/presets';
import { useEditorPresetStorageState } from '../storage';
import { createToolPresetActions } from './actions';

export function useToolPresetsController() {
  const state = useEditorPresetStorageState();
  const [owner, setOwner] = useState<EditorPresetFamily>('pencil');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const collection = state[owner];
  const clearDrag = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const actions = createToolPresetActions({
    currentPresets: collection.presets,
    draggedId,
    owner,
    clearDrag,
  });
  return {
    actions,
    collection: { defaultPresetId: collection.defaultPresetId, presets: collection.presets },
    drag: { clearDrag, draggedId, dragOverId, setDraggedId, setDragOverId },
    selection: { owner, setOwner },
  };
}
