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
  VideoProjectClipType,
  VideoTemplateDirection,
  VideoTemplateIntensity,
  type VideoProjectAnnotationClip,
  type VideoProjectClip,
} from '../types/index';
import { normalizeAnnotationTemplateMetadata } from '../annotation-engine/clip-metadata';
import {
  DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
  DEFAULT_VIDEO_ANNOTATION_DIRECTION,
  DEFAULT_VIDEO_ANNOTATION_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_INTENSITY,
  DEFAULT_VIDEO_ANNOTATION_INTRO,
  DEFAULT_VIDEO_ANNOTATION_INTRO_MS,
  DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
  DEFAULT_VIDEO_ANNOTATION_MOTION_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_OUTRO,
  DEFAULT_VIDEO_ANNOTATION_OUTRO_MS,
  DEFAULT_VIDEO_ANNOTATION_RENDER_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_STYLE,
  DEFAULT_VIDEO_ANNOTATION_TEMPLATE,
  DEFAULT_VIDEO_ANNOTATION_TARGET,
} from '../defaults';

function normalizeTargetPoint(clip: VideoProjectAnnotationClip) {
  return typeof clip.targetPoint?.x === 'number' && typeof clip.targetPoint?.y === 'number'
    ? {
        x: clip.targetPoint.x,
        y: clip.targetPoint.y,
      }
    : null;
}

function normalizeTargetRect(clip: VideoProjectAnnotationClip) {
  return typeof clip.targetRect?.x === 'number' &&
    typeof clip.targetRect?.y === 'number' &&
    typeof clip.targetRect?.width === 'number' &&
    typeof clip.targetRect?.height === 'number'
    ? {
        height: Math.max(0, clip.targetRect.height),
        width: Math.max(0, clip.targetRect.width),
        x: clip.targetRect.x,
        y: clip.targetRect.y,
      }
    : null;
}

function normalizeLeaderLine(clip: VideoProjectAnnotationClip) {
  return {
    ...DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
    ...(clip.leaderLine ?? {}),
    direction: Object.values(VideoTemplateDirection).includes(clip.leaderLine?.direction)
      ? clip.leaderLine.direction
      : DEFAULT_VIDEO_ANNOTATION_LEADER_LINE.direction,
    length:
      typeof clip.leaderLine?.length === 'number'
        ? Math.max(0, clip.leaderLine.length)
        : DEFAULT_VIDEO_ANNOTATION_LEADER_LINE.length,
    style: Object.values(VideoAnnotationLeaderLineStyle).includes(clip.leaderLine?.style)
      ? clip.leaderLine.style
      : DEFAULT_VIDEO_ANNOTATION_LEADER_LINE.style,
    thickness:
      typeof clip.leaderLine?.thickness === 'number'
        ? Math.max(1, clip.leaderLine.thickness)
        : DEFAULT_VIDEO_ANNOTATION_LEADER_LINE.thickness,
  };
}

function normalizeCalloutDecor(clip: VideoProjectAnnotationClip) {
  return {
    ...DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
    ...(clip.calloutDecor ?? {}),
    arrowKind: Object.values(VideoAnnotationArrowKind).includes(clip.calloutDecor?.arrowKind)
      ? clip.calloutDecor.arrowKind
      : DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR.arrowKind,
    frameKind: Object.values(VideoAnnotationFrameKind).includes(clip.calloutDecor?.frameKind)
      ? clip.calloutDecor.frameKind
      : DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR.frameKind,
    markerKind: Object.values(VideoAnnotationMarkerKind).includes(clip.calloutDecor?.markerKind)
      ? clip.calloutDecor.markerKind
      : DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR.markerKind,
    pulseKind: Object.values(VideoAnnotationPulseKind).includes(clip.calloutDecor?.pulseKind)
      ? clip.calloutDecor.pulseKind
      : DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR.pulseKind,
  };
}

function normalizeAnnotationContent(clip: VideoProjectAnnotationClip) {
  return {
    badge: typeof clip.content?.badge === 'string' ? clip.content.badge : null,
    headline: typeof clip.content?.headline === 'string' ? clip.content.headline : '',
    subline: typeof clip.content?.subline === 'string' ? clip.content.subline : '',
  };
}

function normalizeAnnotationAnimation(
  animation:
    | VideoProjectAnnotationClip['introAnimation']
    | VideoProjectAnnotationClip['outroAnimation'],
  fallback: typeof DEFAULT_VIDEO_ANNOTATION_INTRO | typeof DEFAULT_VIDEO_ANNOTATION_OUTRO
) {
  return Object.values(VideoOverlayAnimationKind).includes(animation) ? animation : fallback;
}

function normalizeAnnotationDuration(durationMs: number | undefined, fallback: number) {
  return typeof durationMs === 'number' ? Math.max(0, durationMs) : fallback;
}

function normalizeAnnotationMotionFields(clip: VideoProjectAnnotationClip) {
  return {
    direction: Object.values(VideoTemplateDirection).includes(clip.direction)
      ? clip.direction
      : DEFAULT_VIDEO_ANNOTATION_DIRECTION,
    intensity: Object.values(VideoTemplateIntensity).includes(clip.intensity)
      ? clip.intensity
      : DEFAULT_VIDEO_ANNOTATION_INTENSITY,
    introAnimation: normalizeAnnotationAnimation(
      clip.introAnimation,
      DEFAULT_VIDEO_ANNOTATION_INTRO
    ),
    introDurationMs: normalizeAnnotationDuration(
      clip.introDurationMs,
      DEFAULT_VIDEO_ANNOTATION_INTRO_MS
    ),
    motionFamily: Object.values(VideoAnnotationMotionFamily).includes(clip.motionFamily)
      ? clip.motionFamily
      : DEFAULT_VIDEO_ANNOTATION_MOTION_FAMILY,
    outroAnimation: normalizeAnnotationAnimation(
      clip.outroAnimation,
      DEFAULT_VIDEO_ANNOTATION_OUTRO
    ),
    outroDurationMs: normalizeAnnotationDuration(
      clip.outroDurationMs,
      DEFAULT_VIDEO_ANNOTATION_OUTRO_MS
    ),
  };
}

function normalizeAnnotationIdentityFields(clip: VideoProjectAnnotationClip) {
  const templateKind = Object.values(VideoOverlayTemplateKind).includes(clip.templateKind)
    ? clip.templateKind
    : DEFAULT_VIDEO_ANNOTATION_TEMPLATE;

  return {
    annotationFamily: Object.values(VideoAnnotationFamily).includes(clip.annotationFamily)
      ? clip.annotationFamily
      : DEFAULT_VIDEO_ANNOTATION_FAMILY,
    renderFamily: Object.values(VideoAnnotationRenderFamily).includes(clip.renderFamily)
      ? clip.renderFamily
      : DEFAULT_VIDEO_ANNOTATION_RENDER_FAMILY,
    target: Object.values(VideoAnnotationTargetKind).includes(clip.target)
      ? clip.target
      : DEFAULT_VIDEO_ANNOTATION_TARGET,
    templateKind,
    ...normalizeAnnotationTemplateMetadata(clip, templateKind),
  };
}

export function normalizeAnnotationClipFields(clip: VideoProjectClip) {
  if (clip.type !== VideoProjectClipType.ANNOTATION) {
    return {};
  }

  return {
    ...normalizeAnnotationIdentityFields(clip),
    calloutDecor: normalizeCalloutDecor(clip),
    content: normalizeAnnotationContent(clip),
    ...normalizeAnnotationMotionFields(clip),
    leaderLine: normalizeLeaderLine(clip),
    style: {
      ...DEFAULT_VIDEO_ANNOTATION_STYLE,
      ...(clip.style ?? {}),
    },
    targetPoint: normalizeTargetPoint(clip),
    targetRect: normalizeTargetRect(clip),
  };
}
