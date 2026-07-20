import type { TranslationKey } from '../../../../platform/i18n';
import type { VideoOverlayTemplateDefinition } from './definition';
import type { VideoOverlayTemplateKind } from '../types/index';

export function createVideoOverlayTemplateDefinition(
  templateKind: VideoOverlayTemplateKind,
  annotationFamily: VideoOverlayTemplateDefinition['annotationFamily'],
  layoutFamily: VideoOverlayTemplateDefinition['layoutFamily'],
  motionFamily: VideoOverlayTemplateDefinition['motionFamily'],
  renderFamily: VideoOverlayTemplateDefinition['renderFamily'],
  catalogRank: VideoOverlayTemplateDefinition['catalogRank'],
  catalogStatus: VideoOverlayTemplateDefinition['catalogStatus'],
  labelKey: TranslationKey,
  descriptionKey: TranslationKey,
  groupLabelKey: VideoOverlayTemplateDefinition['groupLabelKey'],
  useCaseKey: TranslationKey,
  preview: VideoOverlayTemplateDefinition['preview'],
  overrides: Partial<Pick<VideoOverlayTemplateDefinition, 'defaultDurationSeconds'>> = {}
): VideoOverlayTemplateDefinition {
  return {
    annotationFamily,
    catalogRank,
    catalogStatus,
    defaultDurationSeconds: overrides.defaultDurationSeconds ?? 5,
    descriptionKey,
    groupLabelKey,
    labelKey,
    layoutFamily,
    motionFamily,
    preview,
    renderFamily,
    templateKind,
    useCaseKey,
  };
}
