import {
  CANVAS_TOOL_MIN_DRAW_SIZE,
  clampCanvasFrameToBounds,
  createBoundedCanvasDragFrame,
  createCanvasFrameAtPoint,
  createCanvasFrameFromPoints,
  type CanvasFrame,
  type CanvasPoint,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { VideoProjectClip } from '../../../../features/video/project/types/index';
import type { PreviewStageCanvasProps, VideoPreviewCanvasInsertKind } from '../types';

const CONNECTOR_INSERT_THICKNESS = 3;

function getPreviewInsertedClipSize(
  kind: VideoPreviewCanvasInsertKind,
  project: PreviewStageCanvasProps['project']
) {
  if (isVideoPreviewConnectorInsertKind(kind)) {
    return {
      height: CONNECTOR_INSERT_THICKNESS,
      width: Math.round(project.width * 0.28),
    };
  }

  if (kind === 'shape') {
    return {
      height: Math.round(project.height * 0.22),
      width: Math.round(project.width * 0.28),
    };
  }

  return {
    height: Math.round(project.height * 0.2),
    width: Math.round(project.width * 0.48),
  };
}

export function createVideoPreviewClickInsertTransform(args: {
  kind: VideoPreviewCanvasInsertKind;
  point: CanvasPoint;
  project: PreviewStageCanvasProps['project'];
}): Partial<VideoProjectClip['transform']> {
  if (isVideoPreviewConnectorInsertKind(args.kind)) {
    const size = getPreviewInsertedClipSize(args.kind, args.project);
    const start = clampPointToProject(args.point, args.project);
    const end = clampPointToProject({ x: start.x + size.width, y: start.y }, args.project);
    return createConnectorInsertTransform({ current: end, origin: start });
  }

  return createCanvasFrameAtPoint({
    anchor: 'center',
    bounds: getProjectBounds(args.project),
    point: args.point,
    round: true,
    size: getPreviewInsertedClipSize(args.kind, args.project),
  });
}

export function createVideoPreviewDragInsertTransform(args: {
  current: CanvasPoint;
  kind: VideoPreviewCanvasInsertKind;
  origin: CanvasPoint;
  project: PreviewStageCanvasProps['project'];
}): Partial<VideoProjectClip['transform']> {
  if (isVideoPreviewConnectorInsertKind(args.kind)) {
    return createConnectorInsertTransform({
      current: clampPointToProject(args.current, args.project),
      origin: clampPointToProject(args.origin, args.project),
    });
  }

  const frame = createCanvasFrameFromPoints(args.origin, args.current);
  if (frame.width < CANVAS_TOOL_MIN_DRAW_SIZE && frame.height < CANVAS_TOOL_MIN_DRAW_SIZE) {
    return createVideoPreviewClickInsertTransform({
      kind: args.kind,
      point: args.origin,
      project: args.project,
    });
  }

  return createBoundedCanvasDragFrame({
    bounds: getProjectBounds(args.project),
    fallbackSize: getPreviewInsertedClipSize(args.kind, args.project),
    frame,
    minSize: CANVAS_TOOL_MIN_DRAW_SIZE,
    origin: args.origin,
    round: true,
  });
}

export function normalizeVideoPreviewInsertFrame(args: {
  frame: CanvasFrame;
  kind: VideoPreviewCanvasInsertKind | null;
  project: PreviewStageCanvasProps['project'];
}): CanvasFrame {
  const frame = clampCanvasFrameToBounds({
    bounds: getProjectBounds(args.project),
    frame: args.frame,
    round: true,
  });
  if (!args.kind || !isVideoPreviewConnectorInsertKind(args.kind)) {
    return frame;
  }

  return {
    ...frame,
    height: Math.max(2, frame.height),
    width: Math.max(2, frame.width),
    x: frame.width < 2 ? frame.x - 1 : frame.x,
    y: frame.height < 2 ? frame.y - 1 : frame.y,
  };
}

function isVideoPreviewConnectorInsertKind(kind: VideoPreviewCanvasInsertKind) {
  return kind === 'line' || kind === 'arrow';
}

function createConnectorInsertTransform(args: {
  current: CanvasPoint;
  origin: CanvasPoint;
}): Partial<VideoProjectClip['transform']> {
  const dx = args.current.x - args.origin.x;
  const dy = args.current.y - args.origin.y;
  const length = Math.max(CANVAS_TOOL_MIN_DRAW_SIZE, Math.hypot(dx, dy));
  const center = {
    x: (args.origin.x + args.current.x) / 2,
    y: (args.origin.y + args.current.y) / 2,
  };

  return {
    height: CONNECTOR_INSERT_THICKNESS,
    rotation: Math.round((Math.atan2(dy, dx) * 180) / Math.PI),
    width: Math.round(length),
    x: Math.round(center.x - length / 2),
    y: Math.round(center.y - CONNECTOR_INSERT_THICKNESS / 2),
  };
}

function getProjectBounds(project: PreviewStageCanvasProps['project']) {
  return {
    height: project.height,
    width: project.width,
  };
}

function clampPointToProject(
  point: CanvasPoint,
  project: PreviewStageCanvasProps['project']
): CanvasPoint {
  return {
    x: Math.min(project.width, Math.max(0, point.x)),
    y: Math.min(project.height, Math.max(0, point.y)),
  };
}
