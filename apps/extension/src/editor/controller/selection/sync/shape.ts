import { Rect, type FabricObject } from 'fabric';
import { type EditorObjectType } from '../../../../features/editor/document/types';
import {
  getEditorShapeSettings,
  resolveEditorShapeSettingsOwner,
} from '../../../../features/editor/document/shape-settings';
import { useEditorStore } from '../../../state/useEditorStore';
import { normalizeShadowPreset } from '../../../objects/shadow';
import { resolveShapeFillColor, resolveShapeStrokeColor } from '../shape-fill';

export function syncShapeSelectionSettings(
  object: FabricObject,
  type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
): void {
  const store = useEditorStore.getState();
  const owner = resolveEditorShapeSettingsOwner(type);
  const fallback = getEditorShapeSettings(store.selectionToolSettings, type);
  const strokeOpacity =
    typeof object.sniptaleShapeStrokeOpacity === 'number'
      ? object.sniptaleShapeStrokeOpacity
      : fallback.strokeOpacity;
  const fillOpacity =
    typeof object.sniptaleShapeFillOpacity === 'number'
      ? object.sniptaleShapeFillOpacity
      : fallback.fillOpacity;
  const strokeColor = resolveShapeStrokeColor(object.stroke, strokeOpacity, fallback.strokeColor);

  store.updateSelectionShapeSettings(owner, {
    strokeColor,
    fillColor: resolveShapeFillColor(object.fill, fillOpacity, fallback.fillColor),
    strokeWidth: typeof object.strokeWidth === 'number' ? object.strokeWidth : fallback.strokeWidth,
    opacity: strokeOpacity,
    strokeOpacity,
    fillOpacity,
    borderPresetId: object.sniptaleBorderPresetId ?? null,
    strokeStyle: object.sniptaleShapeStrokeStyle ?? fallback.strokeStyle,
    radius:
      object instanceof Rect
        ? (object.sniptaleShapeRadius ?? object.rx ?? fallback.radius)
        : fallback.radius,
    ...readShapeShadowSelectionSettings(object, fallback, strokeColor),
    customCss: '',
    inheritCustomCss: false,
  });
}

function readShapeShadowSelectionSettings(
  object: FabricObject,
  fallback: ReturnType<typeof getEditorShapeSettings>,
  strokeColor: string
) {
  return {
    shadow:
      object.sniptaleShapeShadow === undefined
        ? fallback.shadow
        : normalizeShadowPreset(object.sniptaleShapeShadow),
    shadowAngle:
      typeof object.sniptaleShapeShadowAngle === 'number'
        ? object.sniptaleShapeShadowAngle
        : (fallback.shadowAngle ?? 90),
    shadowBlur:
      typeof object.sniptaleShapeShadowBlur === 'number'
        ? object.sniptaleShapeShadowBlur
        : (fallback.shadowBlur ?? 12),
    shadowColor:
      typeof object.sniptaleShapeShadowColor === 'string'
        ? object.sniptaleShapeShadowColor
        : (fallback.shadowColor ?? strokeColor),
    shadowDistance:
      typeof object.sniptaleShapeShadowDistance === 'number'
        ? object.sniptaleShapeShadowDistance
        : (fallback.shadowDistance ?? 4),
  };
}
