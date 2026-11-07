import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  resolveDrawingArrowBendTarget,
  type DrawingPoint,
  type DrawingSimplifySource,
  type DrawingSessionSnapshot,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { isTrustedKeyboardEvent } from '../platform/trusted-events';
import {
  beginDrawingPointer,
  commitDrawingPointerDraft,
  toDrawingScenePoint,
  getDrawingViewportProjection,
  type PointerDraft,
  type DrawingArrowHover,
} from './interaction';
import type { PageScrollRoot } from '../platform/page-scroll';
import type { DrawingTextDraft } from './text-editor';
import { updateDrawingMarqueeDraft, updateDrawingPointerDraft } from './pointer-update';
import type { DrawingAlignmentGuide } from './move-alignment';

export const TEXT_DRAG_THRESHOLD = 4;

function useDrawingDraftInterruption(
  draftRef: RefObject<PointerDraft | null>,
  alignMoves: boolean,
  cancelDraft: () => void,
  cancelPointer: (event: ReactPointerEvent<HTMLCanvasElement>) => void
) {
  const shouldCancel = useCallback(() => {
    const kind = draftRef.current?.kind;
    return (
      kind === 'bend' ||
      kind === 'marquee' ||
      (alignMoves && (kind === 'move' || kind === 'move-selection' || kind === 'resize'))
    );
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
  /** Enables disposable page alignment for page and crop drawing. */
  alignMoves?: boolean;
  controller: ContentDrawingController;
  root: PageScrollRoot;
  onCancelText: () => void;
  onText: (draft: DrawingTextDraft) => void;
};

function commitPointerDraft(
  controller: ContentDrawingController,
  draft: PointerDraft | null,
  event?: Event,
  prepared?: DrawingSimplifySource | Promise<DrawingSimplifySource>
): void {
  if (draft?.kind === 'marquee' && event instanceof MouseEvent) {
    const update = updateDrawingMarqueeDraft(
      draft,
      toDrawingScenePoint(event, controller.getScrollRoot()),
      controller.session.getSnapshot().document.objects
    );
    draft = update.draft;
    if (update.selection) controller.session.setSelection(update.selection);
  }
  if (
    (draft?.kind === 'move-selection' || draft?.kind === 'rotate-selection') &&
    draft.objects.some((object) => object.kind === 'simplify')
  ) {
    if (draft.objects.some((object, index) => object !== draft.originals[index]))
      void controller.simplify?.transform(draft.objects);
  } else if (draft && 'object' in draft && draft.object?.kind === 'simplify') {
    if (draft.kind === 'create') void controller.simplify?.submit(draft.object, event, prepared);
    else if ('original' in draft && draft.object !== draft.original)
      void controller.simplify?.transform([draft.object]);
  } else commitDrawingPointerDraft(controller.session, draft);
}

function useDrawingPointerCompletion(
  draftRef: RefObject<PointerDraft | null>,
  activePointerRef: RefObject<number | null>,
  touchPointsRef: RefObject<Map<number, DrawingPoint>>,
  touchCentroidRef: React.MutableRefObject<DrawingPoint | null>,
  finalizeDraft: (event?: Event) => void,
  cancelDraft: () => void
) {
  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (draftRef.current?.kind === 'bend' && event.pointerId !== activePointerRef.current) return;
      if (event.pointerType === 'touch') {
        touchPointsRef.current.delete(event.pointerId);
        if (touchPointsRef.current.size < 2) touchCentroidRef.current = null;
      }
      finalizeDraft(event.nativeEvent);
    },
    [activePointerRef, draftRef, finalizeDraft, touchCentroidRef, touchPointsRef]
  );

  const cancelPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (draftRef.current?.kind === 'bend' && event.pointerId !== activePointerRef.current) return;
      touchPointsRef.current.delete(event.pointerId);
      touchCentroidRef.current = null;
      cancelDraft();
    },
    [activePointerRef, cancelDraft, draftRef, touchCentroidRef, touchPointsRef]
  );

  return { finishPointer, cancelPointer };
}

type PointerSimplifyPreparation = {
  promise: Promise<DrawingSimplifySource>;
  source?: DrawingSimplifySource;
};

function preparePointerSimplify(
  controller: ContentDrawingController,
  root: PageScrollRoot,
  draft: PointerDraft | null,
  event: Event
): PointerSimplifyPreparation | null {
  if (
    draft?.kind !== 'create' ||
    draft.object.kind !== 'simplify' ||
    (!draft.object.settings.automatic && draft.object.settings.manualKind !== 'text') ||
    !controller.simplify
  )
    return null;
  const projection = getDrawingViewportProjection(root);
  const width = window.innerWidth,
    height = window.innerHeight;
  return {
    promise: controller.simplify.prepare(event, () => {
      const current = getDrawingViewportProjection(root);
      return (
        current.x === projection.x &&
        current.y === projection.y &&
        window.innerWidth === width &&
        window.innerHeight === height
      );
    }),
  };
}

function usePointerSimplifyDraft({
  active,
  controller,
  draftRef,
  changed,
}: Pick<DrawingPointerRuntimeOptions, 'active' | 'controller'> & {
  draftRef: RefObject<PointerDraft | null>;
  changed(): void;
}) {
  const visualDraftRef = useRef<PointerDraft | null>(null);
  const preparationRef = useRef<PointerSimplifyPreparation | null>(null);
  useEffect(() => () => controller.simplify?.cancelPreparation(), [controller]);
  useEffect(() => {
    if (!active) controller.simplify?.cancelPreparation();
  }, [active, controller]);
  return useMemo(
    () => ({
      visualDraftRef,
      begin(draft: PointerDraft | null, event: Event, root: PageScrollRoot) {
        const preparation = preparePointerSimplify(controller, root, draft, event);
        preparationRef.current = preparation;
        visualDraftRef.current = draft;
        if (!preparation) return;
        void preparation.promise.then(
          (source) => {
            if (preparationRef.current !== preparation) return;
            preparation.source = source;
            visualDraftRef.current = draftRef.current;
            changed();
          },
          () => undefined
        );
      },
      update(draft: PointerDraft | null) {
        visualDraftRef.current = draft;
      },
      getSource() {
        return preparationRef.current?.source ?? preparationRef.current?.promise;
      },
      clear() {
        visualDraftRef.current = null;
        preparationRef.current = null;
      },
    }),
    [changed, controller, draftRef]
  );
}

function useDrawingAlignmentModifiers(args: {
  enabled: boolean;
  draftRef: RefObject<PointerDraft | null>;
  activePointerRef: RefObject<number | null>;
  lastPointerEventRef: RefObject<ReactPointerEvent<HTMLCanvasElement> | null>;
  onPointerMove: (
    event: ReactPointerEvent<HTMLCanvasElement>,
    modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'shiftKey'>
  ) => void;
}) {
  const { enabled, draftRef, activePointerRef, lastPointerEventRef, onPointerMove } = args;
  useEffect(() => {
    const updateAlt = (event: KeyboardEvent) => {
      const kind = draftRef.current?.kind;
      if (
        !isTrustedKeyboardEvent(event) ||
        event.key !== 'Alt' ||
        !enabled ||
        activePointerRef.current === null ||
        (kind !== 'move' && kind !== 'move-selection' && kind !== 'resize')
      )
        return;
      event.preventDefault();
      const pointer = lastPointerEventRef.current;
      if (pointer) onPointerMove(pointer, event);
    };
    window.addEventListener('keydown', updateAlt, { capture: true });
    window.addEventListener('keyup', updateAlt, { capture: true });
    return () => {
      window.removeEventListener('keydown', updateAlt, { capture: true });
      window.removeEventListener('keyup', updateAlt, { capture: true });
    };
  }, [enabled, activePointerRef, draftRef, lastPointerEventRef, onPointerMove]);
}

export function useDrawingPointerRuntime(args: DrawingPointerRuntimeOptions) {
  const { active, controller, root, onCancelText, onText } = args;
  const draftRef = useRef<PointerDraft | null>(null);
  const alignmentGuidesRef = useRef<DrawingAlignmentGuide[]>([]);
  const hoverBendRef = useRef<DrawingArrowHover | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const lastPointerEventRef = useRef<ReactPointerEvent<HTMLCanvasElement> | null>(null);
  const touchPointsRef = useRef(new Map<number, DrawingPoint>());
  const touchCentroidRef = useRef<DrawingPoint | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const changed = useCallback(() => setDraftRevision((value) => value + 1), []);
  const simplifyDraft = usePointerSimplifyDraft({ active, controller, draftRef, changed });
  const cancelDraft = useCallback(() => {
    controller.simplify?.cancel();
    const draft = draftRef.current;
    if (draft?.kind === 'marquee') controller.session.setSelection(draft.initialSelectionIds);
    draftRef.current = null;
    simplifyDraft.clear();
    alignmentGuidesRef.current = [];
    hoverBendRef.current = null;
    activePointerRef.current = null;
    lastPointerEventRef.current = null;
    onCancelText();
    changed();
  }, [changed, controller, onCancelText, simplifyDraft]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active || event.button !== 0) return;
      controller.simplify?.cancelPreparation();
      const point = toDrawingScenePoint(event, root);
      if (beginTouchViewport(event, touchPointsRef, touchCentroidRef, cancelDraft)) return;
      const start = beginDrawingPointer({
        modifiers: { altKey: event.altKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
        point,
        snapshot: controller.session.getSnapshot(),
        timestamp: event.timeStamp,
      });
      draftRef.current = start.draft;
      simplifyDraft.begin(start.draft, event.nativeEvent, root);
      alignmentGuidesRef.current = [];
      activePointerRef.current = event.pointerId;
      lastPointerEventRef.current = event;
      hoverBendRef.current = null;
      if (start.selection) controller.session.setSelection(start.selection);
      if (start.text) onText(start.text);
      event.currentTarget.setPointerCapture(event.pointerId);
      changed();
    },
    [active, cancelDraft, changed, controller, onText, root, simplifyDraft]
  );

  const onPointerMove = useCallback(
    (
      event: ReactPointerEvent<HTMLCanvasElement>,
      modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'shiftKey'> = event
    ) => {
      lastPointerEventRef.current = event;
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
        modifiers,
        alignToPage: args.alignMoves ?? false,
      });
      alignmentGuidesRef.current = update.guides ?? [];
      draftRef.current = update.draft;
      simplifyDraft.update(update.draft);
      if (update.selection) controller.session.setSelection(update.selection);
      changed();
    },
    [active, args.alignMoves, changed, controller, root, simplifyDraft]
  );

  useDrawingAlignmentModifiers({
    enabled: args.alignMoves ?? false,
    draftRef,
    activePointerRef,
    lastPointerEventRef,
    onPointerMove,
  });

  const finalizeDraft = useCallback(
    (event?: Event) => {
      const draft = draftRef.current;
      commitPointerDraft(controller, draft, event, simplifyDraft.getSource());
      draftRef.current = null;
      simplifyDraft.clear();
      alignmentGuidesRef.current = [];
      hoverBendRef.current = null;
      activePointerRef.current = null;
      lastPointerEventRef.current = null;
      changed();
    },
    [changed, controller, simplifyDraft]
  );

  const { finishPointer, cancelPointer } = useDrawingPointerCompletion(
    draftRef,
    activePointerRef,
    touchPointsRef,
    touchCentroidRef,
    finalizeDraft,
    cancelDraft
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
    visualDraftRef: simplifyDraft.visualDraftRef,
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

function beginTouchViewport(
  event: ReactPointerEvent<HTMLCanvasElement>,
  touchPointsRef: RefObject<Map<number, DrawingPoint>>,
  touchCentroidRef: React.MutableRefObject<DrawingPoint | null>,
  cancelDraft: () => void
): boolean {
  if (event.pointerType !== 'touch') return false;
  touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPointsRef.current.size < 2) return false;
  touchCentroidRef.current = averagePoints([...touchPointsRef.current.values()]);
  cancelDraft();
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
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
