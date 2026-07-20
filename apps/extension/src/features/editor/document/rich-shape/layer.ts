import { DEFAULT_RICH_SHAPE_LAYER } from './defaults';
import type { EditorRichShapeLayerState } from './types';
import { isNumber, isRecord } from './values';

export function normalizeLayer(value: unknown): EditorRichShapeLayerState {
  const layer = isRecord(value) ? value : {};
  return {
    visible:
      typeof layer['visible'] === 'boolean' ? layer['visible'] : DEFAULT_RICH_SHAPE_LAYER.visible,
    locked:
      typeof layer['locked'] === 'boolean' ? layer['locked'] : DEFAULT_RICH_SHAPE_LAYER.locked,
    zIndex:
      layer['zIndex'] === null || isNumber(layer['zIndex'])
        ? layer['zIndex']
        : DEFAULT_RICH_SHAPE_LAYER.zIndex,
  };
}
