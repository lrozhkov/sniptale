import type { VideoTransitionTemplateDefinition } from './template-definition';

interface VideoTransitionTemplateControls {
  showMotionGroup: boolean;
  showStyleGroup: boolean;
  showTemplateField: boolean;
  supportsDirection: boolean;
  supportsDuration: boolean;
  supportsEasing: boolean;
  supportsHighlightColor: boolean;
  supportsIntensity: boolean;
}

export function resolveTransitionTemplateControls(
  definition: Pick<
    VideoTransitionTemplateDefinition,
    'supportsDirection' | 'supportsHighlightColor'
  >
): VideoTransitionTemplateControls {
  return {
    showMotionGroup: true,
    showStyleGroup: definition.supportsHighlightColor,
    showTemplateField: true,
    supportsDirection: definition.supportsDirection,
    supportsDuration: true,
    supportsEasing: true,
    supportsHighlightColor: definition.supportsHighlightColor,
    supportsIntensity: true,
  };
}
