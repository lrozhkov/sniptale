import { createCanvasFrameFromPoints } from './geometry';
import type { CanvasFrame, CanvasPoint } from './types';

export const CANVAS_TOOL_MIN_DRAW_SIZE = 8;

export interface CanvasToolPointerEventLike {
  clientX: number;
  clientY: number;
  pointerId: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface CanvasToolLifecycleSession<TKind extends string> {
  current: CanvasPoint;
  kind: TKind;
  origin: CanvasPoint;
  pointerId: number;
}

export interface CanvasToolLifecycleCommit<TKind extends string> {
  commitKind: 'click' | 'drag';
  current: CanvasPoint;
  frame: CanvasFrame;
  kind: TKind;
  origin: CanvasPoint;
}

export interface CanvasToolLifecycleRef<TKind extends string> {
  current: CanvasToolLifecycleSession<TKind> | null;
}

export type CanvasToolLifecycleFrameNormalizer = (frame: CanvasFrame) => CanvasFrame;
export type CanvasToolLifecycleDragCommitPredicate<TKind extends string> = (args: {
  frame: CanvasFrame;
  kind: TKind;
  minDragSize: number;
}) => boolean;

export function beginCanvasToolLifecycle<TKind extends string>(args: {
  activeKind: TKind | null | undefined;
  captureTarget?: { setPointerCapture?: (pointerId: number) => void } | null | undefined;
  event: CanvasToolPointerEventLike;
  mapPoint: (event: CanvasToolPointerEventLike) => CanvasPoint | null;
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  sessionRef: CanvasToolLifecycleRef<TKind>;
}): boolean {
  if (!args.activeKind) {
    return false;
  }

  const point = args.mapPoint(args.event);
  if (!point) {
    return false;
  }

  args.event.preventDefault();
  args.event.stopPropagation();
  args.captureTarget?.setPointerCapture?.(args.event.pointerId);
  args.sessionRef.current = {
    current: point,
    kind: args.activeKind,
    origin: point,
    pointerId: args.event.pointerId,
  };
  args.onPreviewFrameChange(null);
  return true;
}

export function updateCanvasToolLifecycle<TKind extends string>(args: {
  event: CanvasToolPointerEventLike;
  mapPoint: (event: CanvasToolPointerEventLike) => CanvasPoint | null;
  normalizeFrame?: CanvasToolLifecycleFrameNormalizer | undefined;
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  sessionRef: CanvasToolLifecycleRef<TKind>;
}): boolean {
  const session = args.sessionRef.current;
  if (!session || session.pointerId !== args.event.pointerId) {
    return false;
  }

  const point = args.mapPoint(args.event);
  if (!point) {
    return false;
  }

  session.current = point;
  const frame = createCanvasFrameFromPoints(session.origin, session.current);
  args.onPreviewFrameChange(args.normalizeFrame ? args.normalizeFrame(frame) : frame);
  return true;
}

export function finishCanvasToolLifecycle<TKind extends string>(args: {
  event: CanvasToolPointerEventLike;
  minDragSize?: number | undefined;
  onCommitClick: (kind: TKind, point: CanvasPoint) => void;
  onCommitDrag: (kind: TKind, origin: CanvasPoint, current: CanvasPoint) => void;
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  shouldCommitDrag?: CanvasToolLifecycleDragCommitPredicate<TKind> | undefined;
  sessionRef: CanvasToolLifecycleRef<TKind>;
}): boolean {
  const session = args.sessionRef.current;
  if (!session || session.pointerId !== args.event.pointerId) {
    return false;
  }

  args.sessionRef.current = null;
  args.onPreviewFrameChange(null);
  const commit = resolveCanvasToolLifecycleCommit({
    minDragSize: args.minDragSize,
    session,
    shouldCommitDrag: args.shouldCommitDrag,
  });
  if (commit.commitKind === 'drag') {
    args.onCommitDrag(commit.kind, commit.origin, commit.current);
  } else {
    args.onCommitClick(commit.kind, commit.origin);
  }
  return true;
}

export function resolveCanvasToolLifecycleCommit<TKind extends string>(args: {
  minDragSize?: number | undefined;
  session: CanvasToolLifecycleSession<TKind>;
  shouldCommitDrag?: CanvasToolLifecycleDragCommitPredicate<TKind> | undefined;
}): CanvasToolLifecycleCommit<TKind> {
  const frame = createCanvasFrameFromPoints(args.session.origin, args.session.current);
  const minDragSize = args.minDragSize ?? CANVAS_TOOL_MIN_DRAW_SIZE;
  const shouldCommitDrag =
    args.shouldCommitDrag?.({ frame, kind: args.session.kind, minDragSize }) ??
    isEitherAxisCanvasToolDrag({ frame, minDragSize });
  return {
    commitKind: shouldCommitDrag ? 'drag' : 'click',
    current: args.session.current,
    frame,
    kind: args.session.kind,
    origin: args.session.origin,
  };
}

export function isEitherAxisCanvasToolDrag(args: {
  frame: CanvasFrame;
  minDragSize?: number | undefined;
}): boolean {
  const minDragSize = args.minDragSize ?? CANVAS_TOOL_MIN_DRAW_SIZE;
  return args.frame.width >= minDragSize || args.frame.height >= minDragSize;
}

export function isBoxCanvasToolDrag(args: {
  frame: CanvasFrame;
  minDragSize?: number | undefined;
}): boolean {
  const minDragSize = args.minDragSize ?? CANVAS_TOOL_MIN_DRAW_SIZE;
  return args.frame.width >= minDragSize && args.frame.height >= minDragSize;
}

export function createCanvasToolDragPredicate<TKind extends string>(args: {
  connectorKinds?: ReadonlySet<TKind> | readonly TKind[] | undefined;
}): CanvasToolLifecycleDragCommitPredicate<TKind> {
  const connectorKinds = args.connectorKinds
    ? new Set(Array.isArray(args.connectorKinds) ? args.connectorKinds : [...args.connectorKinds])
    : new Set<TKind>();

  return ({ frame, kind, minDragSize }) =>
    connectorKinds.has(kind)
      ? isEitherAxisCanvasToolDrag({ frame, minDragSize })
      : isBoxCanvasToolDrag({ frame, minDragSize });
}

export function cancelCanvasToolLifecycle<TKind extends string>(args: {
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  sessionRef: CanvasToolLifecycleRef<TKind>;
}): void {
  args.sessionRef.current = null;
  args.onPreviewFrameChange(null);
}
