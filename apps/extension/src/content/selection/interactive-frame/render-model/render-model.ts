import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  colorToRgba,
  resolveBorderPresetVisual,
  resolveBorderShadowVisual,
} from '../../../../features/highlighter/style';
import { resolveFrameSurface } from '../../../../features/highlighter/frame-surface';
import {
  getInteractiveFrameFillStyle,
  getInteractiveFrameStrokeStyle,
  getInteractiveFrameStyle,
} from '../layout/style';

const Z_INDEX_FRAMES = 2147483644;

function resolveInteractiveFrameBorderVisual(frame: FrameData) {
  return frame.borderSettings ? resolveBorderPresetVisual(frame.borderSettings) : null;
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
  state: FrameState;
  zIndex: number;
}) {
  const { frame, currentFrame, effectMode, state, zIndex } = params;
  const borderVisual = resolveInteractiveFrameBorderVisual(frame);
  const surface = resolveFrameSurface({ ...currentFrame, effectMode });
  const borderWidth = surface.geometry.strokeWidth;
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
      state,
    }),
    fillStyle: getInteractiveFrameFillStyle({
      decorationVisible: surface.decorationVisible,
      fillVisible: surface.fillVisible,
      fillColor: fillCssColor,
      borderRadius: surface.geometry.radius,
      ...(borderVisual ? { customCssStyles: borderVisual.customCssStyles } : {}),
    }),
    strokeStyle: getInteractiveFrameStrokeStyle({
      visible: surface.strokeVisible,
      borderWidth,
      borderStyle: borderVisual?.strokeStyle ?? 'solid',
      borderColor: borderCssColor,
      borderRadius: surface.geometry.radius,
      ...(shadowVisual?.frameBoxShadow === undefined
        ? {}
        : { boxShadow: shadowVisual.frameBoxShadow }),
    }),
    frameZIndex: state === 'editing' || state === 'resizing' ? Z_INDEX_FRAMES : zIndex,
  };
}
