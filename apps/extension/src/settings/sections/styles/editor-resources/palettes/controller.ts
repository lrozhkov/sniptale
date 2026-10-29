import { useEffect, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../../platform/i18n';
import { useEditorPresetStorageState } from '../storage';
import { usePaletteNames } from '../../../../../composition/picker-preferences/use-palette-names';
import { createPaletteActions } from './actions';
import type { PaletteSettingsKey } from './types';
import {
  createDefaultDrawingPaletteState,
  changeDrawingPaletteColor,
  loadDrawingPaletteState,
  reorderDrawingPaletteColor,
  subscribeToDrawingPaletteState,
  renamePaletteColor,
} from '../../../../../composition/persistence/drawing-palette';

function useDrawingPaletteColors(): readonly string[] {
  const [colors, setColors] = useState<readonly string[]>(
    () => createDefaultDrawingPaletteState().colors
  );
  useEffect(() => {
    let active = true;
    let observedChange = false;
    void loadDrawingPaletteState()
      .then((state) => {
        if (active && !observedChange) setColors(state.colors);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeToDrawingPaletteState((state) => {
      observedChange = true;
      setColors(state.colors);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return colors;
}

export function usePalettesController() {
  const state = useEditorPresetStorageState();
  const names = usePaletteNames();
  const renameColor = async (color: string, name: string) => {
    try {
      if ((await renamePaletteColor(color, name)) === 'applied') return true;
    } catch {
      /* Keep the editable name for an explicit retry. */
    }
    showToast(translate('settings.editor.paletteSaveError'), 'error');
    return false;
  };
  const drawingColors = useDrawingPaletteColors();
  const [key, setKey] = useState<PaletteSettingsKey>('drawing');
  if (key === 'drawing') {
    const runDrawingMutation = async (mutation: Promise<'applied' | 'rejected'>) => {
      try {
        if ((await mutation) === 'rejected') {
          showToast(translate('settings.editor.paletteSaveError'), 'error');
        }
      } catch {
        showToast(translate('settings.editor.paletteSaveError'), 'error');
      }
    };
    return {
      key,
      names,
      renameColor,
      setKey,
      colors: drawingColors,
      changeColor: async (index: number, color: string) => {
        await runDrawingMutation(changeDrawingPaletteColor(index, color));
      },
      moveColor: async (itemIndex: number, beforeIndex: number | null) => {
        await runDrawingMutation(reorderDrawingPaletteColor(itemIndex, beforeIndex));
      },
    };
  }
  const actions = createPaletteActions({ key, palette: state.palette });
  return {
    key,
    names,
    renameColor,
    setKey,
    colors: state.palette[key],
    ...actions,
  };
}
