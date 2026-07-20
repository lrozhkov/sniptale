import type { FabricObject } from 'fabric';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../features/editor/document/constants';
import { type EditorImageSettings } from '../../features/editor/document/image-types';
import { attachImageStyleRenderer } from './image-frame';
import { createFabricShadow } from './shadow';

export function isImageLayerStyleObject(object: FabricObject): boolean {
  return (
    object.sniptaleType === 'image' ||
    object.sniptaleType === 'source-image' ||
    (object.sniptaleType === 'background' && object.sniptaleBackgroundMode === 'image') ||
    (object.sniptaleType === undefined &&
      (object.sniptaleImageOpacity !== undefined ||
        object.sniptaleImageRadius !== undefined ||
        object.sniptaleImageStrokeWidth !== undefined))
  );
}

export function readImageSettingsFromObject(
  object: FabricObject,
  fallback: EditorImageSettings = DEFAULT_EDITOR_IMAGE_SETTINGS
): EditorImageSettings {
  const strokeColor =
    typeof object.sniptaleImageStrokeColor === 'string'
      ? object.sniptaleImageStrokeColor
      : fallback.strokeColor;
  const shadowColor =
    typeof object.sniptaleImageShadowColor === 'string'
      ? object.sniptaleImageShadowColor
      : (fallback.shadowColor ?? strokeColor);

  return {
    borderPresetId: object.sniptaleBorderPresetId ?? fallback.borderPresetId,
    opacity:
      typeof object.sniptaleImageOpacity === 'number'
        ? object.sniptaleImageOpacity
        : fallback.opacity,
    radius:
      typeof object.sniptaleImageRadius === 'number' ? object.sniptaleImageRadius : fallback.radius,
    shadow:
      typeof object.sniptaleImageShadow === 'number' ? object.sniptaleImageShadow : fallback.shadow,
    shadowAngle:
      typeof object.sniptaleImageShadowAngle === 'number'
        ? object.sniptaleImageShadowAngle
        : (fallback.shadowAngle ?? 90),
    shadowBlur:
      typeof object.sniptaleImageShadowBlur === 'number'
        ? object.sniptaleImageShadowBlur
        : (fallback.shadowBlur ?? 12),
    shadowColor,
    shadowDistance:
      typeof object.sniptaleImageShadowDistance === 'number'
        ? object.sniptaleImageShadowDistance
        : (fallback.shadowDistance ?? 4),
    strokeColor,
    strokeOpacity:
      typeof object.sniptaleImageStrokeOpacity === 'number'
        ? object.sniptaleImageStrokeOpacity
        : fallback.strokeOpacity,
    strokeStyle: object.sniptaleImageStrokeStyle ?? fallback.strokeStyle,
    strokeWidth:
      typeof object.sniptaleImageStrokeWidth === 'number'
        ? object.sniptaleImageStrokeWidth
        : fallback.strokeWidth,
  };
}

export function applyImageSettings(object: FabricObject, settings: EditorImageSettings): void {
  const shadowColor =
    settings.shadowColor ?? DEFAULT_EDITOR_IMAGE_SETTINGS.shadowColor ?? settings.strokeColor;

  object.sniptaleBorderPresetId = settings.borderPresetId;
  object.sniptaleImageOpacity = settings.opacity;
  object.sniptaleImageRadius = settings.radius;
  object.sniptaleImageShadow = settings.shadow;
  object.sniptaleImageShadowAngle = settings.shadowAngle ?? 90;
  object.sniptaleImageShadowBlur = settings.shadowBlur ?? 12;
  object.sniptaleImageShadowColor = shadowColor;
  object.sniptaleImageShadowDistance = settings.shadowDistance ?? 4;
  object.sniptaleImageStrokeColor = settings.strokeColor;
  object.sniptaleImageStrokeOpacity = settings.strokeOpacity;
  object.sniptaleImageStrokeStyle = settings.strokeStyle;
  object.sniptaleImageStrokeWidth = settings.strokeWidth;

  object.set({
    clipPath: undefined,
    dirty: true,
    opacity: settings.opacity,
    shadow: createFabricShadow(settings.shadow, shadowColor, {
      angle: settings.shadowAngle ?? 90,
      blur: settings.shadowBlur ?? 12,
      distance: settings.shadowDistance ?? 4,
    }),
    objectCaching: false,
    stroke: null,
    strokeDashArray: undefined,
    strokeUniform: true,
    strokeWidth: 0,
  });
  attachImageStyleRenderer(object, readImageSettingsFromObject);
  object.setCoords();
}
