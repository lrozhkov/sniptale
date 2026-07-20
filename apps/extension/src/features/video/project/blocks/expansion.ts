import { translate } from '../../../../platform/i18n';
import { createClipGroupId } from '../factories/creation';
import { createAnnotationClip, createSubtitleClip } from '../factories/overlay-clip';
import { getVideoBlockRecipeDefinition } from './data';
import {
  VideoBlockKind,
  VideoClipLinkMode,
  VideoOverlayTemplateKind,
  type VideoBlockKind as VideoBlockKindType,
} from '../types/index';
import type { VideoProject, VideoProjectClip } from '../types/index';
import type { VideoBlockRecipeDefinition } from './definition';

function createSubtitleRecipeClip(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const clip = createSubtitleClip(trackId, project.width, project.height, startTime);

  return {
    ...clip,
    duration: 4.8,
    name: translate(definition.labelKey),
    text: translate('shared.videoProject.defaultBlockKineticCaptionsText'),
  };
}

function createStepExplainerClips(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const clip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );

  return [
    {
      ...clip,
      content: {
        badge: translate('shared.videoProject.defaultBlockStepExplainerBadge'),
        headline: translate('shared.videoProject.defaultBlockStepExplainerHeadline'),
        subline: translate('shared.videoProject.defaultBlockStepExplainerSubline'),
      },
      duration: 5.8,
      name: translate(definition.labelKey),
    },
  ] satisfies VideoProjectClip[];
}

function createChapterOpenerClips(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const titleClip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime,
    VideoOverlayTemplateKind.TITLE_REVEAL
  );
  const dividerClip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime + 2.6,
    VideoOverlayTemplateKind.SECTION_DIVIDER
  );

  return [
    {
      ...titleClip,
      content: {
        ...titleClip.content,
        headline: translate('shared.videoProject.defaultBlockChapterOpenerHeadline'),
        subline: translate('shared.videoProject.defaultBlockChapterOpenerSubline'),
      },
      duration: 2.8,
      name: translate(definition.labelKey),
    },
    {
      ...dividerClip,
      content: {
        ...dividerClip.content,
        headline: translate('shared.videoProject.defaultBlockChapterDividerHeadline'),
        subline: translate('shared.videoProject.defaultBlockChapterDividerSubline'),
      },
      duration: 1.8,
    },
  ] satisfies VideoProjectClip[];
}

function createFeatureSpotlightClips(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const clip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  );

  return [
    {
      ...clip,
      content: {
        badge: translate('shared.videoProject.defaultBlockFeatureSpotlightBadge'),
        headline: translate('shared.videoProject.defaultBlockFeatureSpotlightHeadline'),
        subline: translate('shared.videoProject.defaultBlockFeatureSpotlightSubline'),
      },
      duration: 6.4,
      name: translate(definition.labelKey),
    },
  ] satisfies VideoProjectClip[];
}

function createSpeakerIntroClips(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const clip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime,
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL
  );

  return [
    {
      ...clip,
      content: {
        badge: translate('shared.videoProject.defaultBlockSpeakerIntroBadge'),
        headline: translate('shared.videoProject.defaultBlockSpeakerIntroHeadline'),
        subline: translate('shared.videoProject.defaultBlockSpeakerIntroSubline'),
      },
      duration: 4.8,
      name: translate(definition.labelKey),
    },
  ] satisfies VideoProjectClip[];
}

function createWrapUpClips(
  definition: VideoBlockRecipeDefinition,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
) {
  const clip = createAnnotationClip(
    trackId,
    project.width,
    project.height,
    startTime,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  );

  return [
    {
      ...clip,
      content: {
        badge: translate('shared.videoProject.defaultBlockCtaWrapUpBadge'),
        headline: translate('shared.videoProject.defaultBlockCtaWrapUpHeadline'),
        subline: translate('shared.videoProject.defaultBlockCtaWrapUpSubline'),
      },
      duration: 4.6,
      name: translate(definition.labelKey),
    },
  ] satisfies VideoProjectClip[];
}

function applyBundleGroup(clips: VideoProjectClip[]): VideoProjectClip[] {
  if (clips.length < 2) {
    return clips;
  }

  const groupId = createClipGroupId();

  return clips.map((clip) => ({
    ...clip,
    groupId,
    linkMode: VideoClipLinkMode.LINKED,
  }));
}

export function expandVideoBlockRecipe(
  blockKind: VideoBlockKindType,
  trackId: string,
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
): VideoProjectClip[] {
  const definition = getVideoBlockRecipeDefinition(blockKind);

  switch (blockKind) {
    case VideoBlockKind.KINETIC_CAPTIONS:
      return applyBundleGroup([createSubtitleRecipeClip(definition, trackId, project, startTime)]);
    case VideoBlockKind.STEP_EXPLAINER:
      return applyBundleGroup(createStepExplainerClips(definition, trackId, project, startTime));
    case VideoBlockKind.CHAPTER_OPENER:
      return applyBundleGroup(createChapterOpenerClips(definition, trackId, project, startTime));
    case VideoBlockKind.FEATURE_SPOTLIGHT:
      return applyBundleGroup(createFeatureSpotlightClips(definition, trackId, project, startTime));
    case VideoBlockKind.SPEAKER_INTRO:
      return applyBundleGroup(createSpeakerIntroClips(definition, trackId, project, startTime));
    case VideoBlockKind.CTA_WRAP_UP:
      return applyBundleGroup(createWrapUpClips(definition, trackId, project, startTime));
  }
}
