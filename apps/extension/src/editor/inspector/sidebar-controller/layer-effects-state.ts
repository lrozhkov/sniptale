import { useEffect, useState } from 'react';
import { findLayerEffectsTarget } from '../layer-effects/helpers';
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
  if (currentLayerId && findLayerEffectsTarget(layers, currentLayerId)) {
    return currentLayerId;
  }

  if (
    selection.selectedObjectCount === 1 &&
    selection.selectedObjectId &&
    findLayerEffectsTarget(layers, selection.selectedObjectId)
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
    findLayerEffectsTarget(layers, layerId) !== null
  );
}

interface UseEditorInspectorLayerEffectsStateArgs {
  inspector: string;
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
}

export function useEditorInspectorLayerEffectsState(args: UseEditorInspectorLayerEffectsStateArgs) {
  const { inspector, layers, selection } = args;
  const [state, setState] = useState(DEFAULT_EDITOR_LAYER_EFFECTS_STATE);

  useEffect(() => {
    if (inspector === 'layer-effects') {
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

    if (isCurrentSingleLayerSelection(layers, selection, state.layerId)) {
      return;
    }

    const selectedId = selection.selectedObjectCount === 1 ? selection.selectedObjectId : null;
    if (selectedId && findLayerEffectsTarget(layers, selectedId)) {
      setState((current) => ({ ...current, layerId: selectedId }));
    } else if (state.layerId && !findLayerEffectsTarget(layers, state.layerId)) {
      setState((current) => ({ ...current, layerId: null }));
    }
  }, [inspector, layers, selection, state.layerId]);

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
