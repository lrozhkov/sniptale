import type { TranslationKey } from '../../../../platform/i18n';
import {
  VideoOverlayAnimationKind,
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionEasing,
} from '../types/index';

export interface TemplateVocabularyDefinition<TValue extends string> {
  labelKey: TranslationKey;
  value: TValue;
}

const VIDEO_TEMPLATE_DIRECTION_DEFINITIONS = [
  {
    value: VideoTemplateDirection.LEFT,
    labelKey: 'videoEditor.sidebar.annotationDirectionLeft',
  },
  {
    value: VideoTemplateDirection.RIGHT,
    labelKey: 'videoEditor.sidebar.annotationDirectionRight',
  },
  {
    value: VideoTemplateDirection.UP,
    labelKey: 'videoEditor.sidebar.annotationDirectionUp',
  },
  {
    value: VideoTemplateDirection.DOWN,
    labelKey: 'videoEditor.sidebar.annotationDirectionDown',
  },
] as const satisfies readonly TemplateVocabularyDefinition<VideoTemplateDirection>[];

const VIDEO_TEMPLATE_INTENSITY_DEFINITIONS = [
  {
    value: VideoTemplateIntensity.SOFT,
    labelKey: 'videoEditor.sidebar.annotationIntensitySoft',
  },
  {
    value: VideoTemplateIntensity.BALANCED,
    labelKey: 'videoEditor.sidebar.annotationIntensityBalanced',
  },
  {
    value: VideoTemplateIntensity.BOLD,
    labelKey: 'videoEditor.sidebar.annotationIntensityBold',
  },
] as const satisfies readonly TemplateVocabularyDefinition<VideoTemplateIntensity>[];

const VIDEO_OVERLAY_ANIMATION_DEFINITIONS = [
  {
    value: VideoOverlayAnimationKind.NONE,
    labelKey: 'videoEditor.sidebar.annotationAnimationNone',
  },
  {
    value: VideoOverlayAnimationKind.SLIDE_UP_FADE,
    labelKey: 'videoEditor.sidebar.annotationAnimationSlideUpFade',
  },
  {
    value: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    labelKey: 'videoEditor.sidebar.annotationAnimationSlideLeftFade',
  },
  {
    value: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    labelKey: 'videoEditor.sidebar.annotationAnimationConnectorDraw',
  },
  {
    value: VideoOverlayAnimationKind.ANCHOR_POP,
    labelKey: 'videoEditor.sidebar.annotationAnimationAnchorPop',
  },
  {
    value: VideoOverlayAnimationKind.REVEAL_MASK,
    labelKey: 'videoEditor.sidebar.annotationAnimationRevealMask',
  },
  {
    value: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    labelKey: 'videoEditor.sidebar.annotationAnimationShimmerEntry',
  },
  {
    value: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    labelKey: 'videoEditor.sidebar.annotationAnimationShimmerSweep',
  },
  {
    value: VideoOverlayAnimationKind.SOFT_BLUR_REVEAL,
    labelKey: 'videoEditor.sidebar.annotationAnimationSoftBlurReveal',
  },
  {
    value: VideoOverlayAnimationKind.SCALE_FADE,
    labelKey: 'videoEditor.sidebar.annotationAnimationScaleFade',
  },
  {
    value: VideoOverlayAnimationKind.THREE_D_REVEAL,
    labelKey: 'videoEditor.sidebar.annotationAnimationThreeDReveal',
  },
] as const satisfies readonly TemplateVocabularyDefinition<VideoOverlayAnimationKind>[];

const VIDEO_TRANSITION_EASING_DEFINITIONS = [
  {
    value: VideoTransitionEasing.LINEAR,
    labelKey: 'videoEditor.sidebar.transitionEasingLinear',
  },
  {
    value: VideoTransitionEasing.EASE_IN_OUT,
    labelKey: 'videoEditor.sidebar.transitionEasingEaseInOut',
  },
] as const satisfies readonly TemplateVocabularyDefinition<VideoTransitionEasing>[];

export function getVideoOverlayAnimationDefinitions() {
  return VIDEO_OVERLAY_ANIMATION_DEFINITIONS;
}

export function getVideoTemplateDirectionDefinitions() {
  return VIDEO_TEMPLATE_DIRECTION_DEFINITIONS;
}

export function getVideoTemplateIntensityDefinitions() {
  return VIDEO_TEMPLATE_INTENSITY_DEFINITIONS;
}

export function getVideoTransitionEasingDefinitions() {
  return VIDEO_TRANSITION_EASING_DEFINITIONS;
}

function findTemplateVocabularyLabelKey<TValue extends string>(
  definitions: readonly TemplateVocabularyDefinition<TValue>[],
  value: TValue
) {
  return definitions.find((definition) => definition.value === value)?.labelKey;
}

export function getVideoTemplateDirectionLabelKey(value: VideoTemplateDirection) {
  return findTemplateVocabularyLabelKey(VIDEO_TEMPLATE_DIRECTION_DEFINITIONS, value);
}

export function getVideoTemplateIntensityLabelKey(value: VideoTemplateIntensity) {
  return findTemplateVocabularyLabelKey(VIDEO_TEMPLATE_INTENSITY_DEFINITIONS, value);
}

export function getVideoOverlayAnimationLabelKey(value: VideoOverlayAnimationKind) {
  return findTemplateVocabularyLabelKey(VIDEO_OVERLAY_ANIMATION_DEFINITIONS, value);
}

export function getVideoTransitionEasingLabelKey(value: VideoTransitionEasing) {
  return findTemplateVocabularyLabelKey(VIDEO_TRANSITION_EASING_DEFINITIONS, value);
}
