import React from 'react';
import type { StepBadgeManualPlacement, StepBadgeSettings } from '../../contracts';
import { useTransientControlVisibility } from '../interaction/transient-control-visibility';
import { useStepBadgeControlPosition } from './controls';
import { useStepBadgeBoundaryDrag } from './drag';
import {
  getStepBadgeInitialPlacement,
  getStepBadgeVisualMetrics,
  type StepBadgeFrameRect,
} from './placement';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';

export function useStepBadgeInteraction(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  borderWidth: number;
  chromeScale?: number;
  frameRect: StepBadgeFrameRect | undefined;
  isSettingsOpen: boolean | undefined;
  onPositionChange: ((placement: StepBadgeManualPlacement) => void) | undefined;
  settings: StepBadgeSettings;
}) {
  const badgeRef = React.useRef<HTMLDivElement | null>(null);
  const hasControls = Boolean(args.frameRect && args.onPositionChange);
  const initialPlacement = getStepBadgeInitialPlacement(args.settings);
  const visualMetrics = getStepBadgeVisualMetrics(args.settings, args.borderWidth);
  const visualOffset = visualMetrics.offset;
  const drag = useStepBadgeBoundaryDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    frameRect: args.frameRect ?? { x: 0, y: 0, width: 1, height: 1 },
    initialPlacement,
    onPositionChange: args.onPositionChange ?? (() => undefined),
    visualOffset,
    ...(args.chromeScale === undefined ? {} : { visualScale: args.chromeScale }),
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
      badgeSize: visualMetrics.badgeSize,
      sizeLevel: effectiveSettings.sizeLevel,
    }),
    ...(args.chromeScale === undefined ? {} : { uiScale: args.chromeScale }),
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
