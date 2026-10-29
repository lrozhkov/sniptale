import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  resolveDrawingArrowBendTarget,
  getDrawingSelectionBounds,
  translateDrawingObject,
  type DrawingPoint,
  type DrawingObject,
  type DrawingSessionSnapshot,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import {
  beginDrawingPointer,
  commitDrawingPointerDraft,
  toDrawingScenePoint,
  type PointerDraft,
  type DrawingArrowHover,
} from './interaction';
import type { PageScrollRoot } from '../platform/page-scroll';
import type { DrawingTextDraft } from './text-editor';
import { updateDrawingPointerDraft } from './pointer-update';
import {
  isDrawingAlignmentObject,
  resolveDrawingMoveAlignment,
  type DrawingAlignmentGuide,
} from './move-alignment';
import { collectDrawingDomAlignmentBounds } from './move-alignment-dom';

export const TEXT_DRAG_THRESHOLD = 4;

function alignMovedDraft(
  draft: PointerDraft,
  objects: readonly DrawingObject[],
  root: PageScrollRoot
): { draft: PointerDraft; guides: DrawingAlignmentGuide[] } {
  const moving =
    draft.kind === 'move' ? [draft.object] : draft.kind === 'move-selection' ? draft.objects : [];
  const bounds = getDrawingSelectionBounds(moving);
  if (!bounds || !moving.every(isDrawingAlignmentObject)) return { draft, guides: [] };
  const alignment = resolveDrawingMoveAlignment({
    moving,
    objects,
    domBounds: collectDrawingDomAlignmentBounds(bounds, root),
  });
  if (draft.kind === 'move')
    return {
      draft: { ...draft, object: translateDrawingObject(draft.object, alignment.delta) },
      guides: alignment.guides,
    };
  if (draft.kind === 'move-selection')
    return {
      draft: {
        ...draft,
        objects: draft.objects.map((object) => translateDrawingObject(object, alignment.delta)),
      },
      guides: alignment.guides,
    };
  return { draft, guides: [] };
}

function useDrawingDraftInterruption(
  draftRef: RefObject<PointerDraft | null>,
  alignMoves: boolean,
  cancelDraft: () => void,
  cancelPointer: (event: ReactPointerEvent<HTMLCanvasElement>) => void
) {
  const shouldCancel = useCallback(() => {
    const kind = draftRef.current?.kind;
    return kind === 'bend' || (alignMoves && (kind === 'move' || kind === 'move-selection'));
  }, [alignMoves, draftRef]);
  useEffect(() => {
    const cancelOnBlur = () => {
      if (shouldCancel()) cancelDraft();
    };
    window.addEventListener('blur', cancelOnBlur);
    return () => window.removeEventListener('blur', cancelOnBlur);
  }, [cancelDraft, shouldCancel]);
  return useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (shouldCancel()) cancelPointer(event);
    },
    [cancelPointer, shouldCancel]
  );
}

type DrawingPointerRuntimeOptions = {
  active: boolean;
  /** Enables disposable page alignment; crop and recording retain their current gestures. */
  alignMoves?: boolean;
  controller: ContentDrawingController;
  root: PageScrollRoot;
  onCancelText: () => void;
  onText: (draft: DrawingTextDraft) => void;
};

export function useDrawingPointerRuntime(args: DrawingPointerRuntimeOptions) {
  const { active, controller, root, onCancelText, onText } = args;
  const draftRef = useRef<PointerDraft | null>(null);
  const alignmentGuidesRef = useRef<DrawingAlignmentGuide[]>([]);
  const hoverBendRef = useRef<DrawingArrowHover | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const touchPointsRef = useRef(new Map<number, DrawingPoint>());
  const touchCentroidRef = useRef<DrawingPoint | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const changed = useCallback(() => setDraftRevision((value) => value + 1), []);
  const cancelDraft = useCallback(() => {
    const draft = draftRef.current;
    if (draft?.kind === 'marquee') controller.session.setSelection(draft.initialSelectionIds);
    draftRef.current = null;
    alignmentGuidesRef.current = [];
    hoverBendRef.current = null;
    activePointerRef.current = null;
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
        modifiers: { altKey: event.altKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
        point,
        snapshot: controller.session.getSnapshot(),
        timestamp: event.timeStamp,
      });
      draftRef.current = start.draft;
      alignmentGuidesRef.current = [];
      activePointerRef.current = event.pointerId;
      hoverBendRef.current = null;
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
      const point = toDrawingScenePoint(event, root);
      if (!draft) {
        const previous = hoverBendRef.current;
        hoverBendRef.current = active
          ? resolveArrowHover(controller.session.getSnapshot(), point, event)
          : null;
        if (hoverBendRef.current || previous) changed();
        return;
      }
      if (draft.kind === 'bend' && event.pointerId !== activePointerRef.current) return;
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
      alignmentGuidesRef.current = [];
      if (args.alignMoves && Math.hypot(point.x - draft.start.x, point.y - draft.start.y) >= 4) {
        const aligned = alignMovedDraft(
          update.draft,
          controller.session.getSnapshot().document.objects,
          root
        );
        update.draft = aligned.draft;
        alignmentGuidesRef.current = aligned.guides;
      }
      draftRef.current = update.draft;
      if (update.selection) controller.session.setSelection(update.selection);
      changed();
    },
    [active, args.alignMoves, changed, controller, root]
  );

  const finalizeDraft = useCallback(() => {
    commitDrawingPointerDraft(controller.session, draftRef.current);
    draftRef.current = null;
    alignmentGuidesRef.current = [];
    hoverBendRef.current = null;
    activePointerRef.current = null;
    changed();
  }, [changed, controller]);

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (draftRef.current?.kind === 'bend' && event.pointerId !== activePointerRef.current) return;
      if (event.pointerType === 'touch') {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) touchCentroidRef.current = null;
      }
      finalizeDraft();
    },
    [finalizeDraft]
  );

  const cancelPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (draftRef.current?.kind === 'bend' && event.pointerId !== activePointerRef.current) return;
      touchPointsRef.current.delete(event.pointerId);
      touchCentroidRef.current = null;
      cancelDraft();
    },
    [cancelDraft]
  );

  const cancelLostPointer = useDrawingDraftInterruption(
    draftRef,
    args.alignMoves ?? false,
    cancelDraft,
    cancelPointer
  );

  return {
    alignmentGuidesRef,
    cancelLostPointer,
    cancelDraft,
    cancelPointer,
    changed,
    draftRef,
    hoverBendRef,
    draftRevision,
    finalizeDraft,
    finishPointer,
    onPointerDown,
    onPointerMove,
  };
}

function resolveArrowHover(
  snapshot: DrawingSessionSnapshot,
  point: DrawingPoint,
  modifiers: { altKey: boolean; ctrlKey: boolean; shiftKey: boolean }
): DrawingArrowHover | null {
  if (
    snapshot.selectedObjectIds.length !== 1 ||
    modifiers.altKey ||
    modifiers.ctrlKey ||
    modifiers.shiftKey
  )
    return null;
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectIds[0]
  );
  if (selected?.kind !== 'arrow') return null;
  const target = resolveDrawingArrowBendTarget(selected, point);
  return target ? { object: selected, target } : null;
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
