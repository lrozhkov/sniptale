import type { TranslationKey } from '../../../../platform/i18n';
import type { VideoAnnotationLayoutFamily } from '../annotation/layout-family';
import type { VideoTemplatePreviewMetadata } from '../template/preview';
import type { VideoTemplateCatalogStatus } from '../template/catalog-status';
import type {
  VideoAnnotationFamily,
  VideoAnnotationMotionFamily,
  VideoAnnotationRenderFamily,
  VideoOverlayTemplateKind,
} from '../types/index';

export interface VideoOverlayTemplateDefinition {
  annotationFamily: VideoAnnotationFamily;
  catalogRank: number;
  catalogStatus: VideoTemplateCatalogStatus;
  defaultDurationSeconds: number;
  descriptionKey: TranslationKey;
  groupLabelKey: TranslationKey;
  labelKey: TranslationKey;
  layoutFamily: VideoAnnotationLayoutFamily;
  motionFamily: VideoAnnotationMotionFamily;
  preview: VideoTemplatePreviewMetadata;
  renderFamily: VideoAnnotationRenderFamily;
  templateKind: VideoOverlayTemplateKind;
  useCaseKey: TranslationKey;
}
