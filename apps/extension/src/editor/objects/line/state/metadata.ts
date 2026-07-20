import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import { cloneLinePoint, serializeLinePoints } from '../geometry';
import type { LinePathInstance, LinePoint } from '../types';

export function syncLineMetadata(
  line: LinePathInstance,
  settings: EditorLineSettings,
  points: LinePoint[],
  closed: boolean
): void {
  line.sniptaleLineClosed = closed;
  line.sniptaleLinePoints = points.map(cloneLinePoint);
  line.sniptaleLineSettings = { ...settings };
  line.sniptaleLinePointsJson = serializeLinePoints(points);
  line.sniptaleLineClosed = closed;
  line.sniptaleLineColor = settings.color;
  line.sniptaleLineWidth = settings.width;
  line.sniptaleLineOpacity = settings.opacity;
  line.sniptaleLineShadow = settings.shadow;
  line.sniptaleLineShadowAngle = settings.shadowAngle ?? 90;
  line.sniptaleLineShadowBlur = settings.shadowBlur ?? 12;
  line.sniptaleLineShadowColor = settings.shadowColor ?? settings.color;
  line.sniptaleLineShadowDistance = settings.shadowDistance ?? 4;
  line.sniptaleLineStyle = settings.style;
  line.sniptaleLineCorners = settings.corners;
  line.sniptaleLineRoughness = settings.roughness;
  line.sniptaleLineBowing = settings.bowing ?? 0;
  line.sniptaleLineFillMode = settings.fillMode;
  line.sniptaleLineFillColor = settings.fillColor;
  line.sniptaleLineFillOpacity = settings.fillOpacity;
  line.sniptaleLineGradientFrom = settings.gradientFrom;
  line.sniptaleLineGradientTo = settings.gradientTo;
  if (settings.gradientStops) {
    line.sniptaleLineGradientStops = settings.gradientStops;
  } else {
    Reflect.deleteProperty(line, 'sniptaleLineGradientStops');
  }
  line.sniptaleLineGradientAngle = settings.gradientAngle;
  line.sniptaleLineRoughFillStyle = settings.roughFillStyle;
  line.sniptaleLineRoughFillColor = settings.roughFillColor;
  line.sniptaleLineRoughFillGap = settings.roughFillGap;
  line.sniptaleLineRoughFillAngle = settings.roughFillAngle;
  line.sniptaleLineRoughFillWeight = settings.roughFillWeight;
  line.sniptaleLineRoughFillRoughness = settings.roughFillRoughness;
  line.sniptaleLineRoughFillBowing = settings.roughFillBowing;
  line.sniptaleLineRoughFillOpacity = settings.roughFillOpacity;
}
