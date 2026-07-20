import {
  buildVideoOverlayTemplateGroups,
  buildVideoOverlayTemplateSelectionOrder,
  type VideoOverlayTemplateGroup,
} from './catalog';
import type { VideoOverlayTemplateDefinition } from './definition';
import { VIDEO_OVERLAY_TEMPLATE_DEFINITION_LIST, VIDEO_OVERLAY_TEMPLATE_DEFINITIONS } from './data';
import type { VideoProjectAnnotationClip } from '../types/index';
const VIDEO_OVERLAY_TEMPLATE_SELECTION_ORDER = buildVideoOverlayTemplateSelectionOrder(
  VIDEO_OVERLAY_TEMPLATE_DEFINITION_LIST
);
const VIDEO_OVERLAY_TEMPLATE_GROUPS = buildVideoOverlayTemplateGroups(
  VIDEO_OVERLAY_TEMPLATE_DEFINITION_LIST
);

export function getVideoOverlayTemplateDefinition(
  templateKind: VideoProjectAnnotationClip['templateKind']
): VideoOverlayTemplateDefinition {
  return VIDEO_OVERLAY_TEMPLATE_DEFINITIONS[templateKind];
}

export function getVideoOverlayTemplateSelectionOrder(): readonly VideoProjectAnnotationClip['templateKind'][] {
  return VIDEO_OVERLAY_TEMPLATE_SELECTION_ORDER;
}

export function getVideoOverlayTemplateGroups(): readonly VideoOverlayTemplateGroup[] {
  return VIDEO_OVERLAY_TEMPLATE_GROUPS;
}
