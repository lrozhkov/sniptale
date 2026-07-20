import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { DEFAULT_VIDEO_TRANSITION_RENDER_KIND } from '../defaults';
import { createVideoTransitionTemplateDefinition } from './template-definition-builder';
import type { VideoTransitionTemplateDefinition } from './template-definition';
import {
  createVideoTemplatePreviewMetadata,
  VideoTemplatePreviewMotion,
  VideoTemplatePreviewTone,
  VideoTemplatePreviewVariant,
} from '../template/preview';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import {
  VideoTransitionKind,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../types/index';

type PrimaryTransitionTemplateKind = Exclude<
  VideoTransitionTemplateKind,
  | typeof VideoTransitionTemplateKind.LINEAR_WIPE
  | typeof VideoTransitionTemplateKind.RADIAL_REVEAL
  | typeof VideoTransitionTemplateKind.DISPLACEMENT_WARP
  | typeof VideoTransitionTemplateKind.GLARE_SWEEP
>;

const DEFAULT_EDITORIAL_LIGHT_COLOR = '#f6f1e8';

export const VIDEO_PRIMARY_TRANSITION_TEMPLATE_DEFINITIONS = {
  [VideoTransitionTemplateKind.CROSSFADE]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.CROSSFADE,
    VideoTransitionKind.CROSSFADE,
    'videoEditor.sidebar.transitionCrossfade',
    DEFAULT_VIDEO_TRANSITION_RENDER_KIND,
    'videoEditor.templates.transitionDescriptionCrossfade',
    'videoEditor.templates.transitionGroupCore',
    'videoEditor.templates.transitionUseCaseCrossfade',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.CALM,
      VideoTemplatePreviewMotion.FADE,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    { catalogRank: 0, defaultDurationSeconds: 0.45 }
  ),
  [VideoTransitionTemplateKind.FADE_THROUGH_LIGHT]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.FADE_THROUGH_LIGHT,
    VideoTransitionKind.FADE_THROUGH_LIGHT,
    'videoEditor.sidebar.transitionFadeThroughLight',
    VideoTransitionRenderKind.COMPOSITE,
    'videoEditor.templates.transitionDescriptionFadeThroughLight',
    'videoEditor.templates.transitionGroupCore',
    'videoEditor.templates.transitionUseCaseFadeThroughLight',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.FADE,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 1,
      defaultDurationSeconds: 0.58,
      defaultHighlightColor: DEFAULT_EDITORIAL_LIGHT_COLOR,
      supportsHighlightColor: true,
    }
  ),
  [VideoTransitionTemplateKind.DIP_TO_COLOR]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.DIP_TO_COLOR,
    VideoTransitionKind.DIP_TO_COLOR,
    'videoEditor.sidebar.transitionDipToColor',
    VideoTransitionRenderKind.COMPOSITE,
    'videoEditor.templates.transitionDescriptionDipToColor',
    'videoEditor.templates.transitionGroupCore',
    'videoEditor.templates.transitionUseCaseDipToColor',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.DIP,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 2,
      defaultDurationSeconds: 0.65,
      defaultHighlightColor: DEFAULT_COLOR_ACCENT,
      supportsHighlightColor: true,
    }
  ),
  [VideoTransitionTemplateKind.PUSH]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.PUSH,
    VideoTransitionKind.PUSH,
    'videoEditor.sidebar.transitionPush',
    VideoTransitionRenderKind.COMPOSITE,
    'videoEditor.templates.transitionDescriptionPush',
    'videoEditor.templates.transitionGroupDirectional',
    'videoEditor.templates.transitionUseCasePush',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.PUSH,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    { catalogRank: 0, defaultDurationSeconds: 0.7, supportsDirection: true }
  ),
  [VideoTransitionTemplateKind.SLIDE]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.SLIDE,
    VideoTransitionKind.SLIDE,
    'videoEditor.sidebar.transitionSlide',
    VideoTransitionRenderKind.CSS_LIKE,
    'videoEditor.templates.transitionDescriptionSlide',
    'videoEditor.templates.transitionGroupDirectional',
    'videoEditor.templates.transitionUseCaseSlide',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    { catalogRank: 1, defaultDurationSeconds: 0.72, supportsDirection: true }
  ),
  [VideoTransitionTemplateKind.ZOOM_DISSOLVE]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.ZOOM_DISSOLVE,
    VideoTransitionKind.ZOOM_DISSOLVE,
    'videoEditor.sidebar.transitionZoomDissolve',
    VideoTransitionRenderKind.COMPOSITE,
    'videoEditor.templates.transitionDescriptionZoomDissolve',
    'videoEditor.templates.transitionGroupReveal',
    'videoEditor.templates.transitionUseCaseZoomDissolve',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 0,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      defaultDurationSeconds: 0.85,
    }
  ),
  [VideoTransitionTemplateKind.BLUR_REVEAL]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.BLUR_REVEAL,
    VideoTransitionKind.BLUR_REVEAL,
    'videoEditor.sidebar.transitionBlurReveal',
    VideoTransitionRenderKind.COMPOSITE,
    'videoEditor.templates.transitionDescriptionBlurReveal',
    'videoEditor.templates.transitionGroupReveal',
    'videoEditor.templates.transitionUseCaseBlurReveal',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.CALM,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 1,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      defaultDurationSeconds: 0.75,
    }
  ),
  [VideoTransitionTemplateKind.LIGHT_SWEEP]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.LIGHT_SWEEP,
    VideoTransitionKind.LIGHT_SWEEP,
    'videoEditor.sidebar.transitionLightSweep',
    VideoTransitionRenderKind.CSS_LIKE,
    'videoEditor.templates.transitionDescriptionLightSweep',
    'videoEditor.templates.transitionGroupReveal',
    'videoEditor.templates.transitionUseCaseLightSweep',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.SWEEP,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 2,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      defaultDurationSeconds: 0.9,
      defaultHighlightColor: DEFAULT_COLOR_ACCENT,
      supportsDirection: true,
      supportsHighlightColor: true,
    }
  ),
  [VideoTransitionTemplateKind.CARD_FLIP_REVEAL]: createVideoTransitionTemplateDefinition(
    VideoTransitionTemplateKind.CARD_FLIP_REVEAL,
    VideoTransitionKind.CARD_FLIP_REVEAL,
    'videoEditor.sidebar.transitionCardFlipReveal',
    VideoTransitionRenderKind.CSS_LIKE,
    'videoEditor.templates.transitionDescriptionCardFlipReveal',
    'videoEditor.templates.transitionGroupReveal',
    'videoEditor.templates.transitionUseCaseCardFlipReveal',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.FLIP,
      VideoTemplatePreviewVariant.TRANSITION
    ),
    {
      catalogRank: 3,
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      defaultDurationSeconds: 0.82,
      supportsDirection: true,
    }
  ),
} as const satisfies Record<PrimaryTransitionTemplateKind, VideoTransitionTemplateDefinition>;
