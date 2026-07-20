import { normalizeEditorArrowHeadSize } from '../../../../features/editor/document/arrow';
import { type EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import { serializeArrowPoints } from '../geometry/serialization';
import type { PointLike } from '../types';

export function syncArrowMetadata(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings,
  points: PointLike[]
): void {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return;
  }

  arrow.sniptaleArrowWidth = settings.width;
  arrow.sniptaleArrowStyle = settings.style ?? 'solid';
  arrow.sniptaleArrowVariant = settings.variant;
  arrow.sniptaleArrowMode = settings.arrowType === 'curved' ? 'curve' : settings.mode;
  arrow.sniptaleArrowType = settings.arrowType ?? 'sharp';
  arrow.sniptaleArrowDynamicWidth = settings.dynamicWidth ?? settings.variant === 'tapered';
  arrow.sniptaleArrowStartHead = settings.startHead;
  arrow.sniptaleArrowStartHeadSize = normalizeEditorArrowHeadSize(settings.startHeadSize);
  arrow.sniptaleArrowEndHead = settings.endHead;
  arrow.sniptaleArrowEndHeadSize = normalizeEditorArrowHeadSize(settings.endHeadSize);
  arrow.sniptaleArrowColor = settings.color;
  arrow.sniptaleArrowOpacity = settings.opacity;
  arrow.sniptaleArrowShadow = settings.shadow;
  arrow.sniptaleArrowShadowAngle = settings.shadowAngle ?? 90;
  arrow.sniptaleArrowShadowBlur = settings.shadowBlur ?? 12;
  arrow.sniptaleArrowShadowColor = settings.shadowColor ?? settings.color;
  arrow.sniptaleArrowShadowDistance = settings.shadowDistance ?? 4;
  arrow.sniptaleArrowRoughness = settings.roughness ?? 0;
  arrow.sniptaleArrowBowing = settings.bowing ?? 0;
  arrow.sniptaleArrowPointsJson = serializeArrowPoints(points);
  arrow.sniptaleArrowStartX = start.x;
  arrow.sniptaleArrowStartY = start.y;
  arrow.sniptaleArrowEndX = end.x;
  arrow.sniptaleArrowEndY = end.y;
  const control = points.length > 2 ? points[1] : undefined;
  if (control) {
    arrow.sniptaleArrowControlX = control.x;
    arrow.sniptaleArrowControlY = control.y;
    return;
  }

  delete arrow.sniptaleArrowControlX;
  delete arrow.sniptaleArrowControlY;
}
