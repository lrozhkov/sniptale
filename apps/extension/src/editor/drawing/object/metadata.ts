import {
  ActiveSelection,
  FabricImage,
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
  parseDrawingSimplifySnapshot,
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
  if (object.kind === 'simplify' && object.source) {
    const { source } = object;
    target.sniptaleSimplifySourceData = source.dataUrl;
    target.sniptaleSimplifySourceWidth = source.width;
    target.sniptaleSimplifySourceHeight = source.height;
    target.sniptaleSimplifySourceLeft = source.bounds.x;
    target.sniptaleSimplifySourceTop = source.bounds.y;
    target.sniptaleSimplifySourceDisplayWidth = source.bounds.width;
    target.sniptaleSimplifySourceDisplayHeight = source.bounds.height;
  }
}

export function stageEditorDrawingObject(target: FabricObject, object: DrawingObject): void {
  transientDrawingObjects.set(target, object);
}

export function readEditorDrawingObject(target: FabricObject): DrawingObject | null {
  const drawing =
    transientDrawingObjects.get(target) ?? parseEditorDrawingMetadata(target.sniptaleDrawingJson);
  if (drawing?.kind !== 'simplify') return drawing;
  const result =
    target instanceof FabricImage
      ? parseDrawingSimplifySnapshot({
          dataUrl: target.getSrc(),
          width: target.width,
          height: target.height,
        })
      : null;
  const source = parseDrawingSimplifySnapshot({
    dataUrl: target.sniptaleSimplifySourceData,
    width: target.sniptaleSimplifySourceWidth,
    height: target.sniptaleSimplifySourceHeight,
  });
  return {
    ...drawing,
    ...(result ? { result } : {}),
    ...(source
      ? {
          source: {
            ...source,
            bounds: {
              x: target.sniptaleSimplifySourceLeft ?? 0,
              y: target.sniptaleSimplifySourceTop ?? 0,
              width: target.sniptaleSimplifySourceDisplayWidth ?? source.width,
              height: target.sniptaleSimplifySourceDisplayHeight ?? source.height,
            },
          },
        }
      : {}),
  };
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
      ...(drawing.bendPoints
        ? {
            bendPoints: drawing.bendPoints.map((point) =>
              translatePoint(point, translation.x, translation.y)
            ),
          }
        : {}),
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
    ...(drawing.kind === 'simplify' &&
    (drawing.settings.automatic || drawing.settings.manualKind === 'text') &&
    (id !== drawing.id || translation.x !== 0 || translation.y !== 0)
      ? { sourceDirty: true }
      : {}),
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
      ...(drawing.bendPoints ? { bendPoints: drawing.bendPoints.map(transformEndpoint) } : {}),
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
  if (
    next.kind === 'simplify' &&
    drawing.kind === 'simplify' &&
    (next.settings.automatic || next.settings.manualKind === 'text') &&
    (JSON.stringify(next.bounds) !== JSON.stringify(previous) || next.rotation !== drawing.rotation)
  )
    next = { ...next, sourceDirty: true };
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
