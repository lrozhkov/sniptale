import { resolveAnnotationTemplateControls } from './template-controls';
import {
  getVideoOverlayTemplateDefinition,
  getVideoOverlayTemplateSelectionOrder,
} from '../overlay-template/registry';
import type { VideoOverlayTemplateKind } from '../types/index';

const VIDEO_ANNOTATION_TEMPLATE_SWAP_FAMILY = {
  LOWER_THIRD_BASIC: 'LOWER_THIRD',
  LOWER_THIRD_ACCENT: 'LOWER_THIRD',
  LOWER_THIRD_EDITORIAL: 'LOWER_THIRD',
  LOWER_THIRD_STACKED: 'LOWER_THIRD',
  LOWER_THIRD_BADGE: 'LOWER_THIRD',
  LOWER_THIRD_STATUS_TICKER: 'LOWER_THIRD',
  CALLOUT_CARD: 'CALLOUT',
  CALLOUT_CONNECTOR: 'CALLOUT',
  CALLOUT_NOTIFICATION_BANNER: 'CALLOUT',
  POINTER_LABEL: 'CALLOUT',
  FEATURE_SPOTLIGHT_CARD: 'CALLOUT',
  FOCUS_SCAN_FRAME: 'CALLOUT',
  SIDE_NOTE: 'CALLOUT',
  TITLE_REVEAL: 'REVEAL',
  SECTION_DIVIDER: 'REVEAL',
  TITLE_CURSOR_REVEAL: 'REVEAL',
  SHIMMER_LABEL: 'REVEAL',
  SIDE_REVEAL_PANEL: 'REVEAL',
  SCENE_PROGRESS_CARD: 'REVEAL',
  THREE_D_REVEAL_CARD: 'REVEAL',
} as const satisfies Record<VideoOverlayTemplateKind, 'CALLOUT' | 'LOWER_THIRD' | 'REVEAL'>;

export function resolveAnnotationTemplateTraits(templateKind: VideoOverlayTemplateKind) {
  const definition = getVideoOverlayTemplateDefinition(templateKind);

  return {
    annotationFamily: definition.annotationFamily,
    motionFamily: definition.motionFamily,
    renderFamily: definition.renderFamily,
  };
}

export function isTargetAwareAnnotationTemplate(templateKind: VideoOverlayTemplateKind) {
  return resolveAnnotationTemplateControls(templateKind).supportsTarget;
}

export function getCompatibleAnnotationTemplateKinds(
  templateKind: VideoOverlayTemplateKind
): readonly VideoOverlayTemplateKind[] {
  const swapFamily = VIDEO_ANNOTATION_TEMPLATE_SWAP_FAMILY[templateKind];

  return getVideoOverlayTemplateSelectionOrder().filter(
    (candidateKind) =>
      candidateKind !== templateKind &&
      VIDEO_ANNOTATION_TEMPLATE_SWAP_FAMILY[candidateKind] === swapFamily
  );
}
