import { startWindowPointerSession } from '../../../../interaction/pointer-session';
import { resizeEditorRegion, type EditorRegionModel } from './model';
import {
  getPreviewTransformResizeCursor,
  type PreviewTransformResizeHandle,
} from '../transform/geometry';

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
    onEnd: () => finish(true),
    onCancel: () => finish(false),
  });
  return () => {
    cleanup();
    finish(false);
  };
}
