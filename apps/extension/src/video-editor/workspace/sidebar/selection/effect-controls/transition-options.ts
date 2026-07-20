import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  getVideoTemplateDirectionDefinitions,
  getVideoTemplateIntensityDefinitions,
  getVideoTransitionEasingDefinitions,
} from '../../../../../features/video/project/template/vocabulary';
import {
  getVideoTransitionTemplateDefinition,
  getVideoTransitionTemplateSelectionOrder,
} from '../../../../../features/video/project/transition/template';
import type { VideoProjectTransition } from '../../../../../features/video/project/types';
import type { VideoTransitionTemplateKind } from '../../../../../features/video/project/types';
import type {
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionEasing,
} from '../../../../../features/video/project/types';
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

export function getTransitionDirectionOptions(): GlassSelectOption<VideoTemplateDirection>[] {
  return buildVocabularySelectOptions(getVideoTemplateDirectionDefinitions());
}

export function getTransitionIntensityOptions(): GlassSelectOption<VideoTemplateIntensity>[] {
  return buildVocabularySelectOptions(getVideoTemplateIntensityDefinitions());
}

export function getTransitionLabel(transition: VideoProjectTransition): string {
  return translate(
    getVideoTransitionTemplateDefinition(transition.templateKind ?? transition.kind).labelKey
  );
}
