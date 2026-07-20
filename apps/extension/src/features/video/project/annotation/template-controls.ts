import {
  VideoAnnotationLayoutFamily,
  type VideoAnnotationLayoutFamily as VideoAnnotationLayoutFamilyValue,
} from './layout-family';
import { getVideoOverlayTemplateDefinition } from '../overlay-template/registry';
import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';
import {
  resolveAnnotationTargetControls,
  type VideoAnnotationTargetControls,
} from './template-target-controls';

interface VideoAnnotationTemplateControls extends VideoAnnotationTargetControls {
  annotationFamily: ReturnType<typeof getVideoOverlayTemplateDefinition>['annotationFamily'];
  layoutFamily: VideoAnnotationLayoutFamilyValue;
  motionFamily: ReturnType<typeof getVideoOverlayTemplateDefinition>['motionFamily'];
  renderFamily: ReturnType<typeof getVideoOverlayTemplateDefinition>['renderFamily'];
  showAccentColor: boolean;
  showAccentRail: boolean;
  showBackgroundColor: boolean;
  showBadge: boolean;
  showBadgeTextColor: boolean;
  showBorderRadius: boolean;
  showDepthAmount: boolean;
  showDivider: boolean;
  showDirection: boolean;
  showHeadline: boolean;
  showHeadlineColor: boolean;
  showIntensity: boolean;
  showIntroAnimation: boolean;
  showIntroDuration: boolean;
  showOutroAnimation: boolean;
  showOutroDuration: boolean;
  showPadding: boolean;
  showShimmerAmount: boolean;
  showSubline: boolean;
  showSublineColor: boolean;
  textAlign: 'left' | 'center';
}

const RAIL_CARD_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.RAIL_CARD,
  showAccentRail: true,
  showBadge: true,
  showDivider: false,
  showSubline: true,
  textAlign: 'left',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const CONNECTOR_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.CONNECTOR,
  showAccentRail: false,
  showBadge: false,
  showDivider: false,
  showSubline: true,
  textAlign: 'left',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const FRAME_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.FRAME,
  showAccentRail: false,
  showBadge: false,
  showDivider: false,
  showSubline: true,
  textAlign: 'left',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const MARKER_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.MARKER,
  showAccentRail: false,
  showBadge: false,
  showDivider: false,
  showSubline: false,
  textAlign: 'left',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const PILL_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.PILL_LABEL,
  showAccentRail: false,
  showBadge: false,
  showDivider: false,
  showSubline: false,
  textAlign: 'left',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const TITLE_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.TITLE_STACK,
  showAccentRail: false,
  showBadge: false,
  showDivider: false,
  showSubline: true,
  textAlign: 'center',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

const DIVIDER_CONTROLS = {
  layoutFamily: VideoAnnotationLayoutFamily.TITLE_STACK,
  showAccentRail: false,
  showBadge: false,
  showDivider: true,
  showSubline: false,
  textAlign: 'center',
} as const satisfies Pick<
  VideoAnnotationTemplateControls,
  'layoutFamily' | 'showAccentRail' | 'showBadge' | 'showDivider' | 'showSubline' | 'textAlign'
>;

function resolveLayoutControls(templateKind: VideoProjectAnnotationClip['templateKind']) {
  switch (getVideoOverlayTemplateDefinition(templateKind).layoutFamily) {
    case VideoAnnotationLayoutFamily.RAIL_CARD:
      return RAIL_CARD_CONTROLS;
    case VideoAnnotationLayoutFamily.CONNECTOR:
      return CONNECTOR_CONTROLS;
    case VideoAnnotationLayoutFamily.FRAME:
      return FRAME_CONTROLS;
    case VideoAnnotationLayoutFamily.MARKER:
      return MARKER_CONTROLS;
    case VideoAnnotationLayoutFamily.PILL_LABEL:
      return PILL_CONTROLS;
    case VideoAnnotationLayoutFamily.TITLE_STACK:
      return templateKind === VideoOverlayTemplateKind.SECTION_DIVIDER
        ? DIVIDER_CONTROLS
        : TITLE_CONTROLS;
  }
}

function resolveFieldControls(
  layoutControls: ReturnType<typeof resolveLayoutControls>,
  targetControls: VideoAnnotationTargetControls
) {
  const showAccentColor =
    layoutControls.showAccentRail || layoutControls.showDivider || targetControls.supportsTarget;

  return {
    showAccentColor,
    showBackgroundColor: true,
    showBadge: layoutControls.showBadge,
    showBadgeTextColor: layoutControls.showBadge,
    showBorderRadius: true,
    showDepthAmount: true,
    showDirection: true,
    showHeadline: true,
    showHeadlineColor: true,
    showIntensity: true,
    showIntroAnimation: true,
    showIntroDuration: true,
    showOutroAnimation: true,
    showOutroDuration: true,
    showPadding: true,
    showShimmerAmount: true,
    showSubline: layoutControls.showSubline,
    showSublineColor: layoutControls.showSubline,
  } as const satisfies Pick<
    VideoAnnotationTemplateControls,
    | 'showAccentColor'
    | 'showBackgroundColor'
    | 'showBadge'
    | 'showBadgeTextColor'
    | 'showBorderRadius'
    | 'showDepthAmount'
    | 'showDirection'
    | 'showHeadline'
    | 'showHeadlineColor'
    | 'showIntensity'
    | 'showIntroAnimation'
    | 'showIntroDuration'
    | 'showOutroAnimation'
    | 'showOutroDuration'
    | 'showPadding'
    | 'showShimmerAmount'
    | 'showSubline'
    | 'showSublineColor'
  >;
}

export function resolveAnnotationTemplateControls(
  templateKind: VideoProjectAnnotationClip['templateKind']
): VideoAnnotationTemplateControls {
  const definition = getVideoOverlayTemplateDefinition(templateKind);
  const layoutControls = resolveLayoutControls(templateKind);
  const targetControls = resolveAnnotationTargetControls(templateKind);

  return {
    annotationFamily: definition.annotationFamily,
    motionFamily: definition.motionFamily,
    renderFamily: definition.renderFamily,
    ...layoutControls,
    ...resolveFieldControls(layoutControls, targetControls),
    ...targetControls,
  };
}
