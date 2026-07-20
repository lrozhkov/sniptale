import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { parseColorForStore } from '../../core/helpers';
import {
  readFreehandColorInput,
  readFreehandDynamicWidth,
  readFreehandOpacity,
  readFreehandShadowAngle,
  readFreehandShadowBlur,
  readFreehandShadowColor,
  readFreehandShadowDistance,
  readFreehandSmoothingLevel,
  readFreehandWidth,
} from '../../freehand';
import { normalizeShadowPreset } from '../../../objects/shadow';

export function syncBrushSelectionSettings(
  object: FabricObject,
  type: Extract<EditorObjectType, 'pencil' | 'highlighter'>
): void {
  const store = useEditorStore.getState();
  store.updateSelectionBrushSettings(type, {
    color: parseColorForStore(
      readFreehandColorInput(object),
      store.selectionToolSettings[type].color
    ),
    dynamicWidth: readFreehandDynamicWidth(object, store.selectionToolSettings[type].dynamicWidth),
    width: readFreehandWidth(object, store.selectionToolSettings[type].width),
    opacity: readFreehandOpacity(object, store.selectionToolSettings[type].opacity),
    smoothingLevel: readFreehandSmoothingLevel(
      object,
      store.selectionToolSettings[type].smoothingLevel
    ),
    shadow: normalizeShadowPreset(object.sniptaleBrushShadow),
    shadowAngle: readFreehandShadowAngle(object, store.selectionToolSettings[type].shadowAngle),
    shadowBlur: readFreehandShadowBlur(object, store.selectionToolSettings[type].shadowBlur),
    shadowColor: readFreehandShadowColor(
      object,
      store.selectionToolSettings[type].shadowColor ?? store.selectionToolSettings[type].color
    ),
    shadowDistance: readFreehandShadowDistance(
      object,
      store.selectionToolSettings[type].shadowDistance
    ),
  });
}
