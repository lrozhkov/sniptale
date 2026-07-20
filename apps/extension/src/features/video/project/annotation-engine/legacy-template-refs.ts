import type { VideoAnnotationTemplateRef } from './types';
import {
  EDITORIAL_LEGACY_TEMPLATE_KINDS,
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
} from './legacy-constants';
import {
  VideoOverlayTemplateKind,
  type VideoOverlayTemplateKind as LegacyTemplateKind,
} from '../types/templates';

export function getLegacyAnnotationTemplateRef(
  templateKind: LegacyTemplateKind
): VideoAnnotationTemplateRef {
  return {
    packId: EDITORIAL_LEGACY_TEMPLATE_KINDS.has(templateKind)
      ? SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID
      : SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
    templateId: templateKind,
  };
}

const LEGACY_ANNOTATION_TEMPLATE_REFS: Record<LegacyTemplateKind, VideoAnnotationTemplateRef> = {
  [VideoOverlayTemplateKind.CALLOUT_CARD]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.CALLOUT_CARD
  ),
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  ),
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER
  ),
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  ),
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.FOCUS_SCAN_FRAME
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER
  ),
  [VideoOverlayTemplateKind.POINTER_LABEL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.POINTER_LABEL
  ),
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.SCENE_PROGRESS_CARD
  ),
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.SECTION_DIVIDER
  ),
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.SHIMMER_LABEL
  ),
  [VideoOverlayTemplateKind.SIDE_NOTE]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.SIDE_NOTE
  ),
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
  ),
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  ),
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL
  ),
  [VideoOverlayTemplateKind.TITLE_REVEAL]: getLegacyAnnotationTemplateRef(
    VideoOverlayTemplateKind.TITLE_REVEAL
  ),
};

export function getLegacyAnnotationTemplateRefs(): Record<
  LegacyTemplateKind,
  VideoAnnotationTemplateRef
> {
  return LEGACY_ANNOTATION_TEMPLATE_REFS;
}
