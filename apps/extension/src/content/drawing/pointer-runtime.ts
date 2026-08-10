import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingPoint } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import {
  beginDrawingPointer,
  commitDrawingPointerDraft,
  toDrawingScenePoint,
  type PointerDraft,
} from './interaction';
import type { PageScrollRoot } from '../platform/page-scroll';
import type { DrawingTextDraft } from './text-editor';
import { updateDrawingPointerDraft } from './pointer-update';

export const TEXT_DRAG_THRESHOLD = 4;

export function useDrawingPointerRuntime(args: {
  active: boolean;
  controller: ContentDrawingController;
  root: PageScrollRoot;
  onCancelText: () => void;
  onText: (draft: DrawingTextDraft) => void;
}) {
  const { active, controller, root, onCancelText, onText } = args;
  const draftRef = useRef<PointerDraft | null>(null);
  const touchPointsRef = useRef(new Map<number, DrawingPoint>());
  const touchCentroidRef = useRef<DrawingPoint | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const changed = useCallback(() => setDraftRevision((value) => value + 1), []);
  const cancelDraft = useCallback(() => {
    const draft = draftRef.current;
    if (draft?.kind === 'marquee') controller.session.setSelection(draft.initialSelectionIds);
    draftRef.current = null;
    onCancelText();
    changed();
  }, [changed, controller, onCancelText]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active || event.button !== 0) return;
      const point = toDrawingScenePoint(event, root);
      if (event.pointerType === 'touch') {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPointsRef.current.size >= 2) {
          const points = [...touchPointsRef.current.values()];
          touchCentroidRef.current = averagePoints(points);
          cancelDraft();
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
      const start = beginDrawingPointer({
        modifiers: { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
        point,
        snapshot: controller.session.getSnapshot(),
        timestamp: event.timeStamp,
      });
      draftRef.current = start.draft;
      if (start.selection) controller.session.setSelection(start.selection);
      if (start.text) onText(start.text);
      event.currentTarget.setPointerCapture(event.pointerId);
      changed();
    },
    [active, cancelDraft, changed, controller, onText, root]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (moveTouchViewport({ controller, event, touchCentroidRef, touchPointsRef })) return;
      const draft = draftRef.current;
      if (!draft) return;
      const point = toDrawingScenePoint(event, root);
      const isTextTransform =
        (draft.kind === 'move' || draft.kind === 'resize') && draft.original.kind === 'text';
      if (isTextTransform) {
        const distance = Math.hypot(point.x - draft.start.x, point.y - draft.start.y);
        if (distance < TEXT_DRAG_THRESHOLD) return;
      }
      const update = updateDrawingPointerDraft({
        documentObjects: controller.session.getSnapshot().document.objects,
        draft,
        event,
        point,
        root,
      });
      draftRef.current = update.draft;
      if (update.selection) controller.session.setSelection(update.selection);
      changed();
    },
    [changed, controller, root]
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'touch') {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) touchCentroidRef.current = null;
      }
      commitDrawingPointerDraft(controller.session, draftRef.current);
      draftRef.current = null;
      changed();
    },
    [changed, controller]
  );

  const finalizeDraft = useCallback(() => {
    commitDrawingPointerDraft(controller.session, draftRef.current);
    draftRef.current = null;
    changed();
  }, [changed, controller]);

  const cancelPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      touchPointsRef.current.delete(event.pointerId);
      touchCentroidRef.current = null;
      cancelDraft();
    },
    [cancelDraft]
  );

  return {
    cancelDraft,
    cancelPointer,
    changed,
    draftRef,
    draftRevision,
    finalizeDraft,
    finishPointer,
    onPointerDown,
    onPointerMove,
  };
}

function averagePoints(points: DrawingPoint[]): DrawingPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function moveTouchViewport(args: {
  controller: ContentDrawingController;
  event: ReactPointerEvent<HTMLCanvasElement>;
  touchCentroidRef: { current: DrawingPoint | null };
  touchPointsRef: { current: Map<number, DrawingPoint> };
}): boolean {
  const { controller, event, touchCentroidRef, touchPointsRef } = args;
  if (event.pointerType !== 'touch' || !touchPointsRef.current.has(event.pointerId)) return false;
  touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPointsRef.current.size < 2) return false;
  const centroid = averagePoints([...touchPointsRef.current.values()]);
  const previous = touchCentroidRef.current;
  if (previous) {
    const scrollRoot = controller.getScrollRoot();
    const delta = { x: previous.x - centroid.x, y: previous.y - centroid.y };
    if (scrollRoot.kind === 'element') {
      scrollRoot.element.scrollBy({ left: delta.x, top: delta.y, behavior: 'instant' });
    }
    if (scrollRoot.kind === 'document') {
      window.scrollBy({ left: delta.x, top: delta.y, behavior: 'instant' });
    }
  }
  touchCentroidRef.current = centroid;
  return true;
}
