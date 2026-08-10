import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  appendDrawingSamples,
  resolveDrawingMarqueeSelection,
  translateDrawingObject,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import type { PageScrollRoot } from '../platform/page-scroll';
import {
  resizeDrawingObject,
  rotateDrawingObject,
  toDrawingScenePoint,
  updateCreatedDrawingObject,
  type PointerDraft,
} from './interaction';

function updateCreateDraft(
  draft: Extract<PointerDraft, { kind: 'create' }>,
  event: ReactPointerEvent<HTMLCanvasElement>,
  root: PageScrollRoot
): Extract<PointerDraft, { kind: 'create' }> {
  const modifiers = { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey };
  const samples =
    typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];
  let object = draft.object;
  if (
    (object.kind === 'pencil' || object.kind === 'marker') &&
    (modifiers.ctrlKey || modifiers.shiftKey)
  ) {
    const sample = samples.at(-1) ?? event.nativeEvent;
    object = updateCreatedDrawingObject({
      modifiers,
      object,
      start: draft.start,
      point: toDrawingScenePoint(sample, root),
      timestamp: sample.timeStamp,
    });
  } else if (object.kind === 'pencil' || object.kind === 'marker') {
    object = {
      ...object,
      samples: appendDrawingSamples(
        object.samples,
        samples.map((sample) => ({
          ...toDrawingScenePoint(sample, root),
          t: sample.timeStamp,
        })),
        object.kind === 'pencil'
      ),
    };
  } else {
    samples.forEach((sample) => {
      object = updateCreatedDrawingObject({
        modifiers,
        object,
        start: draft.start,
        point: toDrawingScenePoint(sample, root),
        timestamp: sample.timeStamp,
      });
    });
  }
  return { ...draft, object };
}

export function updateDrawingPointerDraft(args: {
  documentObjects: readonly DrawingObject[];
  draft: PointerDraft;
  event: ReactPointerEvent<HTMLCanvasElement>;
  point: DrawingPoint;
  root: PageScrollRoot;
}): { draft: PointerDraft; selection?: readonly string[] } {
  const { draft, event, point } = args;
  if (draft.kind === 'create') return { draft: updateCreateDraft(draft, event, args.root) };
  if (draft.kind === 'move') {
    return {
      draft: {
        ...draft,
        object: translateDrawingObject(draft.original, {
          x: point.x - draft.start.x,
          y: point.y - draft.start.y,
        }),
      },
    };
  }
  if (draft.kind === 'move-selection') {
    const delta = { x: point.x - draft.start.x, y: point.y - draft.start.y };
    return {
      draft: {
        ...draft,
        objects: draft.originals.map((object) => translateDrawingObject(object, delta)),
      },
    };
  }
  if (draft.kind === 'marquee') {
    return {
      draft: { ...draft, current: point },
      selection: resolveDrawingMarqueeSelection({
        current: point,
        initialIds: draft.initialSelectionIds,
        mode: draft.mode,
        objects: args.documentObjects,
        start: draft.start,
      }),
    };
  }
  const modifiers = { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey };
  return {
    draft:
      draft.kind === 'resize'
        ? { ...draft, object: resizeDrawingObject(draft, point, modifiers) }
        : { ...draft, object: rotateDrawingObject(draft, point, modifiers) },
  };
}
