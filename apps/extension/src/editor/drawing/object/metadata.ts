import {
  ActiveSelection,
  Path,
  Point,
  util,
  type FabricObject,
  type ObjectEvents,
  type PathProps,
  type SerializedPathProps,
  type Textbox,
} from 'fabric';
import {
  getDrawingObjectBounds,
  type DrawingBounds,
  type DrawingObject,
  type DrawingPoint,
} from '../../../features/drawing/public';
import {
  parseEditorDrawingMetadata,
  serializeEditorDrawingMetadata,
} from '../../document/import-boundary';

const transientDrawingObjects = new WeakMap<FabricObject, DrawingObject>();

export function writeEditorDrawingObject(target: FabricObject, object: DrawingObject): void {
  transientDrawingObjects.delete(target);
  target.sniptaleDrawingJson = serializeEditorDrawingMetadata(object);
}

export function stageEditorDrawingObject(target: FabricObject, object: DrawingObject): void {
  transientDrawingObjects.set(target, object);
}

export function readEditorDrawingObject(target: FabricObject): DrawingObject | null {
  return (
    transientDrawingObjects.get(target) ?? parseEditorDrawingMetadata(target.sniptaleDrawingJson)
  );
}

export function isEditorDrawingSelection(target: FabricObject): boolean {
  if (readEditorDrawingObject(target)) return true;
  return (
    target instanceof ActiveSelection &&
    target.getObjects().length > 0 &&
    target.getObjects().every((object) => Boolean(readEditorDrawingObject(object)))
  );
}

function translatePoint(point: DrawingPoint, x: number, y: number): DrawingPoint {
  return { x: point.x + x, y: point.y + y };
}

export function translateEditorDrawingObject(
  drawing: DrawingObject,
  translation: DrawingPoint,
  id = drawing.id
): DrawingObject {
  if (drawing.kind === 'pencil' || drawing.kind === 'marker') {
    return {
      ...drawing,
      id,
      samples: drawing.samples.map((sample) => ({
        ...sample,
        ...translatePoint(sample, translation.x, translation.y),
      })),
    };
  }
  if (drawing.kind === 'arrow') {
    return {
      ...drawing,
      end: translatePoint(drawing.end, translation.x, translation.y),
      id,
      start: translatePoint(drawing.start, translation.x, translation.y),
    };
  }
  return {
    ...drawing,
    bounds: {
      ...drawing.bounds,
      x: drawing.bounds.x + translation.x,
      y: drawing.bounds.y + translation.y,
    },
    id,
  };
}

function resolveFabricBounds(target: FabricObject): DrawingBounds {
  const center = target.getCenterPoint();
  const width = Math.max(1, Math.abs(target.width * target.scaleX));
  const height = Math.max(1, Math.abs(target.height * target.scaleY));
  return {
    height,
    width,
    x: center.x - width / 2,
    y: center.y - height / 2,
  } satisfies DrawingBounds;
}

function scalePointToBounds(
  point: DrawingPoint,
  previous: DrawingBounds,
  next: DrawingBounds
): DrawingPoint {
  const previousCenter = {
    x: previous.x + previous.width / 2,
    y: previous.y + previous.height / 2,
  };
  const nextCenter = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
  return {
    x: nextCenter.x + (point.x - previousCenter.x) * (next.width / Math.max(1, previous.width)),
    y: nextCenter.y + (point.y - previousCenter.y) * (next.height / Math.max(1, previous.height)),
  };
}

function normalizeSynchronizedArrowGeometry<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(target: Path<Props, SerializedProps, Events>): void {
  const transform = target.calcTransformMatrix();
  const scale = Math.sqrt(Math.abs(transform[0] * transform[3] - transform[1] * transform[2]));
  const geometry = new Path(util.transformPath(target.path, transform, target.pathOffset), {
    originX: 'left',
    originY: 'top',
    strokeWidth: target.strokeWidth * scale,
  });
  const placement = target.group
    ? util.multiplyTransformMatrices(
        util.invertTransform(target.group.calcTransformMatrix()),
        geometry.calcOwnMatrix()
      )
    : geometry.calcOwnMatrix();
  target.set({
    height: geometry.height,
    originX: geometry.originX,
    originY: geometry.originY,
    path: geometry.path,
    pathOffset: geometry.pathOffset,
    strokeWidth: geometry.strokeWidth,
    width: geometry.width,
  });
  util.applyTransformToObject(target, placement);
}

export function synchronizeEditorDrawingObjectFromFabric(
  target: FabricObject
): DrawingObject | null {
  const drawing = readEditorDrawingObject(target);
  if (!drawing) return null;
  const previous = getDrawingObjectBounds(drawing);
  const bounds = resolveFabricBounds(target);
  const rotation = { rotation: Number(target.angle) };
  let next: DrawingObject;
  if (drawing.kind === 'pencil' || drawing.kind === 'marker') {
    const scale = Math.sqrt(
      (bounds.width / Math.max(1, previous.width)) * (bounds.height / Math.max(1, previous.height))
    );
    next = {
      ...drawing,
      ...rotation,
      samples: drawing.samples.map((sample) => ({
        ...sample,
        ...scalePointToBounds(sample, previous, bounds),
      })),
      width: drawing.width * scale,
    };
  } else if (drawing.kind === 'arrow') {
    const transform = target.calcTransformMatrix();
    const scale = Math.sqrt(Math.abs(transform[0] * transform[3] - transform[1] * transform[2]));
    const transformEndpoint = (point: DrawingPoint): DrawingPoint =>
      target instanceof Path
        ? util.transformPoint(new Point(point.x, point.y).subtract(target.pathOffset), transform)
        : scalePointToBounds(point, previous, bounds);
    next = {
      ...drawing,
      end: transformEndpoint(drawing.end),
      start: transformEndpoint(drawing.start),
      width: drawing.width * scale,
    };
  } else if (
    drawing.kind === 'rectangle' ||
    drawing.kind === 'ellipse' ||
    drawing.kind === 'triangle' ||
    drawing.kind === 'parallelogram'
  ) {
    const skewX = (drawing.skewX ?? 0) + target.skewX;
    next = {
      ...drawing,
      bounds,
      ...rotation,
      ...(skewX ? { skewX } : {}),
    };
  } else {
    next = { ...drawing, bounds, ...rotation };
  }
  if (next.kind === 'arrow' && target instanceof Path) normalizeSynchronizedArrowGeometry(target);
  writeEditorDrawingObject(target, next);
  return next;
}

export function syncEditorDrawingTextObject(textbox: Textbox): boolean {
  const drawing = readEditorDrawingObject(textbox);
  if (drawing?.kind !== 'text') return false;
  const height = Math.max(1, textbox.height);
  const width = Math.max(40, textbox.width);
  const center = textbox.getCenterPoint();
  const bounds =
    textbox.angle || drawing.rotation
      ? { height, width, x: center.x - width / 2, y: center.y - height / 2 }
      : { ...drawing.bounds, height, width };
  writeEditorDrawingObject(textbox, {
    ...drawing,
    bounds,
    rotation: Number(textbox.angle),
    text: textbox.text ?? '',
  });
  return true;
}
