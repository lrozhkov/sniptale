import { ActiveSelection, type FabricObject, type Textbox } from 'fabric';
import {
  getDrawingObjectBounds,
  type DrawingBounds,
  type DrawingObject,
  type DrawingPoint,
} from '../../../features/drawing/public';
import { parseEditorDrawingMetadata } from '../../document/import-boundary';

const DRAWING_OBJECT_METADATA_VERSION = 1;

interface EditorDrawingMetadata {
  version: typeof DRAWING_OBJECT_METADATA_VERSION;
  object: DrawingObject;
}

export function writeEditorDrawingObject(target: FabricObject, object: DrawingObject): void {
  target.sniptaleDrawingJson = JSON.stringify({
    version: DRAWING_OBJECT_METADATA_VERSION,
    object,
  } satisfies EditorDrawingMetadata);
}

export function readEditorDrawingObject(target: FabricObject): DrawingObject | null {
  return parseEditorDrawingMetadata(target.sniptaleDrawingJson);
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
    const scale = Math.sqrt(
      (bounds.width / Math.max(1, previous.width)) * (bounds.height / Math.max(1, previous.height))
    );
    next = {
      ...drawing,
      end: scalePointToBounds(drawing.end, previous, bounds),
      start: scalePointToBounds(drawing.start, previous, bounds),
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
