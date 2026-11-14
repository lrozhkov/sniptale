import type { GlassSelectOption } from '../../../../../ui/glass-select';
import { getVideoTransitionEasingDefinitions } from '../../../../../features/video/project/template/vocabulary';
import type { VideoTransitionEasing } from '../../../../../features/video/project/types';
import { buildVocabularySelectOptions } from '../inputs/options';

export function getTransitionEasingOptions(): GlassSelectOption<VideoTransitionEasing>[] {
  return buildVocabularySelectOptions(getVideoTransitionEasingDefinitions());
}
