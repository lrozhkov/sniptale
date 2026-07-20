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

export const VIDEO_OVERLAY_TEMPLATE_TITLE_DEFINITIONS = {
  [VideoOverlayTemplateKind.TITLE_REVEAL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.TITLE_REVEAL,
    VideoAnnotationFamily.TITLE,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationMotionFamily.STAGGER_TITLE,
    VideoAnnotationRenderFamily.PLATE,
    0,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateTitleReveal',
    'videoEditor.templates.overlayDescriptionTitleReveal',
    'videoEditor.templates.overlayGroupTitles',
    'videoEditor.templates.overlayUseCaseTitleReveal',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.EDITORIAL,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 4.4 }
  ),
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.SECTION_DIVIDER,
    VideoAnnotationFamily.TITLE,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationMotionFamily.STAGGER_TITLE,
    VideoAnnotationRenderFamily.PLATE,
    1,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateSectionDivider',
    'videoEditor.templates.overlayDescriptionSectionDivider',
    'videoEditor.templates.overlayGroupTitles',
    'videoEditor.templates.overlayUseCaseSectionDivider',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.CALM,
      VideoTemplatePreviewMotion.FADE,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 3.4 }
  ),
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL,
    VideoAnnotationFamily.TITLE,
    VideoAnnotationLayoutFamily.TITLE_STACK,
    VideoAnnotationMotionFamily.STAGGER_TITLE,
    VideoAnnotationRenderFamily.PLATE,
    2,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateTitleCursorReveal',
    'videoEditor.templates.overlayDescriptionTitleCursorReveal',
    'videoEditor.templates.overlayGroupTitles',
    'videoEditor.templates.overlayUseCaseTitleCursorReveal',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.SWEEP,
      VideoTemplatePreviewVariant.TITLE
    ),
    { defaultDurationSeconds: 4 }
  ),
} as const;
