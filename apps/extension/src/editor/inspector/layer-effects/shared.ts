import type {
  EditorLayerEffectCategory,
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';

/** Metadata required by the effects panel for root layers and nested children. */
export type EditorLayerEffectsTarget = Pick<EditorLayerItem, 'id' | 'name' | 'effects'>;

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
  layer: EditorLayerEffectsTarget | null | undefined,
  effectId: EditorRasterEffectId
): boolean {
  return Boolean(layer?.effects.some((effect) => effect.id === effectId));
}

export function getAppliedRasterEffect(
  layer: EditorLayerEffectsTarget | null | undefined,
  effectId: EditorRasterEffectId
): EditorRasterEffect | null {
  return layer?.effects.find((effect) => effect.id === effectId) ?? null;
}
