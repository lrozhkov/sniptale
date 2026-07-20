import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
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

export function resolveLayerEffectsActiveLayer(
  layers: EditorLayerItem[],
  selection: EditorSelectionState,
  layerId: string | null
): EditorLayerItem | null {
  if (layerId) {
    const directLayer = layers.find((layer) => layer.id === layerId);
    if (directLayer) {
      return directLayer;
    }
  }

  return selection.selectedObjectCount === 1 && selection.selectedObjectId
    ? (layers.find((layer) => layer.id === selection.selectedObjectId) ?? null)
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
