import type { TranslationKey } from '../../../../platform/i18n';
import {
  DEFAULT_VIDEO_TRANSITION_DIRECTION,
  DEFAULT_VIDEO_TRANSITION_HIGHLIGHT_COLOR,
  DEFAULT_VIDEO_TRANSITION_INTENSITY,
} from '../defaults';
import { VideoTransitionTemplateCatalogSurface } from './template-definition';
import type { VideoTransitionTemplateDefinition } from './template-definition';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import type {
  VideoTransitionKind,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../types/index';

export function createVideoTransitionTemplateDefinition(
  templateKind: VideoTransitionTemplateKind,
  kind: VideoTransitionKind,
  labelKey: TranslationKey,
  renderKind: VideoTransitionRenderKind,
  descriptionKey: VideoTransitionTemplateDefinition['descriptionKey'],
  groupLabelKey: VideoTransitionTemplateDefinition['groupLabelKey'],
  useCaseKey: VideoTransitionTemplateDefinition['useCaseKey'],
  preview: VideoTransitionTemplateDefinition['preview'],
  overrides: Partial<
    Pick<
      VideoTransitionTemplateDefinition,
      | 'catalogRank'
      | 'catalogStatus'
      | 'catalogSurface'
      | 'defaultDurationSeconds'
      | 'defaultHighlightColor'
      | 'supportsDirection'
      | 'supportsHighlightColor'
    >
  > = {}
): VideoTransitionTemplateDefinition {
  return {
    catalogRank: overrides.catalogRank ?? 0,
    catalogStatus: overrides.catalogStatus ?? VideoTemplateCatalogStatus.CORE,
    catalogSurface: overrides.catalogSurface ?? VideoTransitionTemplateCatalogSurface.PRIMARY,
    defaultDurationSeconds: overrides.defaultDurationSeconds ?? 0.8,
    descriptionKey,
    defaultDirection: DEFAULT_VIDEO_TRANSITION_DIRECTION,
    defaultHighlightColor:
      overrides.defaultHighlightColor ?? DEFAULT_VIDEO_TRANSITION_HIGHLIGHT_COLOR,
    defaultIntensity: DEFAULT_VIDEO_TRANSITION_INTENSITY,
    groupLabelKey,
    kind,
    labelKey,
    preview,
    renderKind,
    supportsDirection: overrides.supportsDirection ?? false,
    supportsHighlightColor: overrides.supportsHighlightColor ?? false,
    templateKind,
    useCaseKey,
  };
}
