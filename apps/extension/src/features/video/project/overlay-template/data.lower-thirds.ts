import { VideoAnnotationLayoutFamily } from '../annotation/layout-family';
import { createVideoOverlayTemplateDefinition } from './definition-builder';
import { VideoTemplateCatalogStatus } from '../template/catalog-status';
import {
  createVideoTemplatePreviewMetadata,
  VideoTemplatePreviewMotion,
  VideoTemplatePreviewTone,
  VideoTemplatePreviewVariant,
} from '../template/preview';
import {
  VideoAnnotationFamily,
  VideoAnnotationMotionFamily,
  VideoAnnotationRenderFamily,
  VideoOverlayTemplateKind,
} from '../types/index';

export const VIDEO_OVERLAY_TEMPLATE_LOWER_THIRD_DEFINITIONS = {
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    0,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateLowerThirdEditorial',
    'videoEditor.templates.overlayDescriptionLowerThirdEditorial',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdEditorial',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.FADE,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 4.8 }
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    1,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateLowerThirdAccent',
    'videoEditor.templates.overlayDescriptionLowerThirdAccent',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdAccent',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 4.6 }
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    2,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateLowerThirdBadge',
    'videoEditor.templates.overlayDescriptionLowerThirdBadge',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdBadge',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 4.8 }
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    3,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateLowerThirdStatusTicker',
    'videoEditor.templates.overlayDescriptionLowerThirdStatusTicker',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdStatusTicker',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.SWEEP,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 4.6 }
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    4,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateLowerThirdBasic',
    'videoEditor.templates.overlayDescriptionLowerThirdBasic',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdBasic',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.CALM,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 4.8 }
  ),
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
    VideoAnnotationFamily.LOWER_THIRD,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    5,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateLowerThirdStacked',
    'videoEditor.templates.overlayDescriptionLowerThirdStacked',
    'videoEditor.templates.overlayGroupLowerThirds',
    'videoEditor.templates.overlayUseCaseLowerThirdStacked',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.LOWER_THIRD
    ),
    { defaultDurationSeconds: 5.4 }
  ),
} as const;
