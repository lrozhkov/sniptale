import type { TranslationKey } from '../../../../platform/i18n';
import type { VideoTemplatePreviewMetadata } from '../template/preview';
import type { VideoTrackKind } from '../types/index';

export interface VideoBlockRecipeDefinition {
  catalogRank: number;
  descriptionKey: TranslationKey;
  labelKey: TranslationKey;
  preview: VideoTemplatePreviewMetadata;
  scenarioLabelKey: TranslationKey;
  trackKind: VideoTrackKind;
  useCaseKey: TranslationKey;
}
