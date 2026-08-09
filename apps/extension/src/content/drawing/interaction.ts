import {
  appendDrawingSample,
  createDrawingBounds,
  getDrawingObjectBounds,
  hitTestDrawingDocument,
  replaceDrawingObjectBounds,
  type DrawingObject,
  type DrawingPoint,
  type DrawingSample,
  type DrawingTool,
  type DrawingToolDefaults,
  type DrawingSessionSnapshot,
  type DrawingSession,
} from '../../features/drawing/public';
import { readPageScroll, type PageScrollRoot } from '../platform/page-scroll';
import type { DrawingViewportProjection } from './render';

export type PointerDraft =
  | { kind: 'create'; start: DrawingPoint; object: DrawingObject }
  | { kind: 'move'; start: DrawingPoint; original: DrawingObject; object: DrawingObject }
  | {
      kind: 'resize';
      start: DrawingPoint;
      original: DrawingObject;
      object: DrawingObject;
      handle: string;
    };

export const createDrawingId = () => `drawing-${crypto.randomUUID()}`;

export function estimateTextLineCount(text: string, fontSize: number): number {
  const charactersPerLine = Math.max(1, Math.floor(308 / (fontSize * 0.55)));
  return text
    .split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

export function getDrawingViewportProjection(root: PageScrollRoot): DrawingViewportProjection {
  const scroll = readPageScroll(root);
  if (root.kind !== 'element') return scroll;
  const rect = root.element.getBoundingClientRect();
  return { x: scroll.x - rect.left, y: scroll.y - rect.top };
}

export function toDrawingScenePoint(
  event: { clientX: number; clientY: number },
  root: PageScrollRoot
): DrawingPoint {
  const projection = getDrawingViewportProjection(root);
  return { x: event.clientX + projection.x, y: event.clientY + projection.y };
}

function createDrawingObject(
  tool: DrawingTool,
  point: DrawingPoint,
  timestamp: number,
  defaults: DrawingToolDefaults
): DrawingObject | null {
  const id = createDrawingId();
  const bounds = { x: point.x, y: point.y, width: 0, height: 0 };
  switch (tool) {
    case 'pencil':
      return { id, kind: 'pencil', samples: [{ ...point, t: timestamp }], ...defaults.pencil };
    case 'marker':
      return { id, kind: 'marker', samples: [{ ...point, t: timestamp }], ...defaults.marker };
    case 'shape':
      return { id, bounds, ...defaults.shape };
    case 'arrow':
      return { id, kind: 'arrow', start: point, end: point, ...defaults.arrow };
    case 'blur':
      return { id, kind: 'blur', bounds };
    case 'select':
    case 'text':
      return null;
  }
}

export function updateCreatedDrawingObject(args: {
  object: DrawingObject;
  point: DrawingPoint;
  square: boolean;
  start: DrawingPoint;
  timestamp: number;
}): DrawingObject {
  const { object, point, square, start, timestamp } = args;
  if (object.kind === 'pencil' || object.kind === 'marker') {
    const sample: DrawingSample = { ...point, t: timestamp };
    return {
      ...object,
      samples: appendDrawingSample(object.samples, sample, object.kind === 'pencil'),
    };
  }
  if (object.kind === 'arrow') return { ...object, end: point };
  if ('bounds' in object) {
    let end = point;
    if (
      square &&
      (object.kind === 'rectangle' ||
        object.kind === 'ellipse' ||
        object.kind === 'triangle' ||
        object.kind === 'parallelogram')
    ) {
      const size = Math.max(Math.abs(point.x - start.x), Math.abs(point.y - start.y));
      end = {
        x: start.x + Math.sign(point.x - start.x || 1) * size,
        y: start.y + Math.sign(point.y - start.y || 1) * size,
      };
    }
    return { ...object, bounds: createDrawingBounds(start, end) };
  }
  return object;
}

function resolveDrawingResizeHandle(object: DrawingObject, point: DrawingPoint): string | null {
  const near = (candidate: DrawingPoint) =>
    Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 9;
  if (object.kind === 'arrow') {
    if (near(object.start)) return 'start';
    if (near(object.end)) return 'end';
    return null;
  }
  const bounds = getDrawingObjectBounds(object);
  const candidates: Array<[string, DrawingPoint]> =
    object.kind === 'text'
      ? [
          ['nw', bounds],
          ['ne', { x: bounds.x + bounds.width, y: bounds.y }],
          ['se', { x: bounds.x + bounds.width, y: bounds.y + bounds.height }],
          ['sw', { x: bounds.x, y: bounds.y + bounds.height }],
        ]
      : [
          ['nw', bounds],
          ['n', { x: bounds.x + bounds.width / 2, y: bounds.y }],
          ['ne', { x: bounds.x + bounds.width, y: bounds.y }],
          ['e', { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }],
          ['se', { x: bounds.x + bounds.width, y: bounds.y + bounds.height }],
          ['s', { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }],
          ['sw', { x: bounds.x, y: bounds.y + bounds.height }],
          ['w', { x: bounds.x, y: bounds.y + bounds.height / 2 }],
        ];
  return candidates.find(([, candidate]) => near(candidate))?.[0] ?? null;
}

export function resizeDrawingObject(
  draft: Extract<PointerDraft, { kind: 'resize' }>,
  point: DrawingPoint
): DrawingObject {
  if (draft.original.kind === 'arrow') {
    return draft.handle === 'start'
      ? { ...draft.original, start: point }
      : { ...draft.original, end: point };
  }
  const bounds = getDrawingObjectBounds(draft.original);
  const dx = point.x - draft.start.x;
  const dy = point.y - draft.start.y;
  const left = bounds.x + (draft.handle.includes('w') ? dx : 0);
  const top = bounds.y + (draft.handle.includes('n') ? dy : 0);
  const right = bounds.x + bounds.width + (draft.handle.includes('e') ? dx : 0);
  const bottom = bounds.y + bounds.height + (draft.handle.includes('s') ? dy : 0);
  return replaceDrawingObjectBounds(
    draft.original,
    createDrawingBounds({ x: left, y: top }, { x: right, y: bottom })
  );
}

type DrawingPointerStart = {
  draft: PointerDraft | null;
  selection?: string | null;
  text?: { id: string | null; point: DrawingPoint; value: string };
};

export function beginDrawingPointer(args: {
  point: DrawingPoint;
  snapshot: DrawingSessionSnapshot;
  timestamp: number;
}): DrawingPointerStart {
  const { point, snapshot, timestamp } = args;
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  const hit = hitTestDrawingDocument(snapshot.document.objects, point);
  const handle = selected ? resolveDrawingResizeHandle(selected, point) : null;
  if (selected && handle) {
    return {
      draft: { kind: 'resize', start: point, original: selected, object: selected, handle },
    };
  }
  if (selected && hit?.id === selected.id) {
    return { draft: { kind: 'move', start: point, original: selected, object: selected } };
  }
  if (snapshot.activeTool === 'select') {
    return {
      draft: hit ? { kind: 'move', start: point, original: hit, object: hit } : null,
      selection: hit?.id ?? null,
    };
  }
  if (snapshot.activeTool === 'text') {
    return { draft: null, selection: null, text: { id: null, point, value: '' } };
  }
  const object = createDrawingObject(snapshot.activeTool, point, timestamp, snapshot.defaults);
  return { draft: object ? { kind: 'create', start: point, object } : null };
}

export function commitDrawingPointerDraft(
  session: DrawingSession,
  draft: PointerDraft | null
): void {
  if (!draft) return;
  const bounds = getDrawingObjectBounds(draft.object);
  if (draft.kind === 'create') {
    if (
      draft.object.kind === 'pencil' ||
      draft.object.kind === 'marker' ||
      bounds.width >= 3 ||
      bounds.height >= 3
    ) {
      session.commitObject(draft.object, {
        select: draft.object.kind !== 'pencil' && draft.object.kind !== 'marker',
      });
    }
    return;
  }
  if (draft.object !== draft.original) session.replaceObject(draft.object);
}
