import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  appendDrawingSamples,
  getDrawingSelectionBounds,
  transformDrawingObjectVector,
  resolveDrawingMarqueeSelection,
  translateDrawingObject,
  updateCreatedDrawingObject,
  updateDrawingArrowBend,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import type { PageScrollRoot } from '../platform/page-scroll';
import {
  resolveDrawingMoveAlignment,
  resolveDrawingResizeAlignment,
  getDrawingResizeHandleGeometry,
  type DrawingAlignmentGuide,
} from './move-alignment';
import { collectDrawingDomAlignmentBounds } from './move-alignment-dom';
import {
  resizeDrawingObject,
  rotateDrawingObject,
  rotateDrawingSelection,
  toDrawingScenePoint,
  type PointerDraft,
} from './interaction';

function updateCreateDraft(
  draft: Extract<PointerDraft, { kind: 'create' }>,
  event: ReactPointerEvent<HTMLCanvasElement>,
  root: PageScrollRoot
): Extract<PointerDraft, { kind: 'create' }> {
  const modifiers = { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey };
  const coalesced =
    typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : [];
  const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent];
  let object = draft.object;
  if (
    (object.kind === 'pencil' || object.kind === 'marker') &&
    !modifiers.ctrlKey &&
    !modifiers.shiftKey
  ) {
    object = {
      ...object,
      samples: appendDrawingSamples(
        object.samples,
        samples.map((sample) => ({ ...toDrawingScenePoint(sample, root), t: sample.timeStamp })),
        object.kind === 'pencil'
      ),
    };
  } else {
    object = updateCreatedDrawingObject({
      arrowFreeAngle: object.kind === 'arrow',
      arrowFromTip: draft.arrowFromTip,
      modifiers,
      object,
      start: draft.start,
      point: toDrawingScenePoint(event, root),
      timestamp: event.timeStamp,
    });
  }
  return { ...draft, object };
}

function getDrawingMoveDelta(
  start: DrawingPoint,
  point: DrawingPoint,
  shiftKey: boolean
): DrawingPoint {
  const delta = { x: point.x - start.x, y: point.y - start.y };
  if (!shiftKey) return delta;
  return Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y };
}

export function updateDrawingMarqueeDraft(
  draft: Extract<PointerDraft, { kind: 'marquee' }>,
  point: DrawingPoint,
  documentObjects: readonly DrawingObject[],
  shiftKey = false
): { draft: PointerDraft; selection?: readonly string[] } {
  if (draft.clickObjectId && Math.hypot(point.x - draft.start.x, point.y - draft.start.y) < 4) {
    return { draft };
  }
  if (draft.moveObjects) {
    const delta = getDrawingMoveDelta(draft.start, point, shiftKey);
    const [original] = draft.moveObjects;
    if (original) {
      return {
        draft:
          draft.moveObjects.length > 1
            ? {
                kind: 'move-selection',
                start: draft.start,
                originals: draft.moveObjects,
                objects: draft.moveObjects.map((object) => translateDrawingObject(object, delta)),
              }
            : {
                kind: 'move',
                start: draft.start,
                original,
                object: translateDrawingObject(original, delta),
              },
      };
    }
  }
  const marquee = { ...draft, current: point };
  delete marquee.clickObjectId;
  return {
    draft: marquee,
    selection: resolveDrawingMarqueeSelection({
      current: point,
      initialIds: draft.initialSelectionIds,
      mode: draft.mode,
      objects: documentObjects,
      start: draft.start,
    }),
  };
}

type DrawingPointerUpdateInput = {
  documentObjects: readonly DrawingObject[];
  draft: PointerDraft;
  event: ReactPointerEvent<HTMLCanvasElement>;
  point: DrawingPoint;
  root: PageScrollRoot;
  modifiers?: { altKey?: boolean; ctrlKey: boolean; shiftKey: boolean };
  alignToPage?: boolean;
};

function updateRawDrawingPointerDraft(args: DrawingPointerUpdateInput): {
  draft: PointerDraft;
  selection?: readonly string[];
} {
  const { draft, event, point } = args;
  const modifiers = args.modifiers ?? { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey };
  if (draft.kind === 'bend') {
    const moved = Math.hypot(point.x - draft.start.x, point.y - draft.start.y) >= 4;
    return {
      draft: {
        ...draft,
        object: moved
          ? updateDrawingArrowBend(draft.original, draft.target, {
              x: draft.target.point.x + point.x - draft.start.x,
              y: draft.target.point.y + point.y - draft.start.y,
            })
          : draft.original,
      },
    };
  }
  if (draft.kind === 'rotate-selection') {
    return {
      draft: rotateDrawingSelection(draft, point, modifiers),
    };
  }
  if (draft.kind === 'create') return { draft: updateCreateDraft(draft, event, args.root) };
  if (draft.kind === 'move') {
    return {
      draft: {
        ...draft,
        object: translateDrawingObject(
          draft.original,
          getDrawingMoveDelta(draft.start, point, modifiers.shiftKey)
        ),
      },
    };
  }
  if (draft.kind === 'move-selection') {
    const delta = getDrawingMoveDelta(draft.start, point, modifiers.shiftKey);
    return {
      draft: {
        ...draft,
        objects: draft.originals.map((object) => translateDrawingObject(object, delta)),
      },
    };
  }
  if (draft.kind === 'marquee')
    return updateDrawingMarqueeDraft(draft, point, args.documentObjects, modifiers.shiftKey);
  return {
    draft:
      draft.kind === 'resize'
        ? { ...draft, object: resizeDrawingObject(draft, point, modifiers) }
        : { ...draft, object: rotateDrawingObject(draft, point, modifiers) },
  };
}

function alignTransformedDraft(
  draft: PointerDraft,
  objects: readonly DrawingObject[],
  root: PageScrollRoot,
  point: DrawingPoint,
  modifiers: { ctrlKey: boolean; shiftKey: boolean }
): { draft: PointerDraft; guides: DrawingAlignmentGuide[] } {
  if (draft.kind === 'resize') {
    const bounds = getDrawingSelectionBounds([draft.object]);
    if (!bounds) return { draft, guides: [] };
    const geometry = getDrawingResizeHandleGeometry(draft, point, modifiers.ctrlKey);
    const horizontal = transformDrawingObjectVector(draft.original, {
      x: geometry.x ? 1 : 0,
      y: 0,
    });
    const vertical = transformDrawingObjectVector(draft.original, { x: 0, y: geometry.y ? 1 : 0 });
    const probe = {
      ...(Math.abs(horizontal.x) > 1e-6 || Math.abs(vertical.x) > 1e-6
        ? { x: geometry.current.x }
        : {}),
      ...(Math.abs(horizontal.y) > 1e-6 || Math.abs(vertical.y) > 1e-6
        ? { y: geometry.current.y }
        : {}),
    };
    const alignment = resolveDrawingResizeAlignment({
      draft,
      point,
      modifiers,
      objects,
      domBounds: collectDrawingDomAlignmentBounds(bounds, root, probe),
    });
    return { draft: { ...draft, object: alignment.object }, guides: alignment.guides };
  }
  const moving =
    draft.kind === 'move' ? [draft.object] : draft.kind === 'move-selection' ? draft.objects : [];
  const bounds = getDrawingSelectionBounds(moving);
  if (!bounds) return { draft, guides: [] };
  const axis = modifiers.shiftKey
    ? Math.abs(point.x - draft.start.x) >= Math.abs(point.y - draft.start.y)
      ? 'x'
      : 'y'
    : undefined;
  const { delta, guides } = resolveDrawingMoveAlignment({
    moving,
    ...(axis ? { axis } : {}),
    objects,
    domBounds: collectDrawingDomAlignmentBounds(bounds, root),
  });
  if (draft.kind === 'move')
    return {
      draft: { ...draft, object: translateDrawingObject(draft.object, delta) },
      guides,
    };
  if (draft.kind === 'move-selection')
    return {
      draft: {
        ...draft,
        objects: draft.objects.map((object) => translateDrawingObject(object, delta)),
      },
      guides,
    };
  return { draft, guides: [] };
}

export function updateDrawingPointerDraft(args: DrawingPointerUpdateInput): {
  draft: PointerDraft;
  selection?: readonly string[];
  guides?: DrawingAlignmentGuide[];
} {
  const update = updateRawDrawingPointerDraft(args);
  const modifiers = args.modifiers ?? args.event;
  if (
    !args.alignToPage ||
    modifiers.altKey ||
    Math.hypot(args.point.x - args.draft.start.x, args.point.y - args.draft.start.y) < 4
  )
    return update;
  const aligned = alignTransformedDraft(
    update.draft,
    args.documentObjects,
    args.root,
    args.point,
    modifiers
  );
  return { ...update, draft: aligned.draft, guides: aligned.guides };
}
