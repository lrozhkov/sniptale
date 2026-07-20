import type { CanvasClientPoint, CanvasFrame, CanvasPoint, CanvasResizeHandle } from './types';

export function resolveCanvasPointerDelta(args: {
  origin: CanvasClientPoint;
  scale: number;
  target: CanvasClientPoint;
}): CanvasPoint {
  const scale = args.scale || 1;
  return {
    x: (args.target.clientX - args.origin.clientX) / scale,
    y: (args.target.clientY - args.origin.clientY) / scale,
  };
}

export function translateCanvasFrame(frame: CanvasFrame, delta: CanvasPoint): CanvasFrame {
  return {
    ...frame,
    x: frame.x + delta.x,
    y: frame.y + delta.y,
  };
}

export function translateCanvasPoint(point: CanvasPoint, delta: CanvasPoint): CanvasPoint {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  };
}

export function resizeCanvasFrameFromHandle(args: {
  delta: CanvasPoint;
  frame: CanvasFrame;
  handle: CanvasResizeHandle;
  minSize: number;
}): CanvasFrame {
  const growsRight = args.handle.includes('e');
  const growsDown = args.handle.includes('s');
  const width = clampCanvasSize(
    args.frame.width + (growsRight ? args.delta.x : -args.delta.x),
    args.minSize
  );
  const height = clampCanvasSize(
    args.frame.height + (growsDown ? args.delta.y : -args.delta.y),
    args.minSize
  );

  return {
    height,
    width,
    x: growsRight ? args.frame.x : args.frame.x + args.frame.width - width,
    y: growsDown ? args.frame.y : args.frame.y + args.frame.height - height,
  };
}

export function createCanvasFrameFromPoints(first: CanvasPoint, second: CanvasPoint): CanvasFrame {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);

  return {
    height: Math.abs(second.y - first.y),
    width: Math.abs(second.x - first.x),
    x,
    y,
  };
}

export function createProportionalCanvasFrameFromPoints(args: {
  aspectRatio: number;
  first: CanvasPoint;
  second: CanvasPoint;
}): CanvasFrame {
  const ratio = Number.isFinite(args.aspectRatio) && args.aspectRatio > 0 ? args.aspectRatio : 1;
  const deltaX = args.second.x - args.first.x;
  const deltaY = args.second.y - args.first.y;
  const scale = Math.max(Math.abs(deltaX), Math.abs(deltaY) * ratio);
  const width = scale;
  const height = scale / ratio;
  const endX = args.first.x + width * (deltaX < 0 ? -1 : 1);
  const endY = args.first.y + height * (deltaY < 0 ? -1 : 1);

  return {
    height,
    width,
    x: Math.min(args.first.x, endX),
    y: Math.min(args.first.y, endY),
  };
}

export function createCenteredCanvasFrame(args: {
  bounds?: { height: number; width: number } | undefined;
  point: CanvasPoint;
  size: { height: number; width: number };
}): CanvasFrame {
  const maxX = args.bounds ? Math.max(0, args.bounds.width - args.size.width) : Infinity;
  const maxY = args.bounds ? Math.max(0, args.bounds.height - args.size.height) : Infinity;

  return {
    height: args.size.height,
    width: args.size.width,
    x: clampNumber(args.point.x - args.size.width / 2, 0, maxX),
    y: clampNumber(args.point.y - args.size.height / 2, 0, maxY),
  };
}

export function createCanvasFrameAtPoint(args: {
  anchor?: 'center' | 'top-left' | undefined;
  bounds: { height: number; width: number };
  point: CanvasPoint;
  round?: boolean | undefined;
  size: { height: number; width: number };
}): CanvasFrame {
  const anchor = args.anchor ?? 'top-left';
  const frame =
    anchor === 'center'
      ? createCenteredCanvasFrame({ bounds: args.bounds, point: args.point, size: args.size })
      : { height: args.size.height, width: args.size.width, x: args.point.x, y: args.point.y };

  return clampCanvasFrameToBounds({ bounds: args.bounds, frame, round: args.round });
}

export function createBoundedCanvasDragFrame(args: {
  bounds: { height: number; width: number };
  fallbackSize: { height: number; width: number };
  frame: CanvasFrame;
  minSize: number;
  origin: CanvasPoint;
  round?: boolean | undefined;
}): CanvasFrame {
  const frame =
    args.frame.width < args.minSize || args.frame.height < args.minSize
      ? createCenteredCanvasFrame({
          bounds: args.bounds,
          point: args.origin,
          size: args.fallbackSize,
        })
      : args.frame;

  return clampCanvasFrameToBounds({
    bounds: args.bounds,
    frame,
    minSize: args.minSize,
    round: args.round,
  });
}

export function clampCanvasFrameToBounds(args: {
  bounds: { height: number; width: number };
  frame: CanvasFrame;
  minSize?: number | undefined;
  round?: boolean | undefined;
}): CanvasFrame {
  const normalize = args.round ? Math.round : (value: number) => value;
  const minSize = args.minSize ?? 0;
  const width = clampNumber(normalize(args.frame.width), minSize, args.bounds.width);
  const height = clampNumber(normalize(args.frame.height), minSize, args.bounds.height);

  return {
    height,
    width,
    x: clampNumber(normalize(args.frame.x), 0, Math.max(0, args.bounds.width - width)),
    y: clampNumber(normalize(args.frame.y), 0, Math.max(0, args.bounds.height - height)),
  };
}

export function doesCanvasFrameIntersect(first: CanvasFrame, second: CanvasFrame): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

export function getCanvasPointFromClient(args: {
  clientX: number;
  clientY: number;
  scale: number;
  stageRect: Pick<DOMRect, 'left' | 'top'>;
}): CanvasPoint {
  const scale = args.scale || 1;
  return {
    x: (args.clientX - args.stageRect.left) / scale,
    y: (args.clientY - args.stageRect.top) / scale,
  };
}

function clampCanvasSize(value: number, minSize: number): number {
  return Math.max(minSize, value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
