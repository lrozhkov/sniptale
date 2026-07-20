import type {
  EditorLayerEffectCategory,
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';

export interface EditorInspectorLayerEffectsState {
  layerId: string | null;
  category: EditorLayerEffectCategory;
  query: string;
  activeEffectId: EditorLayerEffectCommandId | null;
}

export const DEFAULT_EDITOR_LAYER_EFFECTS_STATE: EditorInspectorLayerEffectsState = {
  layerId: null,
  category: 'adjustments',
  query: '',
  activeEffectId: null,
};

export function isAppliedRasterEffect(
  layer: EditorLayerItem | null | undefined,
  effectId: EditorRasterEffectId
): boolean {
  return Boolean(layer?.effects.some((effect) => effect.id === effectId));
}

export function getAppliedRasterEffect(
  layer: EditorLayerItem | null | undefined,
  effectId: EditorRasterEffectId
): EditorRasterEffect | null {
  return layer?.effects.find((effect) => effect.id === effectId) ?? null;
}
