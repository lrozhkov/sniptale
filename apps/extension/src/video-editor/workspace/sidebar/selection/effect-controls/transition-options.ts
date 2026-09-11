import type { GlassSelectOption } from '../../../../../ui/glass-select';
import { getVideoTransitionEasingDefinitions } from '../../../../../features/video/project/template/vocabulary';
import {
  getVideoTransitionTemplateDefinition,
  getVideoTransitionTemplateSelectionOrder,
} from '../../../../../features/video/project/transition/template';
import type { VideoTransitionTemplateKind } from '../../../../../features/video/project/types';
import type { VideoTransitionEasing } from '../../../../../features/video/project/types';
import { buildTemplateCatalogOptions, buildVocabularySelectOptions } from '../inputs/options';

export function getTransitionTemplateOptions(): GlassSelectOption<VideoTransitionTemplateKind>[] {
  return buildTemplateCatalogOptions(
    getVideoTransitionTemplateSelectionOrder(),
    getVideoTransitionTemplateDefinition
  );
}

export function getTransitionEasingOptions(): GlassSelectOption<VideoTransitionEasing>[] {
  return buildVocabularySelectOptions(getVideoTransitionEasingDefinitions());
}
