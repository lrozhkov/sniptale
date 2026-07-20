import {
  VideoAnnotationArrowKind,
  VideoAnnotationFamily,
  VideoAnnotationFrameKind,
  VideoAnnotationLeaderLineStyle,
  VideoAnnotationMarkerKind,
  VideoAnnotationMotionFamily,
  VideoAnnotationPulseKind,
  VideoAnnotationRenderFamily,
  VideoAnnotationTargetKind,
  VideoOverlayAnimationKind,
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
  VideoTemplateIntensity,
} from '../types/index';
import {
  isBoolean,
  isBoundedNumber,
  isBoundedString,
  isColorString,
  isEnumValue,
  isPoint,
  isPositiveStyleSize,
  isPrimitiveRecord,
  isRecord,
  isRect,
  isString,
  isStyleSize,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
} from './primitives';

function isAnnotationStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isColorString(value['accentColor']) &&
    isColorString(value['backgroundColor']) &&
    isColorString(value['headlineColor']) &&
    isColorString(value['sublineColor']) &&
    isColorString(value['badgeTextColor']) &&
    isStyleSize(value['borderRadius']) &&
    isStyleSize(value['padding']) &&
    isStyleSize(value['blurAmount']) &&
    isBoundedNumber(value['shimmerAmount'], 0, 1) &&
    isBoundedNumber(value['depthAmount'], 0, 1)
  );
}

function isAnnotationContent(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['badge'] === null || isBoundedString(value['badge'])) &&
    isBoundedString(value['headline']) &&
    isBoundedString(value['subline'])
  );
}

function isAnnotationLeaderLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['enabled']) &&
    isEnumValue(value['style'], VideoAnnotationLeaderLineStyle) &&
    isEnumValue(value['direction'], VideoTemplateDirection) &&
    isStyleSize(value['length']) &&
    isPositiveStyleSize(value['thickness'])
  );
}

function isAnnotationCalloutDecor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['arrowKind'], VideoAnnotationArrowKind) &&
    isEnumValue(value['markerKind'], VideoAnnotationMarkerKind) &&
    isEnumValue(value['frameKind'], VideoAnnotationFrameKind) &&
    isEnumValue(value['pulseKind'], VideoAnnotationPulseKind)
  );
}

function isTemplateRef(value: unknown): boolean {
  return isRecord(value) && isString(value['packId']) && isString(value['templateId']);
}

function isAnnotationTemplateSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    value['capturedAtSchemaVersion'] === 1 &&
    isTemplateRef(value['templateRef']) &&
    isPrimitiveRecord(value['controls'])
  );
}

export function hasAnnotationFields(value: Record<string, unknown>): boolean {
  return (
    isEnumValue(value['annotationFamily'], VideoAnnotationFamily) &&
    isAnnotationCalloutDecor(value['calloutDecor']) &&
    isAnnotationContent(value['content']) &&
    isEnumValue(value['direction'], VideoTemplateDirection) &&
    isEnumValue(value['intensity'], VideoTemplateIntensity) &&
    isEnumValue(value['introAnimation'], VideoOverlayAnimationKind) &&
    isBoundedNumber(value['introDurationMs'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS * 1000) &&
    isAnnotationLeaderLine(value['leaderLine']) &&
    isEnumValue(value['motionFamily'], VideoAnnotationMotionFamily) &&
    isEnumValue(value['outroAnimation'], VideoOverlayAnimationKind) &&
    isBoundedNumber(value['outroDurationMs'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS * 1000) &&
    isEnumValue(value['renderFamily'], VideoAnnotationRenderFamily) &&
    isAnnotationStyle(value['style']) &&
    isEnumValue(value['target'], VideoAnnotationTargetKind) &&
    (value['targetPoint'] === null || isPoint(value['targetPoint'])) &&
    (value['targetRect'] === null || isRect(value['targetRect'])) &&
    isEnumValue(value['templateKind'], VideoOverlayTemplateKind) &&
    (value['templateRef'] === undefined || isTemplateRef(value['templateRef'])) &&
    (value['templateControlValues'] === undefined ||
      isPrimitiveRecord(value['templateControlValues'])) &&
    (value['templateSnapshot'] === undefined ||
      isAnnotationTemplateSnapshot(value['templateSnapshot']))
  );
}
