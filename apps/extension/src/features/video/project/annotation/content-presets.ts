import {
  VideoOverlayTemplateKind,
  type VideoProjectAnnotationClip,
  type VideoProjectAnnotationContent,
} from '../types/index';

type AnnotationTemplateKind = VideoProjectAnnotationClip['templateKind'];

export function createAnnotationTemplateContent(
  templateKind: AnnotationTemplateKind,
  content: VideoProjectAnnotationContent
) {
  switch (templateKind) {
    case VideoOverlayTemplateKind.LOWER_THIRD_BASIC:
    case VideoOverlayTemplateKind.LOWER_THIRD_ACCENT:
    case VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL:
    case VideoOverlayTemplateKind.LOWER_THIRD_STACKED:
    case VideoOverlayTemplateKind.LOWER_THIRD_BADGE:
    case VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER:
    case VideoOverlayTemplateKind.CALLOUT_CARD:
    case VideoOverlayTemplateKind.CALLOUT_CONNECTOR:
    case VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER:
    case VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD:
    case VideoOverlayTemplateKind.FOCUS_SCAN_FRAME:
    case VideoOverlayTemplateKind.SIDE_NOTE:
    case VideoOverlayTemplateKind.SIDE_REVEAL_PANEL:
    case VideoOverlayTemplateKind.SCENE_PROGRESS_CARD:
    case VideoOverlayTemplateKind.THREE_D_REVEAL_CARD:
      return content;
    case VideoOverlayTemplateKind.POINTER_LABEL:
      return { ...content, badge: null, subline: '' };
    case VideoOverlayTemplateKind.TITLE_REVEAL:
    case VideoOverlayTemplateKind.SECTION_DIVIDER:
    case VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL:
      return { ...content, badge: null };
    case VideoOverlayTemplateKind.SHIMMER_LABEL:
      return { ...content, subline: '' };
  }
}
