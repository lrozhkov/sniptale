import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { areDescriptorListsEqual } from '../effects/descriptor-equality';

export type FrameRenderDescriptor = {
  blurAmount: number | undefined;
  blurType: string | undefined;
  blurShowBorder: boolean | undefined;
  borderId: string | undefined;
  borderColor: string | undefined;
  borderCustomCss: string | undefined;
  borderFillColor: string | undefined;
  borderFillOpacity: number | undefined;
  borderInheritCustomCss: boolean | undefined;
  borderOpacity: number | undefined;
  borderPaddingBottom: number | undefined;
  borderPaddingLeft: number | undefined;
  borderPaddingRight: number | undefined;
  borderPaddingTop: number | undefined;
  borderRadius: number | undefined;
  borderShadow: number | undefined;
  borderStrokeOpacity: number | undefined;
  borderStyle: string | undefined;
  borderWidth: number | undefined;
  calloutAnchor: string | undefined;
  calloutBgColor: string | undefined;
  calloutEnabled: boolean | undefined;
  calloutFontFamily: string | undefined;
  calloutFontSize: number | undefined;
  calloutFontWeight: string | undefined;
  calloutHtmlContent: string | undefined;
  calloutMaxWidth: number | undefined;
  calloutSide: string | undefined;
  calloutTailSize: number | undefined;
  calloutTextColor: string | undefined;
  calloutVariant: string | undefined;
  effectMode: FrameData['effectMode'];
  focusOpacity: number | undefined;
  focusShowBorder: boolean | undefined;
  height: number;
  id: string;
  offsetHeight: number | undefined;
  offsetWidth: number | undefined;
  offsetX: number | undefined;
  offsetY: number | undefined;
  state: FrameState | undefined;
  stepBadgeAlphabet: string | undefined;
  stepBadgeAnchor: string | undefined;
  stepBadgeEnabled: boolean | undefined;
  stepBadgeOffsetDirections: string;
  stepBadgeSizeLevel: number | undefined;
  stepBadgeType: string | undefined;
  stepBadgeValue: string | number | undefined;
  width: number;
  x: number;
  y: number;
};

export function buildFrameRenderDescriptors(
  currentFrames: FrameData[],
  currentFrameStates: Map<string, FrameState>
): FrameRenderDescriptor[] {
  return currentFrames.map((frame) => buildFrameRenderDescriptor(frame, currentFrameStates));
}

export function areFrameRenderDescriptorsEqual(
  next: FrameRenderDescriptor[],
  current: FrameRenderDescriptor[]
): boolean {
  return areDescriptorListsEqual(next, current);
}

function buildFrameRenderDescriptor(
  frame: FrameData,
  currentFrameStates: Map<string, FrameState>
): FrameRenderDescriptor {
  return {
    ...buildFrameBorderDescriptor(frame),
    ...buildFrameOffsetDescriptor(frame),
    ...buildFrameStepBadgeDescriptor(frame),
    ...buildFrameCalloutDescriptor(frame),
    blurAmount: frame.blurSettings?.amount,
    blurShowBorder: frame.blurSettings?.showBorder,
    blurType: frame.blurSettings?.blurType,
    effectMode: frame.effectMode,
    focusOpacity: frame.focusSettings?.opacity,
    focusShowBorder: frame.focusSettings?.showBorder,
    height: frame.height,
    id: frame.id,
    state: currentFrameStates.get(frame.id),
    width: frame.width,
    x: frame.x,
    y: frame.y,
  };
}

function buildFrameBorderDescriptor(frame: FrameData) {
  const borderSettings = frame.borderSettings;
  const padding = borderSettings?.padding;

  return {
    borderColor: borderSettings?.color,
    borderCustomCss: borderSettings?.customCss,
    borderFillColor: borderSettings?.fillColor,
    borderFillOpacity: borderSettings?.fillOpacity,
    borderId: borderSettings?.id,
    borderInheritCustomCss: borderSettings?.inheritCustomCss,
    borderOpacity: borderSettings?.opacity,
    borderPaddingBottom: padding?.bottom,
    borderPaddingLeft: padding?.left,
    borderPaddingRight: padding?.right,
    borderPaddingTop: padding?.top,
    borderRadius: borderSettings?.radius,
    borderShadow: borderSettings?.shadow,
    borderStrokeOpacity: borderSettings?.strokeOpacity,
    borderStyle: borderSettings?.style,
    borderWidth: borderSettings?.width,
  };
}

function buildFrameOffsetDescriptor(frame: FrameData) {
  const offset = frame.offset;

  return {
    offsetHeight: offset?.height,
    offsetWidth: offset?.width,
    offsetX: offset?.x,
    offsetY: offset?.y,
  };
}

function buildFrameStepBadgeDescriptor(frame: FrameData) {
  const stepBadge = frame.stepBadge;

  return {
    stepBadgeAlphabet: stepBadge?.alphabet,
    stepBadgeAnchor: stepBadge?.anchor,
    stepBadgeEnabled: stepBadge?.enabled,
    stepBadgeOffsetDirections: (stepBadge?.offsetDirections ?? []).join(','),
    stepBadgeSizeLevel: stepBadge?.sizeLevel,
    stepBadgeType: stepBadge?.type,
    stepBadgeValue: stepBadge?.value,
  };
}

function buildFrameCalloutDescriptor(frame: FrameData) {
  const callout = frame.callout;

  return {
    calloutAnchor: callout?.anchor,
    calloutBgColor: callout?.bgColor,
    calloutEnabled: callout?.enabled,
    calloutFontFamily: callout?.fontFamily,
    calloutFontSize: callout?.fontSize,
    calloutFontWeight: callout?.fontWeight,
    calloutHtmlContent: callout?.htmlContent,
    calloutMaxWidth: callout?.maxWidth,
    calloutSide: callout?.side,
    calloutTailSize: callout?.tailSize,
    calloutTextColor: callout?.textColor,
    calloutVariant: callout?.variant,
  };
}
