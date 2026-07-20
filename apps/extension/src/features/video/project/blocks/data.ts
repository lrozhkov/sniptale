import {
  createVideoTemplatePreviewMetadata,
  VideoTemplatePreviewMotion,
  VideoTemplatePreviewTone,
  VideoTemplatePreviewVariant,
} from '../template/preview';
import {
  VideoBlockKind,
  VideoTrackKind,
  type VideoBlockKind as VideoBlockKindType,
} from '../types/index';
import type { VideoBlockRecipeDefinition } from './definition';

const VIDEO_BLOCK_RECIPE_DEFINITIONS = {
  [VideoBlockKind.KINETIC_CAPTIONS]: {
    catalogRank: 0,
    descriptionKey: 'videoEditor.templates.blockDescriptionKineticCaptions',
    labelKey: 'videoEditor.templates.blockLabelKineticCaptions',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.SUBTITLE
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioExplain',
    trackKind: VideoTrackKind.SUBTITLE,
    useCaseKey: 'videoEditor.templates.blockUseCaseKineticCaptions',
  },
  [VideoBlockKind.STEP_EXPLAINER]: {
    catalogRank: 1,
    descriptionKey: 'videoEditor.templates.blockDescriptionStepExplainer',
    labelKey: 'videoEditor.templates.blockLabelStepExplainer',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioExplain',
    trackKind: VideoTrackKind.OVERLAY,
    useCaseKey: 'videoEditor.templates.blockUseCaseStepExplainer',
  },
  [VideoBlockKind.CHAPTER_OPENER]: {
    catalogRank: 2,
    descriptionKey: 'videoEditor.templates.blockDescriptionChapterOpener',
    labelKey: 'videoEditor.templates.blockLabelChapterOpener',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.TITLE
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioIntro',
    trackKind: VideoTrackKind.OVERLAY,
    useCaseKey: 'videoEditor.templates.blockUseCaseChapterOpener',
  },
  [VideoBlockKind.FEATURE_SPOTLIGHT]: {
    catalogRank: 3,
    descriptionKey: 'videoEditor.templates.blockDescriptionFeatureSpotlight',
    labelKey: 'videoEditor.templates.blockLabelFeatureSpotlight',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.SPOTLIGHT
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioSpotlight',
    trackKind: VideoTrackKind.OVERLAY,
    useCaseKey: 'videoEditor.templates.blockUseCaseFeatureSpotlight',
  },
  [VideoBlockKind.SPEAKER_INTRO]: {
    catalogRank: 4,
    descriptionKey: 'videoEditor.templates.blockDescriptionSpeakerIntro',
    labelKey: 'videoEditor.templates.blockLabelSpeakerIntro',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioIntro',
    trackKind: VideoTrackKind.OVERLAY,
    useCaseKey: 'videoEditor.templates.blockUseCaseSpeakerIntro',
  },
  [VideoBlockKind.CTA_WRAP_UP]: {
    catalogRank: 5,
    descriptionKey: 'videoEditor.templates.blockDescriptionCtaWrapUp',
    labelKey: 'videoEditor.templates.blockLabelCtaWrapUp',
    preview: createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.DEPTH,
      VideoTemplatePreviewVariant.CTA
    ),
    scenarioLabelKey: 'videoEditor.templates.blockScenarioClose',
    trackKind: VideoTrackKind.OVERLAY,
    useCaseKey: 'videoEditor.templates.blockUseCaseCtaWrapUp',
  },
} as const satisfies Record<VideoBlockKindType, VideoBlockRecipeDefinition>;

export function getVideoBlockRecipeDefinition(
  blockKind: VideoBlockKindType
): VideoBlockRecipeDefinition {
  return VIDEO_BLOCK_RECIPE_DEFINITIONS[blockKind];
}

export function getVideoBlockRecipeSelectionOrder(): readonly VideoBlockKindType[] {
  return Object.entries(VIDEO_BLOCK_RECIPE_DEFINITIONS)
    .sort(([, left], [, right]) => left.catalogRank - right.catalogRank)
    .map(([blockKind]) => blockKind as VideoBlockKindType);
}
