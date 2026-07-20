import type { VideoTransitionTemplateDefinition } from './template-definition';
import { VIDEO_PRIMARY_TRANSITION_TEMPLATE_DEFINITIONS } from './template-data.primary.ts';
import { VIDEO_SHADER_TRANSITION_TEMPLATE_DEFINITIONS } from './template-shader-data';

const VIDEO_TRANSITION_TEMPLATE_DEFINITIONS = {
  ...VIDEO_PRIMARY_TRANSITION_TEMPLATE_DEFINITIONS,
  ...VIDEO_SHADER_TRANSITION_TEMPLATE_DEFINITIONS,
} as const satisfies Record<
  VideoTransitionTemplateDefinition['templateKind'],
  VideoTransitionTemplateDefinition
>;

const VIDEO_TRANSITION_TEMPLATE_DEFINITION_LIST = Object.values(
  VIDEO_TRANSITION_TEMPLATE_DEFINITIONS
);

export { VIDEO_TRANSITION_TEMPLATE_DEFINITION_LIST, VIDEO_TRANSITION_TEMPLATE_DEFINITIONS };
