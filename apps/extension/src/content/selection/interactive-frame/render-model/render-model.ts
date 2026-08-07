import React from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { resolveFrameAnnotationVisualScene } from '../../../../features/highlighter/frame-annotation';

const Z_INDEX_FRAMES = 2147483644;

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
  const scene = resolveFrameAnnotationVisualScene({
    frame: { ...currentFrame, effectMode },
    state,
  });

  return {
    borderColor: scene.borderColor,
    borderWidth: scene.borderWidth,
    borderShadow: frame.borderSettings?.shadow,
    frameStyle: scene.frameStyle,
    fillStyle: scene.fillStyle,
    strokeStyle: scene.strokeStyle,
    frameZIndex: state === 'editing' || state === 'resizing' ? Z_INDEX_FRAMES : zIndex,
  };
}
