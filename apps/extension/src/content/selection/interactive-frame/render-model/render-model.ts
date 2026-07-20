import React from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import {
  colorToRgba,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../../features/highlighter/style';
import { getSelectionFrameVisual } from '../../frame-runtime/selection-frame-visual';
import { getInteractiveFrameStyle } from '../layout/style';

const HIGHLIGHT_BORDER_WIDTH = 3;
const Z_INDEX_FRAMES = 2147483644;

function resolveInteractiveFrameBorderVisual(
  frame: FrameData,
  state: 'idle' | 'hover' | 'editing'
) {
  if (state === 'editing') {
    return getSelectionFrameVisual();
  }

  return frame.borderSettings ? resolveBorderPresetVisual(frame.borderSettings) : null;
}

function shouldShowInteractiveFrameBorder(params: {
  effectMode: EffectMode;
  frame: FrameData;
  state: 'idle' | 'hover' | 'editing';
}) {
  if (params.state === 'editing') {
    return true;
  }

  if (params.effectMode === 'blur') {
    return params.frame.blurSettings?.showBorder ?? false;
  }

  if (params.effectMode === 'focus') {
    return params.frame.focusSettings?.showBorder ?? false;
  }

  return true;
}

export function useInteractiveFrameRenderRefs() {
  const popoverAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const stepBadgePopoverAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const calloutPopoverAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startFrameRef = React.useRef<FrameData>({} as FrameData);
  const startEffectModeRef = React.useRef<EffectMode>('border');
  const handleSaveRef = React.useRef<() => void>(() => {});
  const handleCancelRef = React.useRef<() => void>(() => {});
  const handleDeleteRef = React.useRef<() => void>(() => {});

  return {
    popoverAnchorRef,
    stepBadgePopoverAnchorRef,
    calloutPopoverAnchorRef,
    frameRef,
    containerRef,
    startFrameRef,
    startEffectModeRef,
    handleSaveRef,
    handleCancelRef,
    handleDeleteRef,
  };
}

export function getInteractiveFrameDisplay(params: {
  frame: FrameData;
  currentFrame: FrameData;
  effectMode: EffectMode;
  state: 'idle' | 'hover' | 'editing';
  zIndex: number;
}) {
  const { frame, currentFrame, effectMode, state, zIndex } = params;
  const borderVisual = resolveInteractiveFrameBorderVisual(frame, state);
  const borderWidth = borderVisual?.strokeWidth ?? HIGHLIGHT_BORDER_WIDTH;
  const borderColor = borderVisual?.strokeColor ?? 'var(--sniptale-color-accent)';
  const borderCssColor = borderVisual
    ? colorToRgba(borderVisual.strokeColor, borderVisual.strokeOpacity)
    : borderColor;
  const fillCssColor = borderVisual
    ? colorToRgba(borderVisual.fillColor, borderVisual.fillOpacity)
    : 'transparent';
  const shadowVisual = borderVisual
    ? resolveBorderShadowVisual(borderVisual.shadow, borderColor)
    : null;

  return {
    borderColor,
    borderWidth,
    borderShadow: frame.borderSettings?.shadow,
    frameStyle: getInteractiveFrameStyle({
      currentFrame,
      shouldShowBorder: shouldShowInteractiveFrameBorder({ effectMode, frame, state }),
      borderWidth,
      borderStyle: borderVisual?.strokeStyle ?? 'solid',
      borderColor: borderCssColor,
      borderRadius: borderVisual?.radius ?? 0,
      fillColor: fillCssColor,
      state,
      ...(borderVisual ? { customCssStyles: borderVisual.customCssStyles } : {}),
      ...(shadowVisual?.frameBoxShadow === undefined
        ? {}
        : { boxShadow: shadowVisual.frameBoxShadow }),
    }),
    frameZIndex: state === 'idle' ? zIndex : Z_INDEX_FRAMES,
  };
}
