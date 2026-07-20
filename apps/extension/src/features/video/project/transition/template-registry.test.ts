import { expect, it } from 'vitest';
import { VideoTransitionTemplateCatalogSurface } from './template-definition';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import { VideoTransitionTemplateKind } from '../types/index';
import {
  getVideoTransitionTemplateDefinition,
  getVideoTransitionTemplateGroups,
  getVideoTransitionTemplateSelectionOrder,
  resolveVideoTransitionTemplateKind,
} from './template-registry';

it('keeps the non-shader selection order in user-facing catalog order', () => {
  expect(getVideoTransitionTemplateSelectionOrder()).toEqual([
    VideoTransitionTemplateKind.CROSSFADE,
    VideoTransitionTemplateKind.FADE_THROUGH_LIGHT,
    VideoTransitionTemplateKind.DIP_TO_COLOR,
    VideoTransitionTemplateKind.PUSH,
    VideoTransitionTemplateKind.SLIDE,
    VideoTransitionTemplateKind.ZOOM_DISSOLVE,
    VideoTransitionTemplateKind.BLUR_REVEAL,
    VideoTransitionTemplateKind.LIGHT_SWEEP,
    VideoTransitionTemplateKind.CARD_FLIP_REVEAL,
  ]);
});

it('exposes description and family metadata for reveal transitions', () => {
  expect(getVideoTransitionTemplateDefinition(VideoTransitionTemplateKind.LIGHT_SWEEP)).toEqual(
    expect.objectContaining({
      catalogRank: 2,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      catalogSurface: VideoTransitionTemplateCatalogSurface.PRIMARY,
      defaultDurationSeconds: 0.9,
      descriptionKey: 'videoEditor.templates.transitionDescriptionLightSweep',
      groupLabelKey: 'videoEditor.templates.transitionGroupReveal',
      labelKey: 'videoEditor.sidebar.transitionLightSweep',
      preview: {
        motionLabelKey: 'videoEditor.templates.previewMotionSweep',
        tone: 'HERO',
        toneLabelKey: 'videoEditor.templates.previewToneHero',
        variant: 'TRANSITION',
      },
      templateKind: VideoTransitionTemplateKind.LIGHT_SWEEP,
      useCaseKey: 'videoEditor.templates.transitionUseCaseLightSweep',
    })
  );
});

it('keeps grouped transition catalog sections stable for inspector flows', () => {
  expect(getVideoTransitionTemplateGroups()).toEqual([
    {
      groupLabelKey: 'videoEditor.templates.transitionGroupCore',
      templateKinds: [
        VideoTransitionTemplateKind.CROSSFADE,
        VideoTransitionTemplateKind.FADE_THROUGH_LIGHT,
        VideoTransitionTemplateKind.DIP_TO_COLOR,
      ],
    },
    {
      groupLabelKey: 'videoEditor.templates.transitionGroupDirectional',
      templateKinds: [VideoTransitionTemplateKind.PUSH, VideoTransitionTemplateKind.SLIDE],
    },
    {
      groupLabelKey: 'videoEditor.templates.transitionGroupReveal',
      templateKinds: [
        VideoTransitionTemplateKind.ZOOM_DISSOLVE,
        VideoTransitionTemplateKind.BLUR_REVEAL,
        VideoTransitionTemplateKind.LIGHT_SWEEP,
        VideoTransitionTemplateKind.CARD_FLIP_REVEAL,
      ],
    },
  ]);
});

it('keeps valid template kinds unchanged during resolution', () => {
  expect(resolveVideoTransitionTemplateKind(VideoTransitionTemplateKind.PUSH)).toBe(
    VideoTransitionTemplateKind.PUSH
  );
});

it('falls back to the default template kind for invalid values', () => {
  expect(resolveVideoTransitionTemplateKind('unknown')).toBe(VideoTransitionTemplateKind.CROSSFADE);
});
