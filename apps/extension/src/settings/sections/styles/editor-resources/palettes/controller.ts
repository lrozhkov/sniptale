import { useState } from 'react';
import { useEditorPresetStorageState } from '../storage';
import { createPaletteActions } from './actions';
import type { EditorPaletteKey } from './types';

export function usePalettesController() {
  const state = useEditorPresetStorageState();
  const [key, setKey] = useState<EditorPaletteKey>('shapeStroke');
  return {
    key,
    setKey,
    colors: state.palette[key],
    ...createPaletteActions({ key, palette: state.palette }),
  };
}
