import { DEFAULT_VIDEO_TRANSITION_TEMPLATE } from '../defaults';
import { VideoTransitionTemplateKind } from '../types/index';
import {
  buildVideoTransitionTemplateGroups,
  buildVideoTransitionTemplateSelectionOrder,
  type VideoTransitionTemplateGroup,
} from './template-catalog';
import {
  VIDEO_TRANSITION_TEMPLATE_DEFINITION_LIST,
  VIDEO_TRANSITION_TEMPLATE_DEFINITIONS,
} from './template-data';
import type { VideoTransitionTemplateDefinition } from './template-definition';

const VIDEO_TRANSITION_TEMPLATE_SELECTION_ORDER = buildVideoTransitionTemplateSelectionOrder(
  VIDEO_TRANSITION_TEMPLATE_DEFINITION_LIST
);
const VIDEO_TRANSITION_TEMPLATE_GROUPS = buildVideoTransitionTemplateGroups(
  VIDEO_TRANSITION_TEMPLATE_DEFINITION_LIST
);

export function getVideoTransitionTemplateDefinition(
  templateKind: VideoTransitionTemplateKind
): VideoTransitionTemplateDefinition {
  return VIDEO_TRANSITION_TEMPLATE_DEFINITIONS[templateKind];
}

export function getVideoTransitionTemplateSelectionOrder(): readonly VideoTransitionTemplateKind[] {
  return VIDEO_TRANSITION_TEMPLATE_SELECTION_ORDER;
}

export function getVideoTransitionTemplateGroups(): readonly VideoTransitionTemplateGroup[] {
  return VIDEO_TRANSITION_TEMPLATE_GROUPS;
}

export function getCompatibleVideoTransitionTemplateKinds(
  templateKind: VideoTransitionTemplateKind
): readonly VideoTransitionTemplateKind[] {
  const definition = getVideoTransitionTemplateDefinition(templateKind);

  return getVideoTransitionTemplateSelectionOrder().filter((candidateKind) => {
    const candidateDefinition = getVideoTransitionTemplateDefinition(candidateKind);

    return (
      candidateKind !== templateKind &&
      candidateDefinition.groupLabelKey === definition.groupLabelKey
    );
  });
}

export function resolveVideoTransitionTemplateKind(value: unknown): VideoTransitionTemplateKind {
  return Object.values(VideoTransitionTemplateKind).includes(value as VideoTransitionTemplateKind)
    ? (value as VideoTransitionTemplateKind)
    : DEFAULT_VIDEO_TRANSITION_TEMPLATE;
}
