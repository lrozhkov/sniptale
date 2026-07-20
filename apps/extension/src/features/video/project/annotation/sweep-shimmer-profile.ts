import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';
import type { AnnotationSweepProfile } from './sweep-profile.types.ts';

const BASE_SHIMMER_PROFILE = {
  edgeAlpha: 0,
  peakAlpha: 0.2,
  startYOffset: -0.08,
  tintRgb: '255,255,255',
  travelPercent: 120,
  widthPercent: 30,
} satisfies AnnotationSweepProfile;

const SHIMMER_PROFILES: Record<VideoProjectAnnotationClip['templateKind'], AnnotationSweepProfile> =
  {
    [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
      edgeAlpha: 0.01,
      peakAlpha: 0.16,
      startYOffset: -0.08,
      tintRgb: '255,255,255',
      travelPercent: 116,
      widthPercent: 24,
    },
    [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
      edgeAlpha: 0.01,
      peakAlpha: 0.24,
      startYOffset: -0.1,
      tintRgb: '255,245,225',
      travelPercent: 124,
      widthPercent: 32,
    },
    [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
      edgeAlpha: 0.02,
      peakAlpha: 0.24,
      startYOffset: -0.14,
      tintRgb: '210,232,255',
      travelPercent: 126,
      widthPercent: 26,
    },
    [VideoOverlayTemplateKind.CALLOUT_CARD]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
      edgeAlpha: 0.01,
      peakAlpha: 0.2,
      startYOffset: -0.08,
      tintRgb: '255,255,255',
      travelPercent: 120,
      widthPercent: 26,
    },
    [VideoOverlayTemplateKind.POINTER_LABEL]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
      edgeAlpha: 0.03,
      peakAlpha: 0.22,
      startYOffset: -0.16,
      tintRgb: '255,243,210',
      travelPercent: 132,
      widthPercent: 30,
    },
    [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
      edgeAlpha: 0.03,
      peakAlpha: 0.28,
      startYOffset: -0.2,
      tintRgb: '217,237,255',
      travelPercent: 134,
      widthPercent: 24,
    },
    [VideoOverlayTemplateKind.SIDE_NOTE]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.TITLE_REVEAL]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.SECTION_DIVIDER]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
      edgeAlpha: 0.02,
      peakAlpha: 0.28,
      startYOffset: -0.18,
      tintRgb: '236,248,255',
      travelPercent: 124,
      widthPercent: 20,
    },
    [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
      edgeAlpha: 0.02,
      peakAlpha: 0.3,
      startYOffset: -0.2,
      tintRgb: '236,248,255',
      travelPercent: 118,
      widthPercent: 22,
    },
    [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: BASE_SHIMMER_PROFILE,
    [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
      edgeAlpha: 0.02,
      peakAlpha: 0.24,
      startYOffset: -0.12,
      tintRgb: '255,245,225',
      travelPercent: 126,
      widthPercent: 24,
    },
    [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: BASE_SHIMMER_PROFILE,
  };

export function resolveAnnotationShimmerProfile(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationSweepProfile {
  return SHIMMER_PROFILES[templateKind];
}
