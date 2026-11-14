import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type {
  EditorLayerItem,
  EditorLayerChild,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import type { EditorLayerEffectsTarget } from './shared';
import { translate } from '../../../platform/i18n';
import { getEditorLayerEffectDefinitionsByCategory } from '../../controller/layer-effects/registry';

type TranslateKey = Parameters<typeof translate>[0];

export function translateLayerEffects(key: TranslateKey): string {
  return translate(key);
}

export function translateLayerEffectName(key: `editor.layerEffects.${string}`): string {
  return translate(key as TranslateKey);
}

export function getLayerEffectCategoryLabel(category: EditorLayerEffectCategory): string {
  switch (category) {
    case 'adjustments':
      return translateLayerEffects('editor.toolbar.layerEffectsAdjustments');
    case 'transformations':
      return translateLayerEffects('editor.toolbar.layerEffectsTransformations');
    case 'filters':
      return translateLayerEffects('editor.toolbar.layerEffectsFilters');
  }
}

export function isLayerEffectSearchable(category: EditorLayerEffectCategory): boolean {
  return category !== 'transformations';
}

function findImageChildEffectsTarget(
  children: readonly EditorLayerChild[],
  id: string
): EditorLayerEffectsTarget | null {
  for (const child of children) {
    if (child.id === id && (child.type === 'image' || child.type === 'source-image'))
      return { id: child.id, name: child.name, effects: child.effects ?? [] };
    const nested = child.groupChildren && findImageChildEffectsTarget(child.groupChildren, id);
    if (nested) return nested;
  }
  return null;
}

/** Resolve existing root targets and supported image descendants without flattening the layer tree. */
export function findLayerEffectsTarget(
  layers: readonly EditorLayerItem[],
  id: string
): EditorLayerEffectsTarget | null {
  for (const layer of layers) {
    if (layer.id === id) return { id: layer.id, name: layer.name, effects: layer.effects };
    const child = layer.groupChildren && findImageChildEffectsTarget(layer.groupChildren, id);
    if (child) return child;
  }
  return null;
}

export function resolveLayerEffectsActiveLayer(
  layers: EditorLayerItem[],
  selection: EditorSelectionState,
  layerId: string | null
): EditorLayerEffectsTarget | null {
  if (layerId) {
    const directLayer = findLayerEffectsTarget(layers, layerId);
    if (directLayer) return directLayer;
  }
  return selection.selectedObjectCount === 1 && selection.selectedObjectId
    ? findLayerEffectsTarget(layers, selection.selectedObjectId)
    : null;
}

export function getLayerEffectDefinitions(category: EditorLayerEffectCategory, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return getEditorLayerEffectDefinitionsByCategory(category).filter((definition) => {
    if (!normalizedQuery) {
      return true;
    }

    return translateLayerEffectName(definition.titleKey).toLowerCase().includes(normalizedQuery);
  });
}
