import { useState } from 'react';
import { useEditorPresetStorageState } from '../storage';
import { createPaletteActions } from './actions';
import type { EditorPaletteKey } from './types';

export function usePalettesController() {
  const state = useEditorPresetStorageState();
  const [key, setKey] = useState<EditorPaletteKey>('shapeStroke');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const clearDrag = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  return {
    key,
    setKey,
    draggedIndex,
    dragOverIndex,
    setDraggedIndex,
    setDragOverIndex,
    clearDrag,
    colors: state.palette[key],
    ...createPaletteActions({ draggedIndex, key, palette: state.palette, clearDrag }),
  };
}
