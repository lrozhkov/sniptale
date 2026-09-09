import { useEffect, useRef, useState } from 'react';
import {
  createMotionFocusAreaFromPointScale,
  resolveMotionOverlayZoomMode,
} from '../../../../../features/video/project/motion';
import {
  clampFocusAreaSize,
  normalizeMotionFocusArea,
} from '../../../../../features/video/project/motion/focus-area';
import {
  VideoMotionFocusMode,
  type VideoProject,
  type VideoProjectMotionRegion,
  type VideoProjectMotionArea,
} from '../../../../../features/video/project/types';
import { resolveCameraViewportFrame } from '../../../../../features/video/composition/motion/viewport';

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type AreaGesture = { area: VideoProjectMotionArea; start: Point; corner: Corner | null };
type Point = { x: number; y: number };

export interface FramingPreviewProps {
  project: VideoProject;
  region: VideoProjectMotionRegion;
  assetUrls: Record<string, string>;
  onCommit: (point: Point) => void;
  onCommitArea?: (area: VideoProjectMotionArea) => void;
}

export function useFramingInteraction(props: FramingPreviewProps) {
  const { project, region, assetUrls } = props;
  const gesture = useRef<{
    pointer: number | null;
    grabOffset: Point;
    world: { left: number; top: number; width: number; height: number } | null;
    area: AreaGesture | null;
  }>({ pointer: null, grabOffset: { x: 0, y: 0 }, world: null, area: null });
  const [areaDraft, setAreaDraft] = useState<VideoProjectMotionArea | null>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const { areaMode, area, focus, viewport, left, top, width, height } = resolveFramingView(
    project,
    region,
    draft,
    areaDraft
  );

  useEffect(() => {
    gesture.current.pointer = null;
    gesture.current.grabOffset = { x: 0, y: 0 };
    gesture.current.world = null;
    setDraft(null);
    gesture.current.area = null;
    setAreaDraft(null);
  }, [assetUrls, project, region.startTime, region.duration]);

  const clamp = (point: Point): Point => ({
    x: Math.min(project.width, Math.max(0, point.x)),
    y: Math.min(project.height, Math.max(0, point.y)),
  });
  const pointAt = (event: React.PointerEvent<HTMLButtonElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const world = gesture.current.world ?? { left, top, width, height };
    return clamp({
      x:
        world.left +
        ((event.clientX - bounds.left) / bounds.width) * world.width +
        gesture.current.grabOffset.x,
      y:
        world.top +
        ((event.clientY - bounds.top) / bounds.height) * world.height +
        gesture.current.grabOffset.y,
    });
  };
  const areaAt = (event: React.PointerEvent<HTMLButtonElement>) => {
    const activeArea = gesture.current.area;
    if (!activeArea) return area;
    const point = pointAt(event);
    return resizeFramingArea(project, activeArea, point);
  };
  const cancel = () => {
    gesture.current.pointer = null;
    gesture.current.world = null;
    setDraft(null);
    gesture.current.area = null;
    setAreaDraft(null);
  };

  return {
    areaMode,
    area,
    camera: {
      ...viewport,
      focusPoint: focus,
      scale: project.width / viewport.viewportWidth,
      regionId: region.id,
      motionBlurAmount: 0,
      overlayZoomMode: resolveMotionOverlayZoomMode(region.overlayZoomMode),
    },
    viewport,
    left,
    top,
    width,
    height,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || event.currentTarget.matches(':disabled')) return;
        event.preventDefault();
        event.currentTarget.focus();
        gesture.current.world = { left, top, width, height };
        gesture.current.grabOffset = { x: 0, y: 0 };
        const point = pointAt(event);
        if (area) {
          const initial = beginFramingAreaGesture(project, area, point, event.target);
          gesture.current.area = initial;
          gesture.current.pointer = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setAreaDraft(initial.area);
          return;
        }
        if (
          point.x >= viewport.viewportX &&
          point.x <= viewport.viewportX + viewport.viewportWidth &&
          point.y >= viewport.viewportY &&
          point.y <= viewport.viewportY + viewport.viewportHeight
        ) {
          gesture.current.grabOffset = { x: focus.x - point.x, y: focus.y - point.y };
        }
        gesture.current.pointer = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraft(pointAt(event));
      },
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (gesture.current.pointer !== event.pointerId) return;
        if (gesture.current.area) setAreaDraft(areaAt(event));
        else setDraft(pointAt(event));
      },
      onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (gesture.current.pointer !== event.pointerId) return;
        const point = pointAt(event);
        const nextArea = gesture.current.area ? areaAt(event) : null;
        cancel();
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (nextArea) props.onCommitArea?.(nextArea);
        else props.onCommit(point);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) =>
        nudgeFramingSelection(event, {
          project,
          area,
          focus,
          cancel,
          onCommit: props.onCommit,
          onCommitArea: props.onCommitArea,
        }),
    },
  };
}

function resizeFramingArea(project: VideoProject, gesture: AreaGesture, point: Point) {
  const dx = point.x - gesture.start.x;
  const dy = point.y - gesture.start.y;
  const initial = gesture.area;
  if (!gesture.corner)
    return normalizeMotionFocusArea(project, {
      ...initial,
      x: initial.x + dx,
      y: initial.y + dy,
    });
  const west = gesture.corner === 'nw' || gesture.corner === 'sw';
  const north = gesture.corner === 'nw' || gesture.corner === 'ne';
  const minWidth = clampFocusAreaSize(project.width, 0);
  const minHeight = clampFocusAreaSize(project.height, 0);
  const x = west
    ? Math.max(0, Math.min(initial.x + initial.width - minWidth, initial.x + dx))
    : initial.x;
  const y = north
    ? Math.max(0, Math.min(initial.y + initial.height - minHeight, initial.y + dy))
    : initial.y;
  const right = west
    ? initial.x + initial.width
    : Math.min(project.width, Math.max(initial.x + minWidth, initial.x + initial.width + dx));
  const bottom = north
    ? initial.y + initial.height
    : Math.min(project.height, Math.max(initial.y + minHeight, initial.y + initial.height + dy));
  return { x, y, width: right - x, height: bottom - y };
}

function beginFramingAreaGesture(
  project: VideoProject,
  area: VideoProjectMotionArea,
  point: Point,
  target: EventTarget
): AreaGesture {
  const cornerValue = target instanceof HTMLElement ? target.dataset['framingCorner'] : undefined;
  const corner =
    cornerValue === 'nw' || cornerValue === 'ne' || cornerValue === 'sw' || cornerValue === 'se'
      ? cornerValue
      : null;
  const inside =
    point.x >= area.x &&
    point.x <= area.x + area.width &&
    point.y >= area.y &&
    point.y <= area.y + area.height;
  const initial =
    inside || corner
      ? area
      : normalizeMotionFocusArea(project, {
          ...area,
          x: point.x - area.width / 2,
          y: point.y - area.height / 2,
        })!;
  return { area: initial, start: point, corner };
}

function nudgeFramingSelection(
  event: React.KeyboardEvent<HTMLButtonElement>,
  {
    project,
    area,
    focus,
    cancel,
    onCommit,
    onCommitArea,
  }: {
    project: VideoProject;
    area: VideoProjectMotionArea | null;
    focus: Point;
    cancel: () => void;
    onCommit: FramingPreviewProps['onCommit'];
    onCommitArea: FramingPreviewProps['onCommitArea'];
  }
) {
  const clamp = (point: Point) => ({
    x: Math.min(project.width, Math.max(0, point.x)),
    y: Math.min(project.height, Math.max(0, point.y)),
  });

  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  const direction = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (!direction || event.currentTarget.matches(':disabled')) return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 10 : 1;
  if (area) {
    onCommitArea?.(
      normalizeMotionFocusArea(project, {
        ...area,
        x: area.x + direction[0]! * step,
        y: area.y + direction[1]! * step,
      })!
    );
    return;
  }
  onCommit(clamp({ x: focus.x + direction[0]! * step, y: focus.y + direction[1]! * step }));
}

function resolveFramingView(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  draft: Point | null,
  areaDraft: VideoProjectMotionArea | null
) {
  const areaMode = region.focusMode === VideoMotionFocusMode.MANUAL_AREA;
  const area = areaMode
    ? (areaDraft ??
      region.focusArea ??
      createMotionFocusAreaFromPointScale(
        project,
        region.focusPoint ?? { x: project.width / 2, y: project.height / 2 },
        region.scale
      ))
    : null;
  const focus = area
    ? { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    : (draft ?? region.focusPoint ?? { x: project.width / 2, y: project.height / 2 });
  const scale = area
    ? Math.min(4, Math.max(1, Math.min(project.width / area.width, project.height / area.height)))
    : region.scale;
  const viewport = resolveCameraViewportFrame(project, focus, scale);
  const left = viewport.viewportX;
  const top = viewport.viewportY;
  const width = viewport.viewportWidth;
  const height = viewport.viewportHeight;

  return { areaMode, area, focus, viewport, left, top, width, height };
}
