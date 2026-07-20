import { useEffect, useState } from 'react';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import {
  DEFAULT_EDITOR_LAYER_EFFECTS_STATE,
  type EditorInspectorLayerEffectsState,
} from '../layer-effects/shared';

function createLayerEffectsStatePatch(
  layerId: string,
  category: EditorLayerEffectCategory,
  activeEffectId: EditorInspectorLayerEffectsState['activeEffectId'] = null
): EditorInspectorLayerEffectsState {
  return {
    layerId,
    category,
    query: '',
    activeEffectId,
  };
}

function resolveFallbackLayerId(
  layers: EditorLayerItem[],
  selection: EditorSelectionState,
  currentLayerId: string | null
): string | null {
  if (currentLayerId && layers.some((layer) => layer.id === currentLayerId)) {
    return currentLayerId;
  }

  if (
    selection.selectedObjectCount === 1 &&
    selection.selectedObjectId &&
    layers.some((layer) => layer.id === selection.selectedObjectId)
  ) {
    return selection.selectedObjectId;
  }

  return layers[0]?.id ?? null;
}

function isCurrentSingleLayerSelection(
  layers: EditorLayerItem[],
  selection: EditorSelectionState,
  layerId: string | null
) {
  return (
    layerId !== null &&
    selection.selectedObjectCount === 1 &&
    selection.selectedObjectId === layerId &&
    layers.some((layer) => layer.id === layerId)
  );
}

interface UseEditorInspectorLayerEffectsStateArgs {
  inspector: string;
  layers: EditorLayerItem[];
  setInspector: (inspector: 'tool') => void;
  syncActiveTool: (tool: 'select') => void;
  selection: EditorSelectionState;
}

export function useEditorInspectorLayerEffectsState(args: UseEditorInspectorLayerEffectsStateArgs) {
  const { inspector, layers, selection, setInspector, syncActiveTool } = args;
  const [state, setState] = useState(DEFAULT_EDITOR_LAYER_EFFECTS_STATE);

  useEffect(() => {
    if (inspector === 'layer-effects' && state.layerId) {
      return;
    }

    const nextLayerId = resolveFallbackLayerId(layers, selection, state.layerId);
    if (nextLayerId === state.layerId) {
      return;
    }

    setState((current) => ({
      ...current,
      activeEffectId: null,
      layerId: nextLayerId,
    }));
  }, [inspector, layers, selection, state.layerId]);

  useEffect(() => {
    if (inspector !== 'layer-effects') {
      return;
    }

    if (state.layerId === null) {
      return;
    }

    if (isCurrentSingleLayerSelection(layers, selection, state.layerId)) {
      return;
    }

    syncActiveTool('select');
    setInspector('tool');
  }, [inspector, layers, selection, setInspector, syncActiveTool, state.layerId]);

  return {
    layerEffectsState: state,
    openLayerEffects: (
      layerId: string,
      category: EditorLayerEffectCategory,
      activeEffectId: EditorInspectorLayerEffectsState['activeEffectId'] = null
    ) => {
      setState(createLayerEffectsStatePatch(layerId, category, activeEffectId));
    },
    setLayerEffectsState: setState,
  };
}
