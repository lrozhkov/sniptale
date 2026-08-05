import type { InteractiveFrameProps } from './types';
import { createCalloutRenderKey } from '../../callout/model';

function hasMeaningfulRectChange(
  prevProps: InteractiveFrameProps,
  nextProps: InteractiveFrameProps
) {
  const prevFrame = prevProps.frame;
  const nextFrame = nextProps.frame;
  return (
    prevFrame.x !== nextFrame.x ||
    prevFrame.y !== nextFrame.y ||
    prevFrame.width !== nextFrame.width ||
    prevFrame.height !== nextFrame.height
  );
}

function hasBorderSettingsChange(
  prevProps: InteractiveFrameProps,
  nextProps: InteractiveFrameProps
) {
  const prev = prevProps.frame.borderSettings;
  const next = nextProps.frame.borderSettings;
  return (
    prevProps.frame.borderSettings !== nextProps.frame.borderSettings &&
    (prev?.sourcePresetId !== next?.sourcePresetId ||
      prev?.color !== next?.color ||
      prev?.width !== next?.width ||
      prev?.style !== next?.style ||
      prev?.radius !== next?.radius ||
      prev?.opacity !== next?.opacity ||
      prev?.strokeOpacity !== next?.strokeOpacity ||
      prev?.fillColor !== next?.fillColor ||
      prev?.fillOpacity !== next?.fillOpacity ||
      prev?.inheritCustomCss !== next?.inheritCustomCss ||
      prev?.customCss !== next?.customCss ||
      prev?.shadow !== next?.shadow)
  );
}

function hasBlurFocusChange(prevProps: InteractiveFrameProps, nextProps: InteractiveFrameProps) {
  const prevBlur = prevProps.frame.blurSettings;
  const nextBlur = nextProps.frame.blurSettings;
  const prevFocus = prevProps.frame.focusSettings;
  const nextFocus = nextProps.frame.focusSettings;

  return (
    (prevProps.frame.blurSettings !== nextProps.frame.blurSettings &&
      (prevBlur?.amount !== nextBlur?.amount ||
        prevBlur?.blurType !== nextBlur?.blurType ||
        prevBlur?.showBorder !== nextBlur?.showBorder)) ||
    (prevProps.frame.focusSettings !== nextProps.frame.focusSettings &&
      (prevFocus?.opacity !== nextFocus?.opacity ||
        prevFocus?.showBorder !== nextFocus?.showBorder))
  );
}

function hasStepBadgeChange(prevProps: InteractiveFrameProps, nextProps: InteractiveFrameProps) {
  const prev = prevProps.frame.stepBadge;
  const next = nextProps.frame.stepBadge;
  const prevOff = prev?.offsetDirections ?? [];
  const nextOff = next?.offsetDirections ?? [];

  return (
    prevProps.frame.stepBadge !== nextProps.frame.stepBadge &&
    (prev?.enabled !== next?.enabled ||
      prev?.value !== next?.value ||
      prev?.anchor !== next?.anchor ||
      prev?.manualPlacement?.position !== next?.manualPlacement?.position ||
      prev?.manualPlacement?.side !== next?.manualPlacement?.side ||
      prev?.sizeLevel !== next?.sizeLevel ||
      JSON.stringify(prev?.style ?? null) !== JSON.stringify(next?.style ?? null) ||
      prevOff.length !== nextOff.length ||
      prevOff.some((direction: string, index: number) => direction !== nextOff[index]) ||
      prev?.type !== next?.type ||
      prev?.alphabet !== next?.alphabet)
  );
}

function hasCalloutChange(prevProps: InteractiveFrameProps, nextProps: InteractiveFrameProps) {
  const prev = prevProps.frame.callout;
  const next = nextProps.frame.callout;
  return (
    prevProps.frame.callout !== nextProps.frame.callout &&
    createCalloutRenderKey(prev) !== createCalloutRenderKey(next)
  );
}

export function areInteractiveFramePropsEqual(
  prevProps: InteractiveFrameProps,
  nextProps: InteractiveFrameProps
): boolean {
  if (prevProps.frame.id !== nextProps.frame.id) return false;
  if (prevProps.frame.effectMode !== nextProps.frame.effectMode) return false;
  if (prevProps.defaultEffectMode !== nextProps.defaultEffectMode) return false;
  if (hasMeaningfulRectChange(prevProps, nextProps)) return false;
  if (hasBorderSettingsChange(prevProps, nextProps)) return false;
  if (hasBlurFocusChange(prevProps, nextProps)) return false;
  if (hasStepBadgeChange(prevProps, nextProps)) return false;
  if (hasCalloutChange(prevProps, nextProps)) return false;

  return !(
    prevProps.onStateChange !== nextProps.onStateChange ||
    prevProps.onUpdate !== nextProps.onUpdate ||
    prevProps.onDelete !== nextProps.onDelete ||
    prevProps.onCancel !== nextProps.onCancel ||
    prevProps.onEffectChange !== nextProps.onEffectChange
  );
}
