import {
  motionFocusAreaPoint,
  motionFocusAreaDelta,
  motionFocusAreaScale,
  resizeOrientedMotionArea,
} from '../../../../../features/video/project/motion/focus-area';
import {
  motionWindowFocusToComposition,
  motionWindowAreaPoints,
  resolveSourceWindowCamera,
  resolveMotionSourceWindow,
} from '../../../../../features/video/composition/motion/source-window';
import { evaluateMotionSpatial } from '../../../../../features/video/composition/motion/spatial';
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
import { resolveVideoCompositionCamera } from '../../../../../features/video/composition/motion';

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

export function useFramingInteraction(props: FramingPreviewProps, overview = true) {
  const { project, region, assetUrls } = props;
  const targetAvailable =
    region.sourceBinding?.coordinateSpace !== 'source-window' ||
    resolveMotionSourceWindow(project, region, region.startTime + region.duration / 2) !== null;
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
    areaDraft,
    overview,
    gesture.current.world
  );

  useEffect(() => {
    gesture.current.pointer = null;
    gesture.current.grabOffset = { x: 0, y: 0 };
    gesture.current.world = null;
    setDraft(null);
    gesture.current.area = null;
    setAreaDraft(null);
  }, [assetUrls, project, region.startTime, region.duration]);

  const clamp = (point: Point): Point =>
    area?.axes
      ? point
      : {
          x: Math.min(project.width, Math.max(0, point.x)),
          y: Math.min(project.height, Math.max(0, point.y)),
        };
  const pointAt = (event: React.PointerEvent<HTMLButtonElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const world = gesture.current.world ?? { left, top, width, height };
    const point = motionWindowFocusToComposition(
      project,
      region,
      {
        x: world.left + ((event.clientX - bounds.left) / bounds.width) * world.width,
        y: world.top + ((event.clientY - bounds.top) / bounds.height) * world.height,
      },
      region.startTime + region.duration / 2,
      true
    );
    return clamp({
      x: point.x + gesture.current.grabOffset.x,
      y: point.y + gesture.current.grabOffset.y,
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

  const spatial = overview ? undefined : evaluateMotionSpatial(project, null, region, 1);
  return {
    areaMode,
    areaPoints: area
      ? motionWindowAreaPoints(project, region, area, region.startTime + region.duration / 2)
      : null,
    camera: {
      ...(spatial ? { spatial } : {}),
      viewportX: left,
      viewportY: top,
      viewportWidth: width,
      viewportHeight: height,
      focusPoint: { x: left + width / 2, y: top + height / 2 },
      scale: project.width / width,
      regionId: region.id,
      motionBlurAmount: 0,
      overlayZoomMode: resolveMotionOverlayZoomMode(region.overlayZoomMode),
      ...(!overview && region.sourceBinding?.coordinateSpace === 'source-window' ? viewport : {}),
    },
    viewport,
    left,
    top,
    width,
    height,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (
          !targetAvailable ||
          !overview ||
          region.focusMode === VideoMotionFocusMode.CURSOR ||
          event.button !== 0 ||
          event.currentTarget.matches(':disabled')
        )
          return;
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
        const worldPoint = motionWindowFocusToComposition(
          project,
          region,
          point,
          region.startTime + region.duration / 2
        );
        if (
          worldPoint.x >= viewport.viewportX &&
          worldPoint.x <= viewport.viewportX + viewport.viewportWidth &&
          worldPoint.y >= viewport.viewportY &&
          worldPoint.y <= viewport.viewportY + viewport.viewportHeight
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
        targetAvailable &&
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
    return (
      normalizeMotionFocusArea(project, {
        ...initial,
        x: initial.x + dx,
        y: initial.y + dy,
      }) ?? initial
    );
  if (initial.axes) return resizeOrientedMotionArea(initial, gesture.corner, { x: dx, y: dy });
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
  const local = motionFocusAreaDelta(area, { x: point.x - area.x, y: point.y - area.y });
  const inside = local.x >= 0 && local.x <= area.width && local.y >= 0 && local.y <= area.height;
  const center = motionFocusAreaPoint(area, 0.5, 0.5);
  const initial =
    inside || corner
      ? area
      : normalizeMotionFocusArea(project, {
          ...area,
          x: point.x - (center.x - area.x),
          y: point.y - (center.y - area.y),
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
  areaDraft: VideoProjectMotionArea | null,
  overview: boolean,
  fixedWorld: { left: number; top: number; width: number; height: number } | null
) {
  if (region.focusMode === VideoMotionFocusMode.CURSOR) {
    const viewport = resolveVideoCompositionCamera({
      project,
      currentTime: Math.min(project.duration, region.startTime + region.duration / 2),
      actions: [],
      cursorSample: null,
    });
    const width = overview ? project.width : viewport.viewportWidth;
    const height = overview ? project.height : viewport.viewportHeight;
    return {
      areaMode: false,
      area: null,
      focus: viewport.focusPoint,
      viewport,
      left: overview ? 0 : viewport.viewportX,
      top: overview ? 0 : viewport.viewportY,
      width,
      height,
    };
  }
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
    ? motionFocusAreaPoint(area, 0.5, 0.5)
    : (draft ?? region.focusPoint ?? { x: project.width / 2, y: project.height / 2 });
  const scale = area ? motionFocusAreaScale(project, area) : region.scale;
  const viewport =
    resolveSourceWindowCamera(
      project,
      region,
      region.startTime + region.duration / 2,
      focus,
      scale,
      1
    ) ?? resolveCameraViewportFrame(project, focus, scale);
  const overviewScale = Math.min(1, region.scale);
  let width = overview ? project.width / overviewScale : viewport.viewportWidth;
  let height = overview ? project.height / overviewScale : viewport.viewportHeight;
  let left = overview ? (project.width - width) / 2 : viewport.viewportX;
  let top = overview ? (project.height - height) / 2 : viewport.viewportY;
  if (overview && area) {
    const points = Object.values(
      motionWindowAreaPoints(project, region, area, region.startTime + region.duration / 2)
    );
    const clearance = Math.max(project.width, project.height) * 0.06;
    const minX = Math.min(left, ...points.map((point) => point.x - clearance));
    const minY = Math.min(top, ...points.map((point) => point.y - clearance));
    const maxX = Math.max(left + width, ...points.map((point) => point.x + clearance));
    const maxY = Math.max(top + height, ...points.map((point) => point.y + clearance));
    width = Math.max(maxX - minX, ((maxY - minY) * project.width) / project.height);
    height = (width * project.height) / project.width;
    left = (minX + maxX - width) / 2;
    top = (minY + maxY - height) / 2;
  }
  if (overview && fixedWorld) ({ left, top, width, height } = fixedWorld);

  return { areaMode, area, focus, viewport, left, top, width, height };
}
