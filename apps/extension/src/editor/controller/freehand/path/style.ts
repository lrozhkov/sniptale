import type { FabricObject } from 'fabric';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { createFabricShadow } from '../../../objects/shadow';
import { hexToRgba } from '../../../document/model';

export function applyFreehandObjectStyle(
  object: FabricObject,
  settings: EditorBrushSettings
): void {
  const dynamicWidth = object.sniptaleType === 'pencil' && settings.dynamicWidth === true;
  const shadowAngle = settings.shadowAngle ?? 90;
  const shadowBlur = settings.shadowBlur ?? 12;
  const shadowColor = settings.shadowColor ?? settings.color;
  const shadowDistance = settings.shadowDistance ?? 4;
  object.sniptaleBrushShadow = settings.shadow;
  object.sniptaleBrushShadowAngle = shadowAngle;
  object.sniptaleBrushShadowBlur = shadowBlur;
  object.sniptaleBrushShadowColor = shadowColor;
  object.sniptaleBrushShadowDistance = shadowDistance;
  object.sniptaleBrushSmoothing = settings.smoothingLevel;
  object.sniptaleBrushDynamicWidth = dynamicWidth;
  object.sniptaleBrushWidth = settings.width;
  object.set({
    fill: dynamicWidth ? hexToRgba(settings.color, settings.opacity) : '',
    objectCaching: false,
    opacity: 1,
    shadow: createFabricShadow(settings.shadow, shadowColor, {
      angle: shadowAngle,
      blur: shadowBlur,
      distance: shadowDistance,
    }),
    stroke: dynamicWidth ? 'transparent' : hexToRgba(settings.color, settings.opacity),
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    strokeUniform: true,
    strokeWidth: dynamicWidth ? 0 : settings.width,
  });
}
