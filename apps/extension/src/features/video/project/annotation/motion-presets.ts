import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

interface AnnotationPartDelays {
  accent: number;
  badge: number;
  headline: number;
  subline: number;
}

interface AnnotationRevealProfile {
  accentWidthFrom: number;
  headlineRevealDelay: number;
  sublineRevealDelay: number;
}

export function resolveAnnotationPartDelays(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationPartDelays {
  switch (templateKind) {
    case VideoOverlayTemplateKind.LOWER_THIRD_BASIC:
      return { accent: 0.1, badge: 0.34, headline: 0.18, subline: 0.3 };
    case VideoOverlayTemplateKind.LOWER_THIRD_ACCENT:
      return { accent: 0.02, badge: 0.28, headline: 0.14, subline: 0.26 };
    case VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL:
      return { accent: 0.12, badge: 0.24, headline: 0.1, subline: 0.2 };
    case VideoOverlayTemplateKind.LOWER_THIRD_STACKED:
      return { accent: 0.18, badge: 0.28, headline: 0.1, subline: 0.2 };
    case VideoOverlayTemplateKind.LOWER_THIRD_BADGE:
      return { accent: 0.1, badge: 0.42, headline: 0.16, subline: 0.28 };
    case VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER:
      return { accent: 0.04, badge: 0.16, headline: 0.1, subline: 0.22 };
    case VideoOverlayTemplateKind.CALLOUT_CARD:
      return { accent: 1, badge: 1, headline: 0.18, subline: 0.3 };
    case VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD:
      return { accent: 0.08, badge: 0.26, headline: 0.18, subline: 0.32 };
    case VideoOverlayTemplateKind.FOCUS_SCAN_FRAME:
      return { accent: 0.04, badge: 0.18, headline: 0.14, subline: 0.28 };
    case VideoOverlayTemplateKind.CALLOUT_CONNECTOR:
      return { accent: 1, badge: 1, headline: 0.28, subline: 0.42 };
    case VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER:
      return { accent: 1, badge: 1, headline: 0.12, subline: 0.24 };
    case VideoOverlayTemplateKind.POINTER_LABEL:
      return { accent: 1, badge: 1, headline: 0.2, subline: 1 };
    case VideoOverlayTemplateKind.SIDE_NOTE:
      return { accent: 1, badge: 1, headline: 0.12, subline: 0.22 };
    case VideoOverlayTemplateKind.TITLE_REVEAL:
    case VideoOverlayTemplateKind.SECTION_DIVIDER:
      return { accent: 0.22, badge: 1, headline: 0.08, subline: 0.2 };
    case VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL:
      return { accent: 0.06, badge: 1, headline: 0.14, subline: 0.32 };
    case VideoOverlayTemplateKind.SHIMMER_LABEL:
      return { accent: 1, badge: 1, headline: 0.12, subline: 1 };
    case VideoOverlayTemplateKind.SIDE_REVEAL_PANEL:
      return { accent: 0.06, badge: 0.22, headline: 0.12, subline: 0.26 };
    case VideoOverlayTemplateKind.SCENE_PROGRESS_CARD:
      return { accent: 0.04, badge: 0.18, headline: 0.1, subline: 0.22 };
    case VideoOverlayTemplateKind.THREE_D_REVEAL_CARD:
      return { accent: 0.14, badge: 0.24, headline: 0.2, subline: 0.34 };
  }
}

export function resolveAnnotationRevealProfile(
  templateKind: VideoProjectAnnotationClip['templateKind']
): AnnotationRevealProfile {
  switch (templateKind) {
    case VideoOverlayTemplateKind.LOWER_THIRD_BASIC:
      return { accentWidthFrom: 0.42, headlineRevealDelay: 0.08, sublineRevealDelay: 0.16 };
    case VideoOverlayTemplateKind.LOWER_THIRD_ACCENT:
      return { accentWidthFrom: 0.18, headlineRevealDelay: 0.04, sublineRevealDelay: 0.12 };
    case VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL:
      return { accentWidthFrom: 0.3, headlineRevealDelay: 0.08, sublineRevealDelay: 0.16 };
    case VideoOverlayTemplateKind.LOWER_THIRD_STACKED:
      return { accentWidthFrom: 0.36, headlineRevealDelay: 0.12, sublineRevealDelay: 0.2 };
    case VideoOverlayTemplateKind.LOWER_THIRD_BADGE:
      return { accentWidthFrom: 0.28, headlineRevealDelay: 0.08, sublineRevealDelay: 0.18 };
    case VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER:
      return { accentWidthFrom: 0.12, headlineRevealDelay: 0.04, sublineRevealDelay: 0.14 };
    case VideoOverlayTemplateKind.CALLOUT_CARD:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.16, sublineRevealDelay: 0.26 };
    case VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD:
      return { accentWidthFrom: 0.3, headlineRevealDelay: 0.12, sublineRevealDelay: 0.24 };
    case VideoOverlayTemplateKind.FOCUS_SCAN_FRAME:
      return { accentWidthFrom: 0.2, headlineRevealDelay: 0.1, sublineRevealDelay: 0.22 };
    case VideoOverlayTemplateKind.CALLOUT_CONNECTOR:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.12, sublineRevealDelay: 0.2 };
    case VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.08, sublineRevealDelay: 0.18 };
    case VideoOverlayTemplateKind.POINTER_LABEL:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.1, sublineRevealDelay: 1 };
    case VideoOverlayTemplateKind.SIDE_NOTE:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.08, sublineRevealDelay: 0.18 };
    case VideoOverlayTemplateKind.TITLE_REVEAL:
    case VideoOverlayTemplateKind.SECTION_DIVIDER:
      return { accentWidthFrom: 0.22, headlineRevealDelay: 0.18, sublineRevealDelay: 0.3 };
    case VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL:
      return { accentWidthFrom: 0.12, headlineRevealDelay: 0.24, sublineRevealDelay: 0.42 };
    case VideoOverlayTemplateKind.SHIMMER_LABEL:
      return { accentWidthFrom: 1, headlineRevealDelay: 0.06, sublineRevealDelay: 1 };
    case VideoOverlayTemplateKind.SIDE_REVEAL_PANEL:
      return { accentWidthFrom: 0.08, headlineRevealDelay: 0.08, sublineRevealDelay: 0.18 };
    case VideoOverlayTemplateKind.SCENE_PROGRESS_CARD:
      return { accentWidthFrom: 0.16, headlineRevealDelay: 0.06, sublineRevealDelay: 0.16 };
    case VideoOverlayTemplateKind.THREE_D_REVEAL_CARD:
      return { accentWidthFrom: 0.24, headlineRevealDelay: 0.16, sublineRevealDelay: 0.28 };
  }
}
