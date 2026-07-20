import { VideoAnnotationElementKind, type VideoAnnotationTemplateRef } from './types';
import {
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
} from './legacy-constants';
export { SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID, SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID };
export {
  getLegacyAnnotationTemplateRef,
  getLegacyAnnotationTemplateRefs,
} from './legacy-template-refs';
import {
  VideoAnnotationTargetKind,
  VideoOverlayTemplateKind,
  type VideoOverlayTemplateKind as LegacyTemplateKind,
} from '../types/templates';

export const LEGACY_TEMPLATE_ELEMENT_KIND: Record<LegacyTemplateKind, VideoAnnotationElementKind> =
  {
    [VideoOverlayTemplateKind.CALLOUT_CARD]: VideoAnnotationElementKind.CALLOUT,
    [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: VideoAnnotationElementKind.CALLOUT,
    [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: VideoAnnotationElementKind.CALLOUT,
    [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: VideoAnnotationElementKind.FOCUS,
    [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: VideoAnnotationElementKind.FOCUS,
    [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: VideoAnnotationElementKind.LOWER_THIRD,
    [VideoOverlayTemplateKind.POINTER_LABEL]: VideoAnnotationElementKind.CALLOUT,
    [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: VideoAnnotationElementKind.SCENE,
    [VideoOverlayTemplateKind.SECTION_DIVIDER]: VideoAnnotationElementKind.TITLE,
    [VideoOverlayTemplateKind.SHIMMER_LABEL]: VideoAnnotationElementKind.SCENE,
    [VideoOverlayTemplateKind.SIDE_NOTE]: VideoAnnotationElementKind.CALLOUT,
    [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: VideoAnnotationElementKind.SCENE,
    [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: VideoAnnotationElementKind.SCENE,
    [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: VideoAnnotationElementKind.TITLE,
    [VideoOverlayTemplateKind.TITLE_REVEAL]: VideoAnnotationElementKind.TITLE,
  };

export const LEGACY_TEMPLATE_TARGET_KIND: Record<
  LegacyTemplateKind,
  | typeof VideoAnnotationTargetKind.NONE
  | typeof VideoAnnotationTargetKind.POINT
  | typeof VideoAnnotationTargetKind.RECT
> = {
  [VideoOverlayTemplateKind.CALLOUT_CARD]: VideoAnnotationTargetKind.RECT,
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: VideoAnnotationTargetKind.POINT,
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: VideoAnnotationTargetKind.RECT,
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: VideoAnnotationTargetKind.RECT,
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: VideoAnnotationTargetKind.RECT,
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.POINTER_LABEL]: VideoAnnotationTargetKind.POINT,
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.SIDE_NOTE]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: VideoAnnotationTargetKind.NONE,
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: VideoAnnotationTargetKind.POINT,
  [VideoOverlayTemplateKind.TITLE_REVEAL]: VideoAnnotationTargetKind.NONE,
};

export function isLegacyAnnotationTemplateRef(
  ref: VideoAnnotationTemplateRef | undefined
): boolean {
  if (!ref) {
    return false;
  }
  return (
    (ref.packId === SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID ||
      ref.packId === SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID) &&
    isLegacyAnnotationTemplateKind(ref.templateId)
  );
}

// Compatibility boundary for the recovery wave: legacy comparison templates keep their
// pre-declarative renderers while modern packs use scene rendering end to end.
export function shouldUseLegacyAnnotationRenderer(clip: {
  templateKind?: LegacyTemplateKind | undefined;
  templateRef?: VideoAnnotationTemplateRef | undefined;
  templateSnapshot?: { templateRef?: VideoAnnotationTemplateRef | undefined } | undefined;
}): boolean {
  if (clip.templateRef) {
    return isLegacyAnnotationTemplateRef(clip.templateRef);
  }
  if (clip.templateSnapshot?.templateRef) {
    return isLegacyAnnotationTemplateRef(clip.templateSnapshot.templateRef);
  }
  return isLegacyAnnotationTemplateKind(clip.templateKind);
}

export function getLegacyAnnotationTargetBindingKind(
  targetKind: (typeof VideoAnnotationTargetKind)[keyof typeof VideoAnnotationTargetKind]
) {
  if (targetKind === VideoAnnotationTargetKind.POINT) {
    return 'point';
  }
  if (targetKind === VideoAnnotationTargetKind.RECT) {
    return 'rect';
  }
  return 'none';
}

export function isLegacyAnnotationTemplateKind(value: unknown): value is LegacyTemplateKind {
  const templateKinds = Object.values(VideoOverlayTemplateKind) as readonly string[];
  return typeof value === 'string' && templateKinds.includes(value);
}
