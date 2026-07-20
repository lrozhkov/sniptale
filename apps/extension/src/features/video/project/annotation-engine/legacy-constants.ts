import {
  VideoOverlayTemplateKind,
  type VideoOverlayTemplateKind as LegacyTemplateKind,
} from '../types/templates';

export const SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID = 'sniptale.editorial';
export const SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID = 'sniptale.technical';

export const EDITORIAL_LEGACY_TEMPLATE_KINDS = new Set<LegacyTemplateKind>([
  VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
  VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
  VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
  VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
  VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
  VideoOverlayTemplateKind.SECTION_DIVIDER,
  VideoOverlayTemplateKind.SHIMMER_LABEL,
  VideoOverlayTemplateKind.SIDE_NOTE,
  VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
  VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
  VideoOverlayTemplateKind.TITLE_REVEAL,
]);
