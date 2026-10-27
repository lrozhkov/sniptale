import React from 'react';
import type { StepBadgeManualPlacement, StepBadgeSettings } from '../../contracts';
import { useTransientControlVisibility } from '../interaction/transient-control-visibility';
import { useStepBadgeControlPosition } from './controls';
import { useStepBadgeBoundaryDrag, useStepBadgePointDrag } from './drag';
import {
  getStepBadgeInitialPlacement,
  getStepBadgeVisualMetrics,
  type StepBadgeFrameRect,
} from './placement';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';

export function useStepBadgeInteraction(args: {
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  borderWidth: number;
  canEditValue?: boolean;
  canDelete?: boolean;
  chromeScale?: number;
  frameRect: StepBadgeFrameRect | undefined;
  isSettingsOpen: boolean | undefined;
  onPositionChange: ((placement: StepBadgeManualPlacement) => void) | undefined;
  onFramePositionChange?: (point: { x: number; y: number }) => void;
  settings: StepBadgeSettings;
}) {
  const badgeRef = React.useRef<HTMLDivElement | null>(null);
  const hasControls = Boolean(
    args.frameRect && (args.onPositionChange || args.onFramePositionChange)
  );
  const initialPlacement = getStepBadgeInitialPlacement(args.settings);
  const visualMetrics = getStepBadgeVisualMetrics(args.settings, args.borderWidth);
  const visualOffset = visualMetrics.offset;
  const boundaryDrag = useStepBadgeBoundaryDrag({
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    frameRect: args.frameRect ?? { x: 0, y: 0, width: 1, height: 1 },
    initialPlacement,
    onPositionChange: args.onPositionChange ?? (() => undefined),
    visualOffset,
    ...(args.chromeScale === undefined ? {} : { visualScale: args.chromeScale }),
  });
  const pointDrag = useStepBadgePointDrag({
    point: args.frameRect ?? { x: 0, y: 0 },
    ...(args.coordinateSpace ? { coordinateSpace: args.coordinateSpace } : {}),
    onPositionChange: args.onFramePositionChange ?? (() => undefined),
  });
  const drag = args.onFramePositionChange ? pointDrag : boundaryDrag;
  const effectiveFrameRect =
    args.frameRect && pointDrag.draftPoint && args.onFramePositionChange
      ? { ...args.frameRect, ...pointDrag.draftPoint }
      : args.frameRect;
  const visibility = useTransientControlVisibility(drag.isDragging || Boolean(args.isSettingsOpen));
  const effectiveSettings =
    !args.onFramePositionChange && boundaryDrag.draftPlacement
      ? { ...args.settings, manualPlacement: boundaryDrag.draftPlacement }
      : args.settings;
  const controlPosition = useStepBadgeControlPosition({
    badgeRef,
    controlCount: (args.canEditValue ? 3 : 2) + (args.canDelete ? 1 : 0),
    isEnabled: hasControls,
    placementKey: JSON.stringify({
      anchor: effectiveSettings.anchor,
      frameRect: effectiveFrameRect
        ? {
            height: effectiveFrameRect.height,
            width: effectiveFrameRect.width,
            x: effectiveFrameRect.x,
            y: effectiveFrameRect.y,
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
    effectiveFrameRect,
    hasControls,
    visibility,
  };
}
