import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { Paint } from '@sniptale/foundation/paint';
import { arePaintsEqual } from '@sniptale/foundation/paint';
import { areDescriptorListsEqual } from '../effects/descriptor-equality';
import type { AnchorPresentation } from '../host-layout/service';
import { createCalloutRenderKey } from '../../../../features/highlighter/frame-annotation/callout/model';

export type FrameRenderDescriptor = {
  blurAmount: number | undefined;
  blurType: string | undefined;
  blurShowBorder: boolean | undefined;
  borderId: string | undefined;
  borderColor: string | undefined;
  borderCustomCss: string | undefined;
  borderFillPaint: Paint | undefined;
  borderInheritCustomCss: boolean | undefined;
  borderPaddingBottom: number | undefined;
  borderPaddingLeft: number | undefined;
  borderPaddingRight: number | undefined;
  borderPaddingTop: number | undefined;
  borderRadius: number | undefined;
  borderShadow: number | undefined;
  borderStyle: string | undefined;
  borderWidth: number | undefined;
  calloutKey: string;
  effectMode: FrameData['effectMode'];
  focusBlurAmount: number | undefined;
  focusOpacity: number | undefined;
  focusShowBorder: boolean | undefined;
  height: number;
  id: string;
  offsetHeight: number | undefined;
  offsetWidth: number | undefined;
  offsetX: number | undefined;
  offsetY: number | undefined;
  pagePlacementPath: string;
  pagePlacementX: number | undefined;
  pagePlacementY: number | undefined;
  presentation: AnchorPresentation;
  state: FrameState | undefined;
  stepBadgeAlphabet: string | undefined;
  stepBadgeAnchor: string | undefined;
  stepBadgeEnabled: boolean | undefined;
  stepBadgeManualPosition: number | undefined;
  stepBadgeManualSide: string | undefined;
  stepBadgeOffsetDirections: string;
  stepBadgeSizeLevel: number | undefined;
  stepBadgeStyle: string;
  stepBadgeType: string | undefined;
  stepBadgeValue: string | number | undefined;
  width: number;
  x: number;
  y: number;
};

export function buildFrameRenderDescriptors(
  currentFrames: FrameData[],
  currentFrameStates: Map<string, FrameState>,
  presentations: ReadonlyMap<string, AnchorPresentation> = new Map()
): FrameRenderDescriptor[] {
  return currentFrames.map((frame) =>
    buildFrameRenderDescriptor(frame, currentFrameStates, presentations)
  );
}

export function areFrameRenderDescriptorsEqual(
  next: FrameRenderDescriptor[],
  current: FrameRenderDescriptor[]
): boolean {
  return (
    areDescriptorListsEqual(
      next.map(({ borderFillPaint: _paint, ...descriptor }) => descriptor),
      current.map(({ borderFillPaint: _paint, ...descriptor }) => descriptor)
    ) &&
    next.every((descriptor, index) => {
      const currentPaint = current[index]?.borderFillPaint;
      return descriptor.borderFillPaint && currentPaint
        ? arePaintsEqual(descriptor.borderFillPaint, currentPaint)
        : descriptor.borderFillPaint === currentPaint;
    })
  );
}

function buildFrameRenderDescriptor(
  frame: FrameData,
  currentFrameStates: Map<string, FrameState>,
  presentations: ReadonlyMap<string, AnchorPresentation>
): FrameRenderDescriptor {
  return {
    ...buildFrameBorderDescriptor(frame),
    ...buildFrameOffsetDescriptor(frame),
    ...buildFramePagePlacementDescriptor(frame),
    ...buildFrameStepBadgeDescriptor(frame),
    ...buildFrameCalloutDescriptor(frame),
    blurAmount: frame.blurSettings?.amount,
    blurShowBorder: frame.blurSettings?.showBorder,
    blurType: frame.blurSettings?.blurType,
    effectMode: frame.effectMode,
    focusBlurAmount: frame.focusSettings?.blurAmount,
    focusOpacity: frame.focusSettings?.opacity,
    focusShowBorder: frame.focusSettings?.showBorder,
    height: frame.height,
    id: frame.id,
    presentation: presentations.get(frame.id) ?? 'visible',
    state: currentFrameStates.get(frame.id),
    width: frame.width,
    x: frame.x,
    y: frame.y,
  };
}

function buildFramePagePlacementDescriptor(frame: FrameData) {
  return {
    pagePlacementPath: (frame.pagePlacement?.iframePath ?? []).join(' => '),
    pagePlacementX: frame.pagePlacement?.pageX,
    pagePlacementY: frame.pagePlacement?.pageY,
  };
}

function buildFrameBorderDescriptor(frame: FrameData) {
  const borderSettings = frame.borderSettings;
  const padding = borderSettings?.padding;

  return {
    borderColor: borderSettings?.color,
    borderCustomCss: borderSettings?.customCss,
    borderFillPaint: borderSettings?.fillPaint,
    borderId: borderSettings?.sourcePresetId,
    borderInheritCustomCss: borderSettings?.inheritCustomCss,
    borderPaddingBottom: padding?.bottom,
    borderPaddingLeft: padding?.left,
    borderPaddingRight: padding?.right,
    borderPaddingTop: padding?.top,
    borderRadius: borderSettings?.radius,
    borderShadow: borderSettings?.shadow,
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
    stepBadgeManualNormalOffset: stepBadge?.manualPlacement?.normalOffset,
    stepBadgeManualPosition: stepBadge?.manualPlacement?.position,
    stepBadgeManualSide: stepBadge?.manualPlacement?.side,
    stepBadgeOffsetDirections: (stepBadge?.offsetDirections ?? []).join(','),
    stepBadgeSizeLevel: stepBadge?.sizeLevel,
    stepBadgeStyle: JSON.stringify(stepBadge?.style ?? null),
    stepBadgeType: stepBadge?.type,
    stepBadgeValue: stepBadge?.value,
  };
}

function buildFrameCalloutDescriptor(frame: FrameData) {
  return {
    calloutKey: [frame.callout, ...(frame.additionalCallouts ?? [])]
      .map(createCalloutRenderKey)
      .join('\n'),
  };
}
