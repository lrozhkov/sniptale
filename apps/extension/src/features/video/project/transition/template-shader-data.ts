import { DEFAULT_COLOR_ACCENT } from '@sniptale/ui/default-colors/constants';
import { createVideoTransitionTemplateDefinition } from './template-definition-builder';
import {
  createVideoTemplatePreviewMetadata,
  VideoTemplatePreviewMotion,
  VideoTemplatePreviewTone,
  VideoTemplatePreviewVariant,
} from '../template/preview';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import { VideoTransitionTemplateCatalogSurface } from './template-definition';
import {
  VideoTransitionKind,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../types/index';
import type { VideoTransitionTemplateDefinition } from './template-definition';

type ShaderTransitionTemplateKind =
  | typeof VideoTransitionTemplateKind.LINEAR_WIPE
  | typeof VideoTransitionTemplateKind.RADIAL_REVEAL
  | typeof VideoTransitionTemplateKind.DISPLACEMENT_WARP
  | typeof VideoTransitionTemplateKind.GLARE_SWEEP;

export const VIDEO_SHADER_TRANSITION_TEMPLATE_DEFINITIONS = {
  [VideoTransitionTemplateKind.LINEAR_WIPE]: createShaderDefinition(
    VideoTransitionTemplateKind.LINEAR_WIPE,
    VideoTransitionKind.LINEAR_WIPE,
    'videoEditor.sidebar.transitionLinearWipe',
    'videoEditor.templates.transitionDescriptionLinearWipe',
    'videoEditor.templates.transitionUseCaseLinearWipe',
    VideoTemplatePreviewTone.TECHNICAL,
    VideoTemplatePreviewMotion.WIPE
  ),
  [VideoTransitionTemplateKind.RADIAL_REVEAL]: createShaderDefinition(
    VideoTransitionTemplateKind.RADIAL_REVEAL,
    VideoTransitionKind.RADIAL_REVEAL,
    'videoEditor.sidebar.transitionRadialReveal',
    'videoEditor.templates.transitionDescriptionRadialReveal',
    'videoEditor.templates.transitionUseCaseRadialReveal',
    VideoTemplatePreviewTone.HERO,
    VideoTemplatePreviewMotion.FOCUS,
    { supportsDirection: false }
  ),
  [VideoTransitionTemplateKind.DISPLACEMENT_WARP]: createShaderDefinition(
    VideoTransitionTemplateKind.DISPLACEMENT_WARP,
    VideoTransitionKind.DISPLACEMENT_WARP,
    'videoEditor.sidebar.transitionDisplacementWarp',
    'videoEditor.templates.transitionDescriptionDisplacementWarp',
    'videoEditor.templates.transitionUseCaseDisplacementWarp',
    VideoTemplatePreviewTone.HERO,
    VideoTemplatePreviewMotion.DEPTH
  ),
  [VideoTransitionTemplateKind.GLARE_SWEEP]: createShaderDefinition(
    VideoTransitionTemplateKind.GLARE_SWEEP,
    VideoTransitionKind.GLARE_SWEEP,
    'videoEditor.sidebar.transitionGlareSweep',
    'videoEditor.templates.transitionDescriptionGlareSweep',
    'videoEditor.templates.transitionUseCaseGlareSweep',
    VideoTemplatePreviewTone.HERO,
    VideoTemplatePreviewMotion.SWEEP
  ),
} as const satisfies Record<ShaderTransitionTemplateKind, VideoTransitionTemplateDefinition>;

function createShaderDefinition(
  templateKind: ShaderTransitionTemplateKind,
  kind: VideoTransitionKind,
  labelKey: VideoTransitionTemplateDefinition['labelKey'],
  descriptionKey: VideoTransitionTemplateDefinition['descriptionKey'],
  useCaseKey: VideoTransitionTemplateDefinition['useCaseKey'],
  tone: VideoTemplatePreviewTone,
  motion: VideoTemplatePreviewMotion,
  overrides: Pick<VideoTransitionTemplateDefinition, 'supportsDirection'> = {
    supportsDirection: true,
  }
): VideoTransitionTemplateDefinition {
  return createVideoTransitionTemplateDefinition(
    templateKind,
    kind,
    labelKey,
    VideoTransitionRenderKind.SHADER,
    descriptionKey,
    'videoEditor.templates.transitionGroupShader',
    useCaseKey,
    createVideoTemplatePreviewMetadata(tone, motion, VideoTemplatePreviewVariant.TRANSITION),
    {
      catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
      catalogSurface: VideoTransitionTemplateCatalogSurface.SHADER,
      defaultDurationSeconds: 0.95,
      defaultHighlightColor: DEFAULT_COLOR_ACCENT,
      supportsDirection: overrides.supportsDirection,
      supportsHighlightColor: true,
    }
  );
}
