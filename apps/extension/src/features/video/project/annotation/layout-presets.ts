import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

type AnnotationTemplateKind = VideoProjectAnnotationClip['templateKind'];

type AnnotationTransformPreset = {
  heightPercent: number;
  widthPercent: number;
  xPercent: number;
  yPercent: number;
};

const ANNOTATION_TRANSFORM_PRESETS: Record<AnnotationTemplateKind, AnnotationTransformPreset> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: {
    heightPercent: 0.16,
    widthPercent: 0.46,
    xPercent: 0.06,
    yPercent: 0.76,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: {
    heightPercent: 0.16,
    widthPercent: 0.46,
    xPercent: 0.06,
    yPercent: 0.76,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
    heightPercent: 0.16,
    widthPercent: 0.48,
    xPercent: 0.06,
    yPercent: 0.76,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: {
    heightPercent: 0.2,
    widthPercent: 0.44,
    xPercent: 0.06,
    yPercent: 0.72,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
    heightPercent: 0.16,
    widthPercent: 0.5,
    xPercent: 0.06,
    yPercent: 0.76,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    heightPercent: 0.1,
    widthPercent: 0.88,
    xPercent: 0.06,
    yPercent: 0.84,
  },
  [VideoOverlayTemplateKind.CALLOUT_CARD]: {
    heightPercent: 0.22,
    widthPercent: 0.34,
    xPercent: 0.14,
    yPercent: 0.12,
  },
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: {
    heightPercent: 0.22,
    widthPercent: 0.42,
    xPercent: 0.14,
    yPercent: 0.14,
  },
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
    heightPercent: 0.18,
    widthPercent: 0.36,
    xPercent: 0.56,
    yPercent: 0.12,
  },
  [VideoOverlayTemplateKind.POINTER_LABEL]: {
    heightPercent: 0.18,
    widthPercent: 0.28,
    xPercent: 0.62,
    yPercent: 0.18,
  },
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    heightPercent: 0.22,
    widthPercent: 0.32,
    xPercent: 0.56,
    yPercent: 0.54,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    heightPercent: 0.2,
    widthPercent: 0.3,
    xPercent: 0.58,
    yPercent: 0.48,
  },
  [VideoOverlayTemplateKind.SIDE_NOTE]: {
    heightPercent: 0.18,
    widthPercent: 0.26,
    xPercent: 0.08,
    yPercent: 0.18,
  },
  [VideoOverlayTemplateKind.TITLE_REVEAL]: {
    heightPercent: 0.18,
    widthPercent: 0.52,
    xPercent: 0.1,
    yPercent: 0.1,
  },
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: {
    heightPercent: 0.12,
    widthPercent: 0.42,
    xPercent: 0.1,
    yPercent: 0.42,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    heightPercent: 0.18,
    widthPercent: 0.62,
    xPercent: 0.08,
    yPercent: 0.14,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
    heightPercent: 0.12,
    widthPercent: 0.3,
    xPercent: 0.08,
    yPercent: 0.08,
  },
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: {
    heightPercent: 1,
    widthPercent: 0.34,
    xPercent: 0,
    yPercent: 0,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    heightPercent: 0.22,
    widthPercent: 0.4,
    xPercent: 0.08,
    yPercent: 0.12,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    heightPercent: 0.2,
    widthPercent: 0.28,
    xPercent: 0.58,
    yPercent: 0.16,
  },
};

export function getAnnotationTransformPreset(templateKind: AnnotationTemplateKind) {
  return ANNOTATION_TRANSFORM_PRESETS[templateKind];
}
