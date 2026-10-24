import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { motionWindowFocusToComposition } from '../../../../features/video/composition/motion/source-window';
import { DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS, snapStagePoint } from '../canvas/snap';
import { resolvePointFromPointer } from './helpers';
import type { PointOverlayParams, StagePoint } from './types';

/** Keep the accepted scene while dragging; only the local handle and guides follow input. */
export function useMotionFocusDrag(params: PointOverlayParams) {
  const accepted = params.motionProject ?? params.project;
  const id = params.selectedMotionRegion?.id;
  const live = useRef(params);
  live.current = params;
  const session = useRef<(() => void) | null>(null);
  const [point, setPoint] = useState<StagePoint | null>(null);
  useEffect(() => () => session.current?.(), [accepted, id, params.currentTime]);
  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const stage = params.stageRef.current;
    const region = accepted.motionRegions?.find((item) => item.id === id);
    if (
      !stage ||
      !region ||
      (event.button !== undefined && event.button !== 0) ||
      getVideoProjectUtilityLanes(accepted).camera.locked
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    session.current?.();
    const pointerId = event.pointerId;
    const node = event.currentTarget;
    node.focus();
    let frame: number | null = null;
    let latest: StagePoint | null = null;
    let pending: PointerEvent | null = null;
    let guides: ReturnType<typeof snapStagePoint>['guides'] = [];
    let active = true;
    const current = () =>
      active &&
      (live.current.motionProject ?? live.current.project) === accepted &&
      live.current.selectedMotionRegion?.id === id &&
      live.current.currentTime === params.currentTime;
    const publish = () => {
      frame = null;
      if (!current()) return;
      if (pending) locate(pending);
      pending = null;
      if (!latest) return;
      setPoint(latest);
      params.onGuideChange?.(guides);
    };
    const locate = (input: PointerEvent) => {
      if (!Number.isFinite(input.clientX) || !Number.isFinite(input.clientY)) return;
      const snapped = locateMotionPoint(input, stage, accepted, params);
      if (!snapped) return;
      latest = snapped.point;
      guides = snapped.guides;
    };
    const cleanup = () => {
      if (!active) return;
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancelPointer);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      session.current = null;
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
      setPoint(null);
      params.onGuideChange?.([]);
    };
    const cancel = () => cleanup();
    const move = (input: PointerEvent) => {
      if (input.pointerId !== pointerId || !current()) return;
      pending = input;
      if (frame === null) frame = requestAnimationFrame(publish);
    };
    const finish = (input: PointerEvent) => {
      if (input.pointerId !== pointerId) return;
      const valid = current();
      if (valid) {
        if (pending) locate(pending);
        locate(input);
      }
      cleanup();
      if (!valid || !latest) return;
      const focusPoint = motionWindowFocusToComposition(
        accepted,
        region,
        latest,
        params.currentTime,
        true
      );
      if (focusPoint.x !== region.focusPoint?.x || focusPoint.y !== region.focusPoint?.y)
        params.onUpdateMotionRegion(region.id, { focusPoint });
    };
    const cancelPointer = (input: PointerEvent) => {
      if (input.pointerId === pointerId) cancel();
    };
    const key = (input: KeyboardEvent) => {
      if (input.key !== 'Escape') return;
      input.preventDefault();
      input.stopPropagation();
      cancel();
    };
    session.current = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancelPointer);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
    node.addEventListener('lostpointercapture', cancel);
    node.setPointerCapture?.(pointerId);
  };
  return { begin, point };
}

function locateMotionPoint(
  input: PointerEvent,
  stage: HTMLDivElement,
  project: PointOverlayParams['project'],
  params: PointOverlayParams
) {
  const mapped = resolvePointFromPointer(
    input.clientX,
    input.clientY,
    stage,
    project,
    params.camera
  );
  if (!mapped) return null;
  return snapStagePoint({
    point: mapped,
    project,
    settings: params.grid
      ? {
          gridEnabled: params.grid.enabled,
          gridSize: params.grid.size,
          gridSnapEnabled: params.grid.snapEnabled,
          magnetEnabled: params.grid.magnetEnabled,
        }
      : DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS,
  });
}
