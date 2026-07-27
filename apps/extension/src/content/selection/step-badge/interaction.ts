import React from 'react';
import type {
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '../../../features/highlighter/contracts';
import { useTransientControlVisibility } from '../interactive-frame/overlays/transient-control-visibility';
import { useStepBadgeControlPosition } from './controls';
import { useStepBadgeBoundaryDrag } from './drag';
import {
  getStepBadgeInitialPlacement,
  getStepBadgeVisualMetrics,
  type StepBadgeFrameRect,
} from './placement';

export function useStepBadgeInteraction(args: {
  borderWidth: number;
  frameRect: StepBadgeFrameRect | undefined;
  isSettingsOpen: boolean | undefined;
  onPositionChange: ((placement: StepBadgeManualPlacement) => void) | undefined;
  settings: StepBadgeSettings;
}) {
  const badgeRef = React.useRef<HTMLDivElement | null>(null);
  const hasControls = Boolean(args.frameRect && args.onPositionChange);
  const initialPlacement = getStepBadgeInitialPlacement(args.settings);
  const visualOffset = getStepBadgeVisualMetrics(args.settings, args.borderWidth).offset;
  const boundaryFrameRect = args.frameRect
    ? {
        x: args.frameRect.x + args.borderWidth / 2,
        y: args.frameRect.y + args.borderWidth / 2,
        width: args.frameRect.width + args.borderWidth,
        height: args.frameRect.height + args.borderWidth,
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  const drag = useStepBadgeBoundaryDrag({
    frameRect: boundaryFrameRect,
    initialPlacement,
    onPositionChange: args.onPositionChange ?? (() => undefined),
    visualOffset,
  });
  const visibility = useTransientControlVisibility(drag.isDragging || Boolean(args.isSettingsOpen));
  const effectiveSettings = drag.draftPlacement
    ? { ...args.settings, manualPlacement: drag.draftPlacement }
    : args.settings;
  const controlPosition = useStepBadgeControlPosition({
    badgeRef,
    isEnabled: hasControls,
    placementKey: JSON.stringify({
      anchor: effectiveSettings.anchor,
      frameRect: args.frameRect
        ? {
            height: args.frameRect.height,
            width: args.frameRect.width,
            x: args.frameRect.x,
            y: args.frameRect.y,
          }
        : null,
      manualPlacement: effectiveSettings.manualPlacement,
      offsetDirections: effectiveSettings.offsetDirections,
      sizeLevel: effectiveSettings.sizeLevel,
    }),
  });

  return {
    badgeRef,
    controlPosition,
    drag,
    effectiveSettings,
    hasControls,
    visibility,
  };
}
