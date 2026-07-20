import { Rect, type FabricObject } from 'fabric';
import type { EditorShapeSettings } from '../../features/editor/document/types';
import { hexToRgba } from '../document/model';
import { createFabricShadow } from './shadow';
import { createShapeStrokeDashArray } from './shape-style-dash';
import { applyRectangleShapeGeometry } from './shape-style-rectangle/apply';
import { captureRectangleVisualState } from './shape-style-rectangle/visual-state';

export function applyShapeSettings(
  object: FabricObject,
  type: 'rectangle' | 'ellipse' | 'diamond',
  settings: EditorShapeSettings
): void {
  const nextRadius = type === 'rectangle' ? Math.max(0, settings.radius) : 0;
  const shouldUseUniformStroke = type === 'ellipse';
  const rectangleVisualState = object instanceof Rect ? captureRectangleVisualState(object) : null;

  object.sniptaleBorderPresetId = settings.borderPresetId;
  object.sniptaleShapeStrokeStyle = settings.strokeStyle;
  object.sniptaleShapeRadius = nextRadius;
  object.sniptaleShapeShadow = settings.shadow;
  object.sniptaleShapeShadowAngle = settings.shadowAngle ?? 90;
  object.sniptaleShapeShadowBlur = settings.shadowBlur ?? 12;
  object.sniptaleShapeShadowColor = settings.shadowColor ?? settings.strokeColor;
  object.sniptaleShapeShadowDistance = settings.shadowDistance ?? 4;
  object.sniptaleShapeStrokeOpacity = settings.strokeOpacity;
  object.sniptaleShapeFillOpacity = settings.fillOpacity;
  object.sniptaleShapeCustomCss = '';
  object.sniptaleShapeInheritCustomCss = false;

  object.set({
    fill: hexToRgba(settings.fillColor, settings.fillOpacity ?? settings.opacity),
    opacity: 1,
    shadow: createFabricShadow(settings.shadow, settings.shadowColor || settings.strokeColor, {
      angle: settings.shadowAngle ?? 90,
      blur: settings.shadowBlur ?? 12,
      distance: settings.shadowDistance ?? 4,
    }),
    stroke: hexToRgba(settings.strokeColor, settings.strokeOpacity ?? settings.opacity),
    strokeDashArray: createShapeStrokeDashArray(settings.strokeStyle, settings.strokeWidth),
    strokeUniform: shouldUseUniformStroke || undefined,
    strokeWidth: settings.strokeWidth,
  });

  if (object instanceof Rect && rectangleVisualState) {
    applyRectangleShapeGeometry(object, settings, rectangleVisualState);
  }
}
