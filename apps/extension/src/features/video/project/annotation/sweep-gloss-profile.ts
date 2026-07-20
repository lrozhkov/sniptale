import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';
import type { AnnotationSweepProfile } from './sweep-profile.types.ts';

const BASE_GLOSS_PROFILE = {
  edgeAlpha: 0,
  peakAlpha: 0.18,
  startYOffset: 0,
  tintRgb: '255,255,255',
  travelPercent: 130,
  widthPercent: 36,
} satisfies AnnotationSweepProfile;

const GLOSS_PROFILES: Record<VideoProjectAnnotationClip['templateKind'], AnnotationSweepProfile> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
    edgeAlpha: 0.01,
    peakAlpha: 0.16,
    startYOffset: -0.06,
    tintRgb: '255,255,255',
    travelPercent: 126,
    widthPercent: 32,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.2,
    startYOffset: -0.1,
    tintRgb: '210,232,255',
    travelPercent: 132,
    widthPercent: 34,
  },
  [VideoOverlayTemplateKind.CALLOUT_CARD]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.22,
    startYOffset: -0.06,
    tintRgb: '255,255,255',
    travelPercent: 126,
    widthPercent: 32,
  },
  [VideoOverlayTemplateKind.POINTER_LABEL]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    edgeAlpha: 0.03,
    peakAlpha: 0.26,
    startYOffset: -0.14,
    tintRgb: '255,244,214',
    travelPercent: 136,
    widthPercent: 42,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    edgeAlpha: 0.03,
    peakAlpha: 0.24,
    startYOffset: -0.18,
    tintRgb: '217,237,255',
    travelPercent: 138,
    widthPercent: 36,
  },
  [VideoOverlayTemplateKind.SIDE_NOTE]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.TITLE_REVEAL]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.2,
    startYOffset: -0.08,
    tintRgb: '255,249,236',
    travelPercent: 128,
    widthPercent: 34,
  },
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.2,
    startYOffset: -0.08,
    tintRgb: '255,249,236',
    travelPercent: 128,
    widthPercent: 34,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.24,
    startYOffset: -0.14,
    tintRgb: '236,248,255',
    travelPercent: 134,
    widthPercent: 28,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: BASE_GLOSS_PROFILE,
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.18,
    startYOffset: -0.06,
    tintRgb: '255,255,255',
    travelPercent: 124,
    widthPercent: 30,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    edgeAlpha: 0.02,
    peakAlpha: 0.2,
    startYOffset: -0.08,
    tintRgb: '255,245,225',
    travelPercent: 128,
    widthPercent: 30,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    edgeAlpha: 0.04,
    peakAlpha: 0.24,
    startYOffset: -0.18,
    tintRgb: '226,242,255',
    travelPercent: 142,
    widthPercent: 40,
  },
};

export function resolveAnnotationGlossProfile(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationSweepProfile {
  return GLOSS_PROFILES[templateKind];
}
