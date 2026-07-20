import { useState } from 'react';

import { createPaletteActions, createPresetActions } from './actions';
import { type EditorSettingsPaletteKey, type EditorSettingsPresetOwner } from './families';
import { getOwnerDefaultId, getOwnerPresets, usePresetStorageState } from './logic';

export function useEditorSection() {
  const [presetOwner, setPresetOwner] = useState<EditorSettingsPresetOwner>('pencil');
  const [paletteKey, setPaletteKey] = useState<EditorSettingsPaletteKey>('shapeStroke');
  const { borderPresetState, editorPresetState } = usePresetStorageState();
  const [draggedPresetId, setDraggedPresetId] = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);
  const [draggedColorIndex, setDraggedColorIndex] = useState<number | null>(null);
  const [dragOverColorIndex, setDragOverColorIndex] = useState<number | null>(null);
  const currentPresets = getOwnerPresets(presetOwner, editorPresetState, borderPresetState);
  const currentDefaultPresetId = getOwnerDefaultId(
    presetOwner,
    editorPresetState,
    borderPresetState
  );
  const paletteColors = editorPresetState.palette[paletteKey];
  const presetActions = createPresetActions({
    currentPresets,
    draggedPresetId,
    presetOwner,
    setDraggedPresetId,
    setDragOverPresetId,
  });
  const paletteActions = createPaletteActions({
    draggedColorIndex,
    editorPalette: editorPresetState.palette,
    paletteKey,
    setDraggedColorIndex,
    setDragOverColorIndex,
  });

  return {
    borderPresetState,
    currentDefaultPresetId,
    currentPresets,
    draggedColorIndex,
    draggedPresetId,
    dragOverColorIndex,
    dragOverPresetId,
    editorPresetState,
    paletteColors,
    paletteKey,
    presetOwner,
    setPaletteKey,
    setPresetOwner,
    ...presetActions,
    ...paletteActions,
  };
}
