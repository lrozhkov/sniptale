import type { TranslationKey } from '../../../../platform/i18n';
import type { VideoTemplatePreviewMetadata } from '../template/preview';
import type { VideoTemplateCatalogStatus } from '../template/catalog-status';
import type {
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionKind,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from '../types/index';

export const VideoTransitionTemplateCatalogSurface = {
  PRIMARY: 'PRIMARY',
  SHADER: 'SHADER',
} as const;

export type VideoTransitionTemplateCatalogSurface =
  (typeof VideoTransitionTemplateCatalogSurface)[keyof typeof VideoTransitionTemplateCatalogSurface];

export interface VideoTransitionTemplateDefinition {
  catalogRank: number;
  catalogStatus: VideoTemplateCatalogStatus;
  catalogSurface: VideoTransitionTemplateCatalogSurface;
  defaultDurationSeconds: number;
  descriptionKey: TranslationKey;
  defaultDirection: VideoTemplateDirection;
  defaultHighlightColor: string;
  defaultIntensity: VideoTemplateIntensity;
  groupLabelKey: TranslationKey;
  kind: VideoTransitionKind;
  labelKey: TranslationKey;
  preview: VideoTemplatePreviewMetadata;
  renderKind: VideoTransitionRenderKind;
  supportsDirection: boolean;
  supportsHighlightColor: boolean;
  templateKind: VideoTransitionTemplateKind;
  useCaseKey: TranslationKey;
}
