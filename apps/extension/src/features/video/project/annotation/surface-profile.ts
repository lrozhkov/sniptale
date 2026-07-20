import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

type AnnotationSurfaceAxis = 'diagonal' | 'horizontal' | 'vertical';

interface AnnotationSurfaceProfile {
  accentGlowAlpha: number;
  borderAlpha: number;
  gradientAxis: AnnotationSurfaceAxis | null;
  gradientEnd: string | null;
  gradientStart: string | null;
  highlightAlpha: number;
}

const BASE_SURFACE_PROFILE = {
  accentGlowAlpha: 0,
  borderAlpha: 0.06,
  gradientAxis: null,
  gradientEnd: null,
  gradientStart: null,
  highlightAlpha: 0,
} satisfies AnnotationSurfaceProfile;

const ANNOTATION_SURFACE_PROFILES: Record<
  VideoProjectAnnotationClip['templateKind'],
  AnnotationSurfaceProfile
> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: BASE_SURFACE_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: {
    accentGlowAlpha: 0.12,
    borderAlpha: 0.1,
    gradientAxis: 'diagonal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.08)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
    accentGlowAlpha: 0,
    borderAlpha: 0.12,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.1)',
    highlightAlpha: 0.05,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: BASE_SURFACE_PROFILE,
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
    accentGlowAlpha: 0.16,
    borderAlpha: 0.08,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,245,225,0)',
    gradientStart: 'rgba(255,245,225,0.08)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    accentGlowAlpha: 0.12,
    borderAlpha: 0.11,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(210,232,255,0)',
    gradientStart: 'rgba(210,232,255,0.1)',
    highlightAlpha: 0.05,
  },
  [VideoOverlayTemplateKind.CALLOUT_CARD]: {
    accentGlowAlpha: 0.08,
    borderAlpha: 0.1,
    gradientAxis: 'diagonal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.06)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: {
    accentGlowAlpha: 0.1,
    borderAlpha: 0.1,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.08)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
    accentGlowAlpha: 0.12,
    borderAlpha: 0.14,
    gradientAxis: 'vertical',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.14)',
    highlightAlpha: 0.08,
  },
  [VideoOverlayTemplateKind.POINTER_LABEL]: {
    accentGlowAlpha: 0,
    borderAlpha: 0.08,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.04)',
    highlightAlpha: 0.02,
  },
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    accentGlowAlpha: 0.24,
    borderAlpha: 0.14,
    gradientAxis: 'diagonal',
    gradientEnd: 'rgba(255,243,210,0)',
    gradientStart: 'rgba(255,243,210,0.18)',
    highlightAlpha: 0.08,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    accentGlowAlpha: 0.18,
    borderAlpha: 0.14,
    gradientAxis: 'diagonal',
    gradientEnd: 'rgba(217,237,255,0)',
    gradientStart: 'rgba(217,237,255,0.14)',
    highlightAlpha: 0.06,
  },
  [VideoOverlayTemplateKind.SIDE_NOTE]: BASE_SURFACE_PROFILE,
  [VideoOverlayTemplateKind.TITLE_REVEAL]: {
    accentGlowAlpha: 0,
    borderAlpha: 0.12,
    gradientAxis: 'vertical',
    gradientEnd: 'rgba(255,249,236,0)',
    gradientStart: 'rgba(255,249,236,0.1)',
    highlightAlpha: 0.06,
  },
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: {
    accentGlowAlpha: 0,
    borderAlpha: 0.1,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,249,236,0)',
    gradientStart: 'rgba(255,249,236,0.08)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    accentGlowAlpha: 0.16,
    borderAlpha: 0.12,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(236,248,255,0)',
    gradientStart: 'rgba(236,248,255,0.12)',
    highlightAlpha: 0.06,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
    accentGlowAlpha: 0,
    borderAlpha: 0.1,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(236,248,255,0)',
    gradientStart: 'rgba(236,248,255,0.12)',
    highlightAlpha: 0.04,
  },
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: {
    accentGlowAlpha: 0.1,
    borderAlpha: 0.08,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,255,255,0)',
    gradientStart: 'rgba(255,255,255,0.12)',
    highlightAlpha: 0.05,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    accentGlowAlpha: 0.12,
    borderAlpha: 0.12,
    gradientAxis: 'horizontal',
    gradientEnd: 'rgba(255,245,225,0)',
    gradientStart: 'rgba(255,245,225,0.1)',
    highlightAlpha: 0.05,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    accentGlowAlpha: 0.18,
    borderAlpha: 0.16,
    gradientAxis: 'diagonal',
    gradientEnd: 'rgba(226,242,255,0)',
    gradientStart: 'rgba(226,242,255,0.16)',
    highlightAlpha: 0.08,
  },
};

export function resolveAnnotationSurfaceProfile(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationSurfaceProfile {
  return ANNOTATION_SURFACE_PROFILES[templateKind];
}
