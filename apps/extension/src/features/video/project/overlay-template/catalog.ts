import type { VideoOverlayTemplateKind } from '../types/index';
import type { VideoOverlayTemplateDefinition } from './definition';
import {
  buildTemplateGroups,
  buildTemplateSelectionOrder,
  type TemplateCatalogGroup,
} from '../template/catalog-order';

export type VideoOverlayTemplateGroup = TemplateCatalogGroup<
  VideoOverlayTemplateDefinition['groupLabelKey'],
  VideoOverlayTemplateKind
>;

const VIDEO_OVERLAY_TEMPLATE_GROUP_ORDER = [
  'videoEditor.templates.overlayGroupLowerThirds',
  'videoEditor.templates.overlayGroupTitles',
  'videoEditor.templates.overlayGroupCallouts',
  'videoEditor.templates.overlayGroupFocusSpotlight',
  'videoEditor.templates.overlayGroupSceneReveals',
] as const satisfies readonly VideoOverlayTemplateDefinition['groupLabelKey'][];

export function buildVideoOverlayTemplateSelectionOrder(
  definitions: readonly VideoOverlayTemplateDefinition[]
): readonly VideoOverlayTemplateKind[] {
  return buildTemplateSelectionOrder(definitions, VIDEO_OVERLAY_TEMPLATE_GROUP_ORDER);
}

export function buildVideoOverlayTemplateGroups(
  definitions: readonly VideoOverlayTemplateDefinition[]
): readonly VideoOverlayTemplateGroup[] {
  return buildTemplateGroups(definitions, VIDEO_OVERLAY_TEMPLATE_GROUP_ORDER);
}
