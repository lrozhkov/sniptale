import type { VideoTransitionTemplateDefinition } from './template-definition';
import { VideoTransitionTemplateCatalogSurface } from './template-definition';
import {
  buildTemplateGroups,
  buildTemplateSelectionOrder,
  type TemplateCatalogGroup,
} from '../template/catalog-order';
import type { VideoTransitionTemplateKind } from '../types/index';

export type VideoTransitionTemplateGroup = TemplateCatalogGroup<
  VideoTransitionTemplateDefinition['groupLabelKey'],
  VideoTransitionTemplateKind
>;

const VIDEO_TRANSITION_TEMPLATE_GROUP_ORDER = [
  'videoEditor.templates.transitionGroupCore',
  'videoEditor.templates.transitionGroupDirectional',
  'videoEditor.templates.transitionGroupReveal',
  'videoEditor.templates.transitionGroupShader',
] as const satisfies readonly VideoTransitionTemplateDefinition['groupLabelKey'][];

function isPrimaryTransitionTemplate(definition: VideoTransitionTemplateDefinition) {
  return definition.catalogSurface === VideoTransitionTemplateCatalogSurface.PRIMARY;
}

export function buildVideoTransitionTemplateSelectionOrder(
  definitions: readonly VideoTransitionTemplateDefinition[]
): readonly VideoTransitionTemplateKind[] {
  return buildTemplateSelectionOrder(
    definitions,
    VIDEO_TRANSITION_TEMPLATE_GROUP_ORDER,
    isPrimaryTransitionTemplate
  );
}

export function buildVideoTransitionTemplateGroups(
  definitions: readonly VideoTransitionTemplateDefinition[]
): readonly VideoTransitionTemplateGroup[] {
  return buildTemplateGroups(
    definitions,
    VIDEO_TRANSITION_TEMPLATE_GROUP_ORDER,
    isPrimaryTransitionTemplate
  );
}
