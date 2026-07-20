import {
  getVideoOverlayAnimationDefinitions,
  getVideoTemplateDirectionDefinitions,
  getVideoTemplateIntensityDefinitions,
} from '../../../../../features/video/project/template/vocabulary';
import {
  getVideoOverlayTemplateDefinition,
  getVideoOverlayTemplateSelectionOrder,
} from '../../../../../features/video/project/overlay-template/registry';
import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  VideoAnnotationArrowKind,
  VideoAnnotationLeaderLineStyle,
  VideoAnnotationMarkerKind,
  VideoAnnotationTargetKind,
} from '../../../../../features/video/project/types';
import type { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import type {
  VideoTemplateDirection,
  VideoTemplateIntensity,
} from '../../../../../features/video/project/types';
import { buildTemplateCatalogOptions, buildVocabularySelectOptions } from '../inputs/options';

export function getAnnotationTemplateOptions(): GlassSelectOption<VideoOverlayTemplateKind>[] {
  return buildTemplateCatalogOptions(
    getVideoOverlayTemplateSelectionOrder(),
    getVideoOverlayTemplateDefinition
  );
}

export const ANNOTATION_ANIMATION_OPTIONS = [...getVideoOverlayAnimationDefinitions()] as const;

export function getAnnotationDirectionOptions(): GlassSelectOption<VideoTemplateDirection>[] {
  return buildVocabularySelectOptions(getVideoTemplateDirectionDefinitions());
}

export function getAnnotationIntensityOptions(): GlassSelectOption<VideoTemplateIntensity>[] {
  return buildVocabularySelectOptions(getVideoTemplateIntensityDefinitions());
}

export function getAnnotationTargetKindOptions(): GlassSelectOption<VideoAnnotationTargetKind>[] {
  return [
    {
      value: VideoAnnotationTargetKind.NONE,
      label: translate('videoEditor.sidebar.annotationTargetNone'),
    },
    {
      value: VideoAnnotationTargetKind.POINT,
      label: translate('videoEditor.sidebar.annotationTargetPoint'),
    },
    {
      value: VideoAnnotationTargetKind.RECT,
      label: translate('videoEditor.sidebar.annotationTargetRect'),
    },
  ];
}

export function getAnnotationLeaderLineStyleOptions(): GlassSelectOption<VideoAnnotationLeaderLineStyle>[] {
  return [
    {
      value: VideoAnnotationLeaderLineStyle.STRAIGHT,
      label: translate('videoEditor.sidebar.annotationLeaderLineStraight'),
    },
    {
      value: VideoAnnotationLeaderLineStyle.ELBOW,
      label: translate('videoEditor.sidebar.annotationLeaderLineElbow'),
    },
  ];
}

export function getAnnotationMarkerKindOptions(): GlassSelectOption<VideoAnnotationMarkerKind>[] {
  return [
    {
      value: VideoAnnotationMarkerKind.NONE,
      label: translate('videoEditor.sidebar.annotationMarkerKindNone'),
    },
    {
      value: VideoAnnotationMarkerKind.DOT,
      label: translate('videoEditor.sidebar.annotationMarkerKindDot'),
    },
    {
      value: VideoAnnotationMarkerKind.RING,
      label: translate('videoEditor.sidebar.annotationMarkerKindRing'),
    },
  ];
}

export function getAnnotationArrowKindOptions(): GlassSelectOption<VideoAnnotationArrowKind>[] {
  return [
    {
      value: VideoAnnotationArrowKind.NONE,
      label: translate('videoEditor.sidebar.annotationArrowKindNone'),
    },
    {
      value: VideoAnnotationArrowKind.CHEVRON,
      label: translate('videoEditor.sidebar.annotationArrowKindChevron'),
    },
  ];
}
