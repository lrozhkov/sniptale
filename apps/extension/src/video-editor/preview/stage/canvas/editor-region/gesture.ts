import { startWindowPointerSession } from '../../../../interaction/pointer-session';
import { resizeEditorRegion, type EditorRegionModel } from './model';
import {
  getPreviewTransformResizeCursor,
  type PreviewTransformResizeHandle,
} from '../transform/geometry';

/** Decode canvas arrow gestures; callers retain event and commit ownership. */
export function canvasArrowDelta(event: { key: string; shiftKey: boolean }) {
  const direction = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (!direction) return null;
  const step = event.shiftKey ? 10 : 1;
  return { x: direction[0]! * step, y: direction[1]! * step };
}

export function beginEditorRegionGesture(args: {
  model: EditorRegionModel;
  mode: 'move' | PreviewTransformResizeHandle;
  origin: { x: number; y: number };
  pointerId: number;
  mapPoint(event: PointerEvent): { x: number; y: number } | null;
  preview(controls: Record<string, number> | null): void;
  commit(controls: Record<string, number>): void;
}) {
  let point = args.origin;
  let changed = false;
  let frame: number | null = null;
  let finished = false;
  const patch = () =>
    resizeEditorRegion(args.model, args.mode, point.x - args.origin.x, point.y - args.origin.y);
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    if (frame !== null) cancelAnimationFrame(frame);
    try {
      if (changed && commit) args.commit(patch());
    } finally {
      args.preview(null);
    }
  };
  const cleanup = startWindowPointerSession({
    cursor:
      args.mode === 'move'
        ? 'grabbing'
        : getPreviewTransformResizeCursor(args.mode, args.model.placement.rotation),
    onMove(event) {
      if (event.pointerId !== args.pointerId) return;
      const next = args.mapPoint(event);
      if (!next) return;
      point = next;
      changed = Math.abs(point.x - args.origin.x) + Math.abs(point.y - args.origin.y) > 0.01;
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          if (!finished) args.preview(patch());
        });
    },
    onEnd(event) {
      const next = event?.pointerId === args.pointerId ? args.mapPoint(event) : null;
      if (!next) {
        finish(false);
        return;
      }
      point = next;
      changed = Math.abs(point.x - args.origin.x) + Math.abs(point.y - args.origin.y) > 0.01;
      finish(true);
    },
    onCancel: () => finish(false),
  });
  return () => {
    cleanup();
    finish(false);
  };
}
