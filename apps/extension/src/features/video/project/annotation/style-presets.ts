import { DEFAULT_VIDEO_ANNOTATION_STYLE } from '../defaults';
import { VideoOverlayTemplateKind, type VideoProjectAnnotationStyle } from '../types/index';

type AnnotationTemplateKind =
  (typeof VideoOverlayTemplateKind)[keyof typeof VideoOverlayTemplateKind];

type NumericStyleFloorKey = 'blurAmount' | 'depthAmount' | 'shimmerAmount';
type DirectNumericStyleKey = 'borderRadius' | 'padding';
type DirectStringStyleKey = 'backgroundColor';
type AnnotationStyleOverride = Partial<
  Pick<
    VideoProjectAnnotationStyle,
    NumericStyleFloorKey | DirectNumericStyleKey | DirectStringStyleKey
  >
>;

const NUMERIC_STYLE_FLOOR_KEYS = [
  'blurAmount',
  'depthAmount',
  'shimmerAmount',
] as const satisfies readonly NumericStyleFloorKey[];
const DIRECT_NUMERIC_STYLE_KEYS = [
  'borderRadius',
  'padding',
] as const satisfies readonly DirectNumericStyleKey[];
const DIRECT_STRING_STYLE_KEYS = [
  'backgroundColor',
] as const satisfies readonly DirectStringStyleKey[];

const ANNOTATION_STYLE_OVERRIDES: Record<AnnotationTemplateKind, AnnotationStyleOverride> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: {},
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: {
    backgroundColor: 'rgba(18, 20, 28, 0.94)',
    borderRadius: 24,
    padding: 20,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
    backgroundColor: 'rgba(12, 15, 20, 0.72)',
    blurAmount: 14,
    borderRadius: 26,
    depthAmount: 0.12,
    padding: 20,
    shimmerAmount: 0.18,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: {
    borderRadius: 28,
    depthAmount: 0.28,
    padding: 22,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
    padding: 18,
    shimmerAmount: 0.44,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    backgroundColor: 'rgba(11, 14, 18, 0.9)',
    blurAmount: 8,
    borderRadius: 22,
    depthAmount: 0.2,
    padding: 16,
    shimmerAmount: 0.34,
  },
  [VideoOverlayTemplateKind.CALLOUT_CARD]: {
    backgroundColor: 'rgba(14, 18, 24, 0.84)',
    blurAmount: 0,
    borderRadius: 22,
    depthAmount: 0.22,
    padding: 20,
  },
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: {
    backgroundColor: 'rgba(14, 18, 24, 0.88)',
    borderRadius: 20,
    depthAmount: 0.24,
    padding: 18,
  },
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
    backgroundColor: 'rgba(18, 20, 24, 0.82)',
    blurAmount: 12,
    borderRadius: 22,
    depthAmount: 0.3,
    padding: 18,
    shimmerAmount: 0.22,
  },
  [VideoOverlayTemplateKind.POINTER_LABEL]: {
    backgroundColor: 'rgba(12, 15, 20, 0.82)',
    blurAmount: 0,
    borderRadius: 18,
    depthAmount: 0.12,
    padding: 12,
  },
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    backgroundColor: 'rgba(10, 12, 16, 0.84)',
    blurAmount: 0,
    borderRadius: 24,
    depthAmount: 0.36,
    padding: 18,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    backgroundColor: 'rgba(8, 12, 18, 0.78)',
    blurAmount: 0,
    borderRadius: 18,
    depthAmount: 0.3,
    padding: 16,
    shimmerAmount: 0.42,
  },
  [VideoOverlayTemplateKind.SIDE_NOTE]: {
    backgroundColor: 'rgba(14, 16, 22, 0.8)',
    blurAmount: 6,
    borderRadius: 20,
    padding: 16,
  },
  [VideoOverlayTemplateKind.TITLE_REVEAL]: {
    backgroundColor: 'rgba(12, 15, 20, 0.78)',
    blurAmount: 5,
    borderRadius: 28,
    padding: 16,
  },
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: {
    backgroundColor: 'rgba(14, 16, 22, 0.74)',
    blurAmount: 4,
    borderRadius: 999,
    padding: 14,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    backgroundColor: 'rgba(6, 8, 12, 0.82)',
    blurAmount: 5,
    borderRadius: 24,
    depthAmount: 0.28,
    padding: 18,
    shimmerAmount: 0.3,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
    backgroundColor: 'rgba(14, 18, 26, 0.84)',
    blurAmount: 6,
    borderRadius: 999,
    padding: 14,
    shimmerAmount: 0.62,
  },
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: {
    backgroundColor: 'rgba(8, 10, 14, 0.9)',
    blurAmount: 0,
    borderRadius: 0,
    depthAmount: 0.34,
    padding: 34,
    shimmerAmount: 0.18,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    backgroundColor: 'rgba(12, 15, 20, 0.86)',
    blurAmount: 8,
    borderRadius: 24,
    depthAmount: 0.24,
    padding: 18,
    shimmerAmount: 0.36,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    backgroundColor: 'rgba(10, 12, 18, 0.9)',
    blurAmount: 10,
    borderRadius: 30,
    depthAmount: 0.44,
    padding: 24,
  },
};

export function createAnnotationTemplateStyle(templateKind: AnnotationTemplateKind) {
  return {
    ...DEFAULT_VIDEO_ANNOTATION_STYLE,
    ...ANNOTATION_STYLE_OVERRIDES[templateKind],
  };
}

export function applyAnnotationTemplateStyleFloors(
  style: VideoProjectAnnotationStyle,
  templateKind: AnnotationTemplateKind
) {
  const override = ANNOTATION_STYLE_OVERRIDES[templateKind];
  const nextStyle = { ...style };

  for (const key of NUMERIC_STYLE_FLOOR_KEYS) {
    const value = override[key];
    if (value !== undefined) {
      nextStyle[key] = Math.max(nextStyle[key], value);
    }
  }
  for (const key of DIRECT_NUMERIC_STYLE_KEYS) {
    const value = override[key];
    if (value !== undefined) {
      nextStyle[key] = value;
    }
  }
  for (const key of DIRECT_STRING_STYLE_KEYS) {
    const value = override[key];
    if (value !== undefined) {
      nextStyle[key] = value;
    }
  }

  return nextStyle;
}
