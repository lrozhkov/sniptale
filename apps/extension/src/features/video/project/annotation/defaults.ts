import { translate } from '../../../../platform/i18n';
import type { TranslationKey } from '../../../../platform/i18n';
import { DEFAULT_VIDEO_ANNOTATION_TEMPLATE } from '../defaults';
import {
  createAnnotationTemplateContent,
  createAnnotationTemplateStyle,
  getAnnotationMotionPreset,
  getAnnotationTransformPreset,
} from './presets';
import { createAnnotationTargetDefaults } from './target';
import { resolveAnnotationTemplateTraits } from './template-families';
import type {
  VideoProjectAnnotationContent,
  VideoProjectAnnotationFields,
  VideoProjectTransform,
  VideoOverlayTemplateKind,
} from '../types/index';

type AnnotationTemplateKind = VideoOverlayTemplateKind;

interface AnnotationTemplateDefaults extends Omit<VideoProjectAnnotationFields, 'templateKind'> {
  transform: VideoProjectTransform;
}

const VIDEO_ANNOTATION_TEMPLATE_TEXT_KEYS = {
  LOWER_THIRD_BASIC: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdBasicBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdBasicHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdBasicSubline',
  },
  LOWER_THIRD_ACCENT: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdAccentBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdAccentHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdAccentSubline',
  },
  LOWER_THIRD_EDITORIAL: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdEditorialBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdEditorialHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdEditorialSubline',
  },
  LOWER_THIRD_STACKED: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdStackedBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdStackedHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdStackedSubline',
  },
  LOWER_THIRD_BADGE: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdBadgeBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdBadgeHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdBadgeSubline',
  },
  LOWER_THIRD_STATUS_TICKER: {
    badgeKey: 'shared.videoProject.defaultAnnotationLowerThirdStatusTickerBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationLowerThirdStatusTickerHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationLowerThirdStatusTickerSubline',
  },
  CALLOUT_CARD: {
    badgeKey: 'shared.videoProject.defaultAnnotationCalloutCardBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationCalloutCardHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationCalloutCardSubline',
  },
  CALLOUT_CONNECTOR: {
    badgeKey: 'shared.videoProject.defaultAnnotationCalloutConnectorBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationCalloutConnectorHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationCalloutConnectorSubline',
  },
  CALLOUT_NOTIFICATION_BANNER: {
    badgeKey: 'shared.videoProject.defaultAnnotationCalloutNotificationBannerBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationCalloutNotificationBannerHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationCalloutNotificationBannerSubline',
  },
  POINTER_LABEL: {
    badgeKey: null,
    headlineKey: 'shared.videoProject.defaultAnnotationPointerLabelHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationPointerLabelSubline',
  },
  FEATURE_SPOTLIGHT_CARD: {
    badgeKey: 'shared.videoProject.defaultAnnotationFeatureSpotlightBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationFeatureSpotlightHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationFeatureSpotlightSubline',
  },
  FOCUS_SCAN_FRAME: {
    badgeKey: 'shared.videoProject.defaultAnnotationFocusScanFrameBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationFocusScanFrameHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationFocusScanFrameSubline',
  },
  SIDE_NOTE: {
    badgeKey: 'shared.videoProject.defaultAnnotationSideNoteBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationSideNoteHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationSideNoteSubline',
  },
  TITLE_REVEAL: {
    badgeKey: null,
    headlineKey: 'shared.videoProject.defaultAnnotationTitleRevealHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationTitleRevealSubline',
  },
  SECTION_DIVIDER: {
    badgeKey: null,
    headlineKey: 'shared.videoProject.defaultAnnotationSectionDividerHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationSectionDividerSubline',
  },
  TITLE_CURSOR_REVEAL: {
    badgeKey: null,
    headlineKey: 'shared.videoProject.defaultAnnotationTitleCursorRevealHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationTitleCursorRevealSubline',
  },
  SHIMMER_LABEL: {
    badgeKey: 'shared.videoProject.defaultAnnotationShimmerLabelBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationShimmerLabelHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationShimmerLabelSubline',
  },
  SIDE_REVEAL_PANEL: {
    badgeKey: 'shared.videoProject.defaultAnnotationSideRevealPanelBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationSideRevealPanelHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationSideRevealPanelSubline',
  },
  SCENE_PROGRESS_CARD: {
    badgeKey: 'shared.videoProject.defaultAnnotationSceneProgressCardBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationSceneProgressCardHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationSceneProgressCardSubline',
  },
  THREE_D_REVEAL_CARD: {
    badgeKey: 'shared.videoProject.defaultAnnotationThreeDRevealBadge',
    headlineKey: 'shared.videoProject.defaultAnnotationThreeDRevealHeadline',
    sublineKey: 'shared.videoProject.defaultAnnotationThreeDRevealSubline',
  },
} as const satisfies Record<
  AnnotationTemplateKind,
  {
    badgeKey: TranslationKey | null;
    headlineKey: TranslationKey;
    sublineKey: TranslationKey;
  }
>;

function getDefaultAnnotationContent(
  templateKind: AnnotationTemplateKind
): VideoProjectAnnotationContent {
  const templateText = VIDEO_ANNOTATION_TEMPLATE_TEXT_KEYS[templateKind];

  return {
    badge: templateText.badgeKey ? translate(templateText.badgeKey) : null,
    headline: translate(templateText.headlineKey),
    subline: translate(templateText.sublineKey),
  };
}

function createAnnotationTransform(
  projectWidth: number,
  projectHeight: number,
  templateKind: AnnotationTemplateKind
): VideoProjectTransform {
  const preset = getAnnotationTransformPreset(templateKind);

  return {
    height: Math.round(projectHeight * preset.heightPercent),
    opacity: 1,
    rotation: 0,
    width: Math.round(projectWidth * preset.widthPercent),
    x: Math.round(projectWidth * preset.xPercent),
    y: Math.round(projectHeight * preset.yPercent),
  };
}

export function resolveAnnotationTemplateDefaults(
  projectWidth: number,
  projectHeight: number,
  templateKind: AnnotationTemplateKind = DEFAULT_VIDEO_ANNOTATION_TEMPLATE
): AnnotationTemplateDefaults {
  const motion = getAnnotationMotionPreset(templateKind);
  const transform = createAnnotationTransform(projectWidth, projectHeight, templateKind);
  const traits = resolveAnnotationTemplateTraits(templateKind);
  const target = createAnnotationTargetDefaults(templateKind, transform);

  return {
    annotationFamily: traits.annotationFamily,
    calloutDecor: target.calloutDecor,
    content: createAnnotationTemplateContent(
      templateKind,
      getDefaultAnnotationContent(templateKind)
    ),
    direction: motion.direction,
    intensity: motion.intensity,
    introAnimation: motion.introAnimation,
    introDurationMs: motion.introDurationMs,
    leaderLine: target.leaderLine,
    motionFamily: traits.motionFamily,
    outroAnimation: motion.outroAnimation,
    outroDurationMs: motion.outroDurationMs,
    renderFamily: traits.renderFamily,
    style: createAnnotationTemplateStyle(templateKind),
    target: target.target,
    targetPoint: target.targetPoint,
    targetRect: target.targetRect,
    transform,
  };
}
