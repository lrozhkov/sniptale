import {
  appendDrawingSample,
  clampDrawingTextWidth,
  createDrawingBounds,
  getDrawingBoundsCenter,
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  getDrawingObjectSkewX,
  getDrawingShapeShearOffset,
  hitTestDrawingDocument,
  replaceDrawingObjectBounds,
  resolveDrawingTextFontFamily,
  transformDrawingObjectPoint,
  transformDrawingObjectVector,
  untransformDrawingObjectVector,
  resolveDrawingTextHeight,
  type DrawingObject,
  type DrawingPoint,
  type DrawingResizeHandle,
  type DrawingRotationHandle,
  type DrawingSample,
  type DrawingTool,
  type DrawingToolDefaults,
  type DrawingSessionSnapshot,
  type DrawingSession,
  type DrawingSelectionMode,
} from '../../features/drawing/public';
import { readPageScroll, type PageScrollRoot } from '../platform/page-scroll';
import { resizeDrawingBox } from './box-resize';
import type { DrawingViewportProjection } from './render';

export type PointerDraft =
  | { kind: 'create'; start: DrawingPoint; object: DrawingObject }
  | { kind: 'move'; start: DrawingPoint; original: DrawingObject; object: DrawingObject }
  | {
      kind: 'move-selection';
      start: DrawingPoint;
      originals: readonly DrawingObject[];
      objects: readonly DrawingObject[];
      object?: never;
    }
  | {
      kind: 'marquee';
      start: DrawingPoint;
      current: DrawingPoint;
      initialSelectionIds: readonly string[];
      mode: DrawingSelectionMode;
      object?: never;
    }
  | {
      kind: 'resize';
      start: DrawingPoint;
      original: DrawingObject;
      object: DrawingObject;
      handle: DrawingResizeHandle;
    }
  | {
      kind: 'rotate';
      start: DrawingPoint;
      original: DrawingObject;
      object: DrawingObject;
      handle: DrawingRotationHandle;
    };

type DrawingPointerModifiers = {
  ctrlKey: boolean;
  shiftKey: boolean;
};

const STRICT_LINEAR_ANGLE_STEP = 15;
const MAGNETIC_LINEAR_ANGLE_STEP = 45;
const MAGNETIC_LINEAR_ANGLE_TOLERANCE = 5;
const ROTATION_HANDLE_OFFSET = 18;
const ROTATION_HANDLE_RADIUS = 9;
let drawingTextMeasurementContext: CanvasRenderingContext2D | null | undefined;

function getDrawingTextMeasurementContext(): CanvasRenderingContext2D | null {
  if (drawingTextMeasurementContext !== undefined) return drawingTextMeasurementContext;
  drawingTextMeasurementContext =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return drawingTextMeasurementContext;
}

export const createDrawingId = () => `drawing-${crypto.randomUUID()}`;

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

function angularDistance(left: number, right: number): number {
  return Math.abs(((left - right + 540) % 360) - 180);
}

function normalizeAngle(angle: number): number {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function resolveDrawingSnappedAngle(angle: number, modifiers: DrawingPointerModifiers): number {
  if (modifiers.shiftKey)
    return Math.round(angle / STRICT_LINEAR_ANGLE_STEP) * STRICT_LINEAR_ANGLE_STEP;
  if (modifiers.ctrlKey) return angle;
  const magneticAngle = Math.round(angle / MAGNETIC_LINEAR_ANGLE_STEP) * MAGNETIC_LINEAR_ANGLE_STEP;
  return angularDistance(angle, magneticAngle) <= MAGNETIC_LINEAR_ANGLE_TOLERANCE
    ? magneticAngle
    : angle;
}

export function resolveDrawingLinearPoint(args: {
  modifiers: DrawingPointerModifiers;
  point: DrawingPoint;
  start: DrawingPoint;
}): DrawingPoint {
  const deltaX = args.point.x - args.start.x;
  const deltaY = args.point.y - args.start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 0.001) return args.point;

  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  const snappedAngle = resolveDrawingSnappedAngle(angle, args.modifiers);
  if (snappedAngle === angle) return args.point;

  const radians = (snappedAngle * Math.PI) / 180;
  return {
    x: args.start.x + Math.cos(radians) * distance,
    y: args.start.y + Math.sin(radians) * distance,
  };
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
  modifiers: DrawingPointerModifiers;
  object: DrawingObject;
  point: DrawingPoint;
  start: DrawingPoint;
  timestamp: number;
}): DrawingObject {
  const { modifiers, object, point, start, timestamp } = args;
  if (object.kind === 'pencil' || object.kind === 'marker') {
    if (modifiers.ctrlKey || modifiers.shiftKey) {
      const end = resolveDrawingLinearPoint({ modifiers, point, start });
      const first = object.samples[0] ?? { ...start, t: timestamp };
      return { ...object, samples: [first, { ...end, t: timestamp }] };
    }
    const sample: DrawingSample = { ...point, t: timestamp };
    return {
      ...object,
      samples: appendDrawingSample(object.samples, sample, object.kind === 'pencil'),
    };
  }
  if (object.kind === 'arrow') {
    return { ...object, end: resolveDrawingLinearPoint({ modifiers, point, start }) };
  }
  if ('bounds' in object) {
    let end = point;
    if (
      modifiers.shiftKey &&
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

export function resolveDrawingResizeHandle(
  object: DrawingObject,
  point: DrawingPoint
): DrawingResizeHandle | null {
  const near = (candidate: DrawingPoint) =>
    Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 9;
  if (object.kind === 'arrow') {
    if (near(object.start)) return 'start';
    if (near(object.end)) return 'end';
    return null;
  }
  const bounds = getDrawingObjectBounds(object);
  const candidates: Array<[DrawingResizeHandle, DrawingPoint]> =
    object.kind === 'text'
      ? [
          ['e', { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }],
          ['w', { x: bounds.x, y: bounds.y + bounds.height / 2 }],
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
  return (
    candidates.find(([, candidate]) => near(transformDrawingObjectPoint(object, candidate)))?.[0] ??
    null
  );
}

const ROTATION_CORNERS: ReadonlyArray<
  [DrawingRotationHandle, (bounds: ReturnType<typeof getDrawingObjectBounds>) => DrawingPoint]
> = [['rotate-ne', (bounds) => ({ x: bounds.x + bounds.width, y: bounds.y })]];

export function getDrawingRotationHandlePoint(
  object: DrawingObject,
  handle: DrawingRotationHandle
): DrawingPoint | null {
  if (object.kind === 'arrow') return null;
  const bounds = getDrawingObjectBounds(object);
  const center = getDrawingBoundsCenter(bounds);
  const cornerFactory = ROTATION_CORNERS.find(([candidate]) => candidate === handle)?.[1];
  if (!cornerFactory) return null;
  const corner = transformDrawingObjectPoint(object, cornerFactory(bounds));
  const distance = Math.hypot(corner.x - center.x, corner.y - center.y);
  if (distance < 0.001) return corner;
  return {
    x: corner.x + ((corner.x - center.x) / distance) * ROTATION_HANDLE_OFFSET,
    y: corner.y + ((corner.y - center.y) / distance) * ROTATION_HANDLE_OFFSET,
  };
}

export function resolveDrawingRotationHandle(
  object: DrawingObject,
  point: DrawingPoint
): DrawingRotationHandle | null {
  if (object.kind === 'arrow') return null;
  return (
    ROTATION_CORNERS.find(([handle]) => {
      const candidate = getDrawingRotationHandlePoint(object, handle);
      return candidate
        ? Math.hypot(point.x - candidate.x, point.y - candidate.y) <= ROTATION_HANDLE_RADIUS
        : false;
    })?.[0] ?? null
  );
}

export function rotateDrawingObject(
  draft: Extract<PointerDraft, { kind: 'rotate' }>,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers = { ctrlKey: false, shiftKey: false }
): DrawingObject {
  if (draft.original.kind === 'arrow') return draft.original;
  const center = getDrawingBoundsCenter(getDrawingObjectBounds(draft.original));
  const startAngle = Math.atan2(draft.start.y - center.y, draft.start.x - center.x);
  const nextAngle = Math.atan2(point.y - center.y, point.x - center.x);
  const delta = normalizeAngle(((nextAngle - startAngle) * 180) / Math.PI);
  const rotation = normalizeAngle(
    resolveDrawingSnappedAngle(getDrawingObjectRotation(draft.original) + delta, modifiers)
  );
  return { ...draft.original, rotation };
}

function withDrawingObjectRotation(object: DrawingObject, rotation: number): DrawingObject {
  if (object.kind === 'arrow') return object;
  return { ...object, rotation };
}

function isDrawingShapeObject(
  object: DrawingObject
): object is Extract<
  DrawingObject,
  { kind: 'rectangle' | 'ellipse' | 'triangle' | 'parallelogram' }
> {
  return (
    object.kind === 'rectangle' ||
    object.kind === 'ellipse' ||
    object.kind === 'triangle' ||
    object.kind === 'parallelogram'
  );
}

function withoutDrawingObjectTransform(
  object: Exclude<DrawingObject, { kind: 'arrow' }>
): DrawingObject {
  if (isDrawingShapeObject(object)) return { ...object, rotation: 0, skewX: 0 };
  return { ...object, rotation: 0 };
}

function withDrawingObjectTransform(
  object: DrawingObject,
  original: Exclude<DrawingObject, { kind: 'arrow' }>
): DrawingObject {
  const rotated = withDrawingObjectRotation(object, getDrawingObjectRotation(original));
  if (!isDrawingShapeObject(rotated)) return rotated;
  return { ...rotated, skewX: getDrawingObjectSkewX(original) };
}

type DrawingResizeDraft = Extract<PointerDraft, { kind: 'resize' }>;

function resizeDrawingArrowGeometry(
  draft: DrawingResizeDraft,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers,
  original: Extract<DrawingObject, { kind: 'arrow' }>
): DrawingObject {
  const fixedPoint = draft.handle === 'start' ? original.end : original.start;
  const originalEndpoint = draft.handle === 'start' ? original.start : original.end;
  const target = {
    x: originalEndpoint.x + point.x - draft.start.x,
    y: originalEndpoint.y + point.y - draft.start.y,
  };
  const endpoint = resolveDrawingLinearPoint({ modifiers, point: target, start: fixedPoint });
  return draft.handle === 'start'
    ? { ...original, start: endpoint }
    : { ...original, end: endpoint };
}

function resizeTransformedDrawingGeometry(
  draft: DrawingResizeDraft,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers,
  originalObject: Exclude<DrawingObject, { kind: 'arrow' }>
): DrawingObject {
  const delta = untransformDrawingObjectVector(originalObject, {
    x: point.x - draft.start.x,
    y: point.y - draft.start.y,
  });
  const original = withoutDrawingObjectTransform(originalObject);
  const untransformed = resizeDrawingObjectGeometry(
    { ...draft, original, object: original },
    { x: draft.start.x + delta.x, y: draft.start.y + delta.y },
    modifiers
  );
  const originalBounds = getDrawingObjectBounds(originalObject);
  const untransformedBounds = getDrawingObjectBounds(untransformed);
  const originalCenter = getDrawingBoundsCenter(originalBounds);
  const localCenterDelta = {
    x: untransformedBounds.x + untransformedBounds.width / 2 - originalCenter.x,
    y: untransformedBounds.y + untransformedBounds.height / 2 - originalCenter.y,
  };
  const worldCenterDelta = transformDrawingObjectVector(originalObject, localCenterDelta);
  return withDrawingObjectTransform(
    replaceDrawingObjectBounds(untransformed, {
      x: originalCenter.x + worldCenterDelta.x - untransformedBounds.width / 2,
      y: originalCenter.y + worldCenterDelta.y - untransformedBounds.height / 2,
      width: untransformedBounds.width,
      height: untransformedBounds.height,
    }),
    originalObject
  );
}

function resizeDrawingTextGeometry(
  draft: DrawingResizeDraft,
  point: DrawingPoint,
  original: Extract<DrawingObject, { kind: 'text' }>
): DrawingObject {
  const bounds = getDrawingObjectBounds(original);
  const right = bounds.x + bounds.width;
  const originalHandleX = draft.handle === 'w' ? bounds.x : right;
  const targetX = originalHandleX + point.x - draft.start.x;
  const requestedWidth = draft.handle === 'w' ? right - targetX : targetX - bounds.x;
  const width = clampDrawingTextWidth(
    original.text,
    original.fontSize,
    requestedWidth,
    Number.POSITIVE_INFINITY
  );
  const measurementContext = getDrawingTextMeasurementContext();
  if (measurementContext) {
    measurementContext.font = `${original.fontSize}px ${resolveDrawingTextFontFamily(
      original.fontFamily
    )}`;
  }
  return {
    ...original,
    bounds: {
      x: draft.handle === 'w' ? right - width : bounds.x,
      y: bounds.y,
      width,
      height: resolveDrawingTextHeight(
        original.text,
        original.fontSize,
        width,
        measurementContext ? (line) => measurementContext.measureText(line).width : undefined
      ),
    },
  };
}

function resizeDrawingBoxGeometry(
  draft: DrawingResizeDraft,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers
): DrawingObject {
  const bounds = getDrawingObjectBounds(draft.original);
  if (draft.handle === 'start' || draft.handle === 'end') return draft.original;
  const originalHandle = {
    x: draft.handle.includes('w')
      ? bounds.x
      : draft.handle.includes('e')
        ? bounds.x + bounds.width
        : bounds.x + bounds.width / 2,
    y: draft.handle.includes('n')
      ? bounds.y
      : draft.handle.includes('s')
        ? bounds.y + bounds.height
        : bounds.y + bounds.height / 2,
  };
  const target = {
    x: originalHandle.x + point.x - draft.start.x,
    y: originalHandle.y + point.y - draft.start.y,
  };
  return replaceDrawingObjectBounds(
    draft.original,
    resizeDrawingBox({ bounds, handle: draft.handle, modifiers, point: target })
  );
}

function resizeDrawingObjectGeometry(
  draft: DrawingResizeDraft,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers
): DrawingObject {
  const { original } = draft;
  if (original.kind === 'arrow')
    return resizeDrawingArrowGeometry(draft, point, modifiers, original);
  if (getDrawingObjectRotation(original) !== 0 || getDrawingObjectSkewX(original) !== 0) {
    return resizeTransformedDrawingGeometry(draft, point, modifiers, original);
  }
  if (original.kind === 'text') return resizeDrawingTextGeometry(draft, point, original);
  return resizeDrawingBoxGeometry(draft, point, modifiers);
}

function applyDrawingShapeShear(args: {
  draft: DrawingResizeDraft;
  modifiers: DrawingPointerModifiers;
  point: DrawingPoint;
  resized: DrawingObject;
}): DrawingObject {
  const { draft, modifiers, point, resized } = args;
  if (
    !modifiers.ctrlKey ||
    !isDrawingShapeObject(draft.original) ||
    (draft.handle !== 'n' && draft.handle !== 's') ||
    !isDrawingShapeObject(resized)
  ) {
    return resized;
  }
  const localDelta = untransformDrawingObjectVector(draft.original, {
    x: point.x - draft.start.x,
    y: point.y - draft.start.y,
  });
  const originalBounds = getDrawingObjectBounds(draft.original);
  const resizedBounds = getDrawingObjectBounds(resized);
  const originalOffset = getDrawingShapeShearOffset(draft.original);
  const originalBottomLeft = originalBounds.x - Math.min(0, originalOffset);
  const originalTopLeft = originalBottomLeft + originalOffset;
  const bottomLeft = draft.handle === 's' ? originalBottomLeft + localDelta.x : originalBottomLeft;
  const topLeft = draft.handle === 'n' ? originalTopLeft + localDelta.x : originalTopLeft;
  const rawOffset = topLeft - bottomLeft;
  const maximumOffset = Math.tan(Math.PI / 3) * Math.max(1, resizedBounds.height);
  const offset = Math.max(-maximumOffset, Math.min(maximumOffset, rawOffset));
  const rawSkew = (Math.atan(offset / Math.max(1, resizedBounds.height)) * 180) / Math.PI;
  const skewX = modifiers.shiftKey ? Math.round(rawSkew / 15) * 15 : rawSkew;
  const snappedOffset = Math.tan((skewX * Math.PI) / 180) * resizedBounds.height;
  const baseWidth = Math.max(8, resizedBounds.width - Math.abs(originalOffset));
  return {
    ...resized,
    bounds: {
      x: bottomLeft + Math.min(0, snappedOffset),
      y: resizedBounds.y,
      width: baseWidth + Math.abs(snappedOffset),
      height: resizedBounds.height,
    },
    skewX,
  };
}

export function resizeDrawingObject(
  draft: Extract<PointerDraft, { kind: 'resize' }>,
  point: DrawingPoint,
  modifiers: DrawingPointerModifiers = { ctrlKey: false, shiftKey: false }
): DrawingObject {
  const resized = resizeDrawingObjectGeometry(draft, point, modifiers);
  return applyDrawingShapeShear({ draft, modifiers, point, resized });
}

type DrawingPointerStart = {
  draft: PointerDraft | null;
  selection?: readonly string[];
  text?: { id: string | null; point: DrawingPoint; value: string };
};

export function beginDrawingPointer(args: {
  modifiers?: DrawingPointerModifiers;
  point: DrawingPoint;
  snapshot: DrawingSessionSnapshot;
  timestamp: number;
}): DrawingPointerStart {
  const { point, snapshot, timestamp } = args;
  const modifiers = args.modifiers ?? { ctrlKey: false, shiftKey: false };
  const selectedObjects = snapshot.document.objects.filter((object) =>
    snapshot.selectedObjectIds.includes(object.id)
  );
  const selected = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const hit = hitTestDrawingDocument(snapshot.document.objects, point);
  const rotationHandle = selected ? resolveDrawingRotationHandle(selected, point) : null;
  if (selected && rotationHandle) {
    return {
      draft: {
        kind: 'rotate',
        start: point,
        original: selected,
        object: selected,
        handle: rotationHandle,
      },
    };
  }
  const handle = selected ? resolveDrawingResizeHandle(selected, point) : null;
  if (selected && handle) {
    return {
      draft: { kind: 'resize', start: point, original: selected, object: selected, handle },
    };
  }
  if (selected && hit?.id === selected.id && snapshot.activeTool !== 'select') {
    return { draft: { kind: 'move', start: point, original: selected, object: selected } };
  }
  if (snapshot.activeTool === 'text' && hit?.kind === 'text') {
    return {
      draft: { kind: 'move', start: point, original: hit, object: hit },
      selection: [hit.id],
    };
  }
  if (snapshot.activeTool === 'select') {
    if (hit && modifiers.ctrlKey) {
      return {
        draft: null,
        selection: snapshot.selectedObjectIds.includes(hit.id)
          ? snapshot.selectedObjectIds.filter((id) => id !== hit.id)
          : [...snapshot.selectedObjectIds, hit.id],
      };
    }
    if (hit && modifiers.shiftKey) {
      return {
        draft: null,
        selection: snapshot.selectedObjectIds.includes(hit.id)
          ? snapshot.selectedObjectIds
          : [...snapshot.selectedObjectIds, hit.id],
      };
    }
    if (hit) {
      const selection = snapshot.selectedObjectIds.includes(hit.id)
        ? snapshot.selectedObjectIds
        : [hit.id];
      const moving = snapshot.document.objects.filter((object) => selection.includes(object.id));
      return {
        draft:
          moving.length > 1
            ? { kind: 'move-selection', start: point, originals: moving, objects: moving }
            : { kind: 'move', start: point, original: hit, object: hit },
        selection,
      };
    }
    const mode: DrawingSelectionMode = modifiers.ctrlKey
      ? 'toggle'
      : modifiers.shiftKey
        ? 'add'
        : 'replace';
    return {
      draft: {
        kind: 'marquee',
        start: point,
        current: point,
        initialSelectionIds: snapshot.selectedObjectIds,
        mode,
      },
      selection: mode === 'replace' ? [] : snapshot.selectedObjectIds,
    };
  }
  if (snapshot.activeTool === 'text') {
    return { draft: null, selection: [], text: { id: null, point, value: '' } };
  }
  const object = createDrawingObject(snapshot.activeTool, point, timestamp, snapshot.defaults);
  return { draft: object ? { kind: 'create', start: point, object } : null };
}

export function commitDrawingPointerDraft(
  session: DrawingSession,
  draft: PointerDraft | null
): void {
  if (!draft) return;
  if (draft.kind === 'marquee') return;
  if (draft.kind === 'move-selection') {
    if (draft.objects.some((object, index) => object !== draft.originals[index]))
      session.replaceObjects(draft.objects);
    return;
  }
  const bounds = getDrawingObjectBounds(draft.object);
  if (draft.kind === 'create') {
    if (draft.object.kind === 'arrow') {
      const length = Math.hypot(
        draft.object.end.x - draft.object.start.x,
        draft.object.end.y - draft.object.start.y
      );
      const minimumLength = Math.max(16, draft.object.width * 2);
      if (length < minimumLength) return;
    }
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
