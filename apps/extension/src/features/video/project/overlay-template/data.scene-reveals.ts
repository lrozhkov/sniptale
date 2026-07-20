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

export const VIDEO_OVERLAY_TEMPLATE_SCENE_REVEAL_DEFINITIONS = {
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.SHIMMER_LABEL,
    VideoAnnotationFamily.MARKER,
    VideoAnnotationLayoutFamily.PILL_LABEL,
    VideoAnnotationMotionFamily.MARKER_POP,
    VideoAnnotationRenderFamily.MARKER,
    0,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateShimmerLabel',
    'videoEditor.templates.overlayDescriptionShimmerLabel',
    'videoEditor.templates.overlayGroupSceneReveals',
    'videoEditor.templates.overlayUseCaseShimmerLabel',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.SWEEP,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 3.2 }
  ),
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
    VideoAnnotationFamily.TITLE,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    1,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateSideRevealPanel',
    'videoEditor.templates.overlayDescriptionSideRevealPanel',
    'videoEditor.templates.overlayGroupSceneReveals',
    'videoEditor.templates.overlayUseCaseSideRevealPanel',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 4.4 }
  ),
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.SCENE_PROGRESS_CARD,
    VideoAnnotationFamily.TITLE,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    2,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateSceneProgressCard',
    'videoEditor.templates.overlayDescriptionSceneProgressCard',
    'videoEditor.templates.overlayGroupSceneReveals',
    'videoEditor.templates.overlayUseCaseSceneProgressCard',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.SWEEP,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 4.2 }
  ),
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    VideoAnnotationFamily.CALLOUT,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    3,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateThreeDRevealCard',
    'videoEditor.templates.overlayDescriptionThreeDRevealCard',
    'videoEditor.templates.overlayGroupSceneReveals',
    'videoEditor.templates.overlayUseCaseThreeDRevealCard',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.DEPTH,
      VideoTemplatePreviewVariant.CTA
    ),
    { defaultDurationSeconds: 4.6 }
  ),
} as const;
