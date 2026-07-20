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

export const VIDEO_OVERLAY_TEMPLATE_CALLOUT_DEFINITIONS = {
  [VideoOverlayTemplateKind.CALLOUT_CARD]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.CALLOUT_CARD,
    VideoAnnotationFamily.CALLOUT,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationMotionFamily.FRAME_TRACE,
    VideoAnnotationRenderFamily.FRAME,
    3,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateCalloutCard',
    'videoEditor.templates.overlayDescriptionCalloutCard',
    'videoEditor.templates.overlayGroupCallouts',
    'videoEditor.templates.overlayUseCaseCalloutCard',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    { defaultDurationSeconds: 6 }
  ),
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
    VideoAnnotationFamily.CALLOUT,
    VideoAnnotationLayoutFamily.CONNECTOR,
    VideoAnnotationMotionFamily.CONNECTOR_DRAW,
    VideoAnnotationRenderFamily.LINE,
    1,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateCalloutConnector',
    'videoEditor.templates.overlayDescriptionCalloutConnector',
    'videoEditor.templates.overlayGroupCallouts',
    'videoEditor.templates.overlayUseCaseCalloutConnector',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.REVEAL,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    { defaultDurationSeconds: 5.8 }
  ),
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
    VideoAnnotationFamily.CALLOUT,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationMotionFamily.FRAME_TRACE,
    VideoAnnotationRenderFamily.FRAME,
    2,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateCalloutNotificationBanner',
    'videoEditor.templates.overlayDescriptionCalloutNotificationBanner',
    'videoEditor.templates.overlayGroupCallouts',
    'videoEditor.templates.overlayUseCaseCalloutNotificationBanner',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.GUIDED,
      VideoTemplatePreviewMotion.SLIDE,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    { defaultDurationSeconds: 5.2 }
  ),
  [VideoOverlayTemplateKind.POINTER_LABEL]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.POINTER_LABEL,
    VideoAnnotationFamily.POINTER,
    VideoAnnotationLayoutFamily.MARKER,
    VideoAnnotationMotionFamily.MARKER_POP,
    VideoAnnotationRenderFamily.MARKER,
    0,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplatePointerLabel',
    'videoEditor.templates.overlayDescriptionPointerLabel',
    'videoEditor.templates.overlayGroupCallouts',
    'videoEditor.templates.overlayUseCasePointerLabel',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    { defaultDurationSeconds: 4.2 }
  ),
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
    VideoAnnotationFamily.SPOTLIGHT,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationMotionFamily.PULSE_SPOTLIGHT,
    VideoAnnotationRenderFamily.SPOTLIGHT,
    0,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateFeatureSpotlightCard',
    'videoEditor.templates.overlayDescriptionFeatureSpotlightCard',
    'videoEditor.templates.overlayGroupFocusSpotlight',
    'videoEditor.templates.overlayUseCaseFeatureSpotlightCard',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.HERO,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.SPOTLIGHT
    ),
    { defaultDurationSeconds: 6.4 }
  ),
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
    VideoAnnotationFamily.SPOTLIGHT,
    VideoAnnotationLayoutFamily.FRAME,
    VideoAnnotationMotionFamily.PULSE_SPOTLIGHT,
    VideoAnnotationRenderFamily.SPOTLIGHT,
    1,
    VideoTemplateCatalogStatus.CORE,
    'videoEditor.sidebar.annotationTemplateFocusScanFrame',
    'videoEditor.templates.overlayDescriptionFocusScanFrame',
    'videoEditor.templates.overlayGroupFocusSpotlight',
    'videoEditor.templates.overlayUseCaseFocusScanFrame',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.TECHNICAL,
      VideoTemplatePreviewMotion.FOCUS,
      VideoTemplatePreviewVariant.SPOTLIGHT
    ),
    { defaultDurationSeconds: 5.6 }
  ),
  [VideoOverlayTemplateKind.SIDE_NOTE]: createVideoOverlayTemplateDefinition(
    VideoOverlayTemplateKind.SIDE_NOTE,
    VideoAnnotationFamily.CALLOUT,
    VideoAnnotationLayoutFamily.RAIL_CARD,
    VideoAnnotationMotionFamily.SLIDE_CARD,
    VideoAnnotationRenderFamily.PLATE,
    4,
    VideoTemplateCatalogStatus.OPTIONAL,
    'videoEditor.sidebar.annotationTemplateSideNote',
    'videoEditor.templates.overlayDescriptionSideNote',
    'videoEditor.templates.overlayGroupCallouts',
    'videoEditor.templates.overlayUseCaseSideNote',
    createVideoTemplatePreviewMetadata(
      VideoTemplatePreviewTone.CALM,
      VideoTemplatePreviewMotion.FADE,
      VideoTemplatePreviewVariant.CALLOUT
    ),
    { defaultDurationSeconds: 5.2 }
  ),
} as const;
