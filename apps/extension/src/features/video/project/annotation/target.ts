import {
  DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
  DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
  DEFAULT_VIDEO_ANNOTATION_TARGET,
} from '../defaults';
import {
  VideoAnnotationArrowKind,
  VideoAnnotationFrameKind,
  VideoAnnotationMarkerKind,
  VideoAnnotationPulseKind,
  VideoAnnotationTargetKind,
  VideoOverlayTemplateKind,
  type VideoProjectAnnotationCalloutDecor,
  type VideoProjectAnnotationClip,
  type VideoProjectAnnotationLeaderLine,
  type VideoProjectAnnotationTargetPoint,
  type VideoProjectAnnotationTargetRect,
  type VideoProjectTransform,
} from '../types/index';

interface AnnotationTargetDefaults {
  calloutDecor: VideoProjectAnnotationCalloutDecor;
  leaderLine: VideoProjectAnnotationLeaderLine;
  target: VideoProjectAnnotationClip['target'];
  targetPoint: VideoProjectAnnotationTargetPoint | null;
  targetRect: VideoProjectAnnotationTargetRect | null;
}

function createPointTarget(
  transform: VideoProjectTransform,
  xPercent: number,
  yPercent: number
): VideoProjectAnnotationTargetPoint {
  return {
    x: Math.round(transform.x + transform.width * xPercent),
    y: Math.round(transform.y + transform.height * yPercent),
  };
}

function createRectTarget(
  transform: VideoProjectTransform,
  xPercent: number,
  yPercent: number,
  widthPercent: number,
  heightPercent: number
): VideoProjectAnnotationTargetRect {
  return {
    x: Math.round(transform.x + transform.width * xPercent),
    y: Math.round(transform.y + transform.height * yPercent),
    width: Math.round(transform.width * widthPercent),
    height: Math.round(transform.height * heightPercent),
  };
}

function createPointerTargetDefaults(transform: VideoProjectTransform): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.CHEVRON,
      markerKind: VideoAnnotationMarkerKind.DOT,
      pulseKind: VideoAnnotationPulseKind.SOFT,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'LEFT',
      length: Math.round(transform.width * 0.34),
      thickness: 3,
    },
    target: VideoAnnotationTargetKind.POINT,
    targetPoint: createPointTarget(transform, 0.14, 0.72),
    targetRect: null,
  };
}

function createConnectorTargetDefaults(transform: VideoProjectTransform): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.CHEVRON,
      markerKind: VideoAnnotationMarkerKind.RING,
      frameKind: VideoAnnotationFrameKind.ROUNDED_RECT,
      pulseKind: VideoAnnotationPulseKind.SOFT,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'LEFT',
      length: Math.round(transform.width * 0.38),
      style: 'ELBOW',
      thickness: 3,
    },
    target: VideoAnnotationTargetKind.RECT,
    targetPoint: null,
    targetRect: createRectTarget(transform, 0.06, 0.58, 0.22, 0.18),
  };
}

function createCalloutCardTargetDefaults(
  transform: VideoProjectTransform
): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.CHEVRON,
      frameKind: VideoAnnotationFrameKind.BRACKET,
      markerKind: VideoAnnotationMarkerKind.NONE,
      pulseKind: VideoAnnotationPulseKind.NONE,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'RIGHT',
      length: Math.round(transform.width * 0.34),
      style: 'ELBOW',
      thickness: 3,
    },
    target: VideoAnnotationTargetKind.RECT,
    targetPoint: null,
    targetRect: createRectTarget(transform, 1.02, 0.32, 0.68, 0.54),
  };
}

function createNotificationBannerTargetDefaults(
  transform: VideoProjectTransform
): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.CHEVRON,
      frameKind: VideoAnnotationFrameKind.ROUNDED_RECT,
      markerKind: VideoAnnotationMarkerKind.DOT,
      pulseKind: VideoAnnotationPulseKind.SOFT,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'LEFT',
      length: Math.round(transform.width * 0.3),
      style: 'ELBOW',
      thickness: 3,
    },
    target: VideoAnnotationTargetKind.RECT,
    targetPoint: null,
    targetRect: createRectTarget(transform, -0.58, 0.54, 0.5, 0.3),
  };
}

function createSpotlightTargetDefaults(transform: VideoProjectTransform): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.NONE,
      frameKind: VideoAnnotationFrameKind.ROUNDED_RECT,
      markerKind: VideoAnnotationMarkerKind.NONE,
      pulseKind: VideoAnnotationPulseKind.RING,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'LEFT',
      length: Math.round(transform.width * 0.28),
      style: 'ELBOW',
      thickness: 3,
    },
    target: VideoAnnotationTargetKind.RECT,
    targetPoint: null,
    targetRect: createRectTarget(transform, -1.12, 0.08, 0.72, 0.56),
  };
}

function createScanFrameTargetDefaults(transform: VideoProjectTransform): AnnotationTargetDefaults {
  return {
    calloutDecor: {
      ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
      arrowKind: VideoAnnotationArrowKind.NONE,
      frameKind: VideoAnnotationFrameKind.BRACKET,
      markerKind: VideoAnnotationMarkerKind.NONE,
      pulseKind: VideoAnnotationPulseKind.RING,
    },
    leaderLine: {
      ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
      enabled: true,
      direction: 'LEFT',
      length: Math.round(transform.width * 0.24),
      style: 'ELBOW',
      thickness: 2,
    },
    target: VideoAnnotationTargetKind.RECT,
    targetPoint: null,
    targetRect: createRectTarget(transform, -0.92, 0.1, 0.68, 0.5),
  };
}

function createDefaultAnnotationTarget(): AnnotationTargetDefaults {
  return {
    calloutDecor: { ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR },
    leaderLine: { ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE },
    target: DEFAULT_VIDEO_ANNOTATION_TARGET,
    targetPoint: null,
    targetRect: null,
  };
}

export function createAnnotationTargetDefaults(
  templateKind: VideoProjectAnnotationClip['templateKind'],
  transform: VideoProjectTransform
): AnnotationTargetDefaults {
  if (templateKind === VideoOverlayTemplateKind.CALLOUT_CARD) {
    return createCalloutCardTargetDefaults(transform);
  }

  if (templateKind === VideoOverlayTemplateKind.POINTER_LABEL) {
    return createPointerTargetDefaults(transform);
  }

  if (templateKind === VideoOverlayTemplateKind.CALLOUT_CONNECTOR) {
    return createConnectorTargetDefaults(transform);
  }

  if (templateKind === VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER) {
    return createNotificationBannerTargetDefaults(transform);
  }

  if (templateKind === VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD) {
    return createSpotlightTargetDefaults(transform);
  }

  if (templateKind === VideoOverlayTemplateKind.FOCUS_SCAN_FRAME) {
    return createScanFrameTargetDefaults(transform);
  }

  return createDefaultAnnotationTarget();
}
