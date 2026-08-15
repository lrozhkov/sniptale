import type { Canvas, FabricObject, TPointerEvent } from 'fabric';

import {
  appendDrawingSamples,
  createDrawingBounds,
  updateCreatedDrawingObject,
  type DrawingObject,
  type DrawingSample,
} from '../../../features/drawing/public';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../../drawing/object/metadata';
import {
  replaceEditorDrawingFabricGeometry,
  updateEditorDrawingPathDraft,
  updateEditorDrawingShapeDraft,
} from '../../drawing/object/vector';
import type { EditorControllerEventBindings } from './types';

function collectFreehandSamples(canvas: Canvas, events: readonly TPointerEvent[]): DrawingSample[] {
  return events.flatMap((event) => {
    const coalesced =
      'getCoalescedEvents' in event && typeof event.getCoalescedEvents === 'function'
        ? event.getCoalescedEvents()
        : [];
    return (coalesced.length > 0 ? coalesced : [event]).map((sampleEvent) => ({
      ...canvas.getScenePoint(sampleEvent),
      t: sampleEvent.timeStamp,
    }));
  });
}

function replaceDraft(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  current: FabricObject,
  drawing: Exclude<DrawingObject, { kind: 'blur' }>
): void {
  const next = replaceEditorDrawingFabricGeometry(current, drawing);
  bindings.prepareObject(next);
  canvas.remove(current);
  canvas.add(next);
  const session = bindings.getDrawSession();
  if (session) bindings.setDrawSession({ ...session, object: next, objectId: drawing.id });
  canvas.requestRenderAll();
}

function createDraftBoundsUpdate(start: { x: number; y: number }, point: { x: number; y: number }) {
  const bounds = createDrawingBounds(start, point);
  return {
    bounds,
    properties: { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height },
  };
}

function updateCropDraft(
  canvas: Canvas,
  object: FabricObject,
  start: { x: number; y: number },
  point: { x: number; y: number }
): void {
  const { properties } = createDraftBoundsUpdate(start, point);
  object.set({
    ...properties,
    scaleX: 1,
    scaleY: 1,
  });
  object.setCoords();
  canvas.requestRenderAll();
}

function updateBlurPreview(
  canvas: Canvas,
  object: FabricObject,
  drawing: Extract<DrawingObject, { kind: 'blur' }>,
  start: { x: number; y: number },
  point: { x: number; y: number }
): void {
  const { bounds, properties } = createDraftBoundsUpdate(start, point);
  object.set(properties);
  writeEditorDrawingObject(object, { ...drawing, bounds });
  object.setCoords();
  canvas.requestRenderAll();
}

function updateVectorPreview(
  object: FabricObject,
  drawing: Exclude<DrawingObject, { kind: 'blur' }>
): boolean {
  return (
    (drawing.kind === 'pencil' || drawing.kind === 'marker' || drawing.kind === 'arrow') &&
    updateEditorDrawingPathDraft(object, drawing, { preview: true })
  );
}

function updateShapePreview(
  object: FabricObject,
  drawing: Exclude<DrawingObject, { kind: 'blur' }>
): boolean {
  return (
    (drawing.kind === 'rectangle' ||
      drawing.kind === 'ellipse' ||
      drawing.kind === 'triangle' ||
      drawing.kind === 'parallelogram') &&
    updateEditorDrawingShapeDraft(object, drawing)
  );
}

function applyDrawingPreview(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  object: FabricObject,
  drawing: DrawingObject,
  start: { x: number; y: number },
  point: { x: number; y: number }
): void {
  if (drawing.kind === 'blur') {
    updateBlurPreview(canvas, object, drawing, start, point);
    return;
  }
  if (updateVectorPreview(object, drawing) || updateShapePreview(object, drawing)) {
    canvas.requestRenderAll();
    return;
  }
  replaceDraft(bindings, canvas, object, drawing);
}

export function updateEditorDrawingDraft(
  bindings: EditorControllerEventBindings,
  events: readonly TPointerEvent[]
): void {
  const canvas = bindings.getCanvas();
  const session = bindings.getDrawSession();
  const event = events[events.length - 1];
  if (!canvas || !session?.object || !event) return;
  const point = canvas.getScenePoint(event);
  session.lastPoint = point;
  if (session.tool === 'crop') {
    updateCropDraft(canvas, session.object, session.start, point);
    return;
  }
  const drawing = readEditorDrawingObject(session.object);
  if (!drawing) return;
  const modifiers = { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey };
  const next =
    (drawing.kind === 'pencil' || drawing.kind === 'marker') &&
    !modifiers.ctrlKey &&
    !modifiers.shiftKey
      ? {
          ...drawing,
          samples: appendDrawingSamples(
            drawing.samples,
            collectFreehandSamples(canvas, events),
            drawing.kind === 'pencil'
          ),
        }
      : updateCreatedDrawingObject({
          modifiers,
          object: drawing,
          point,
          start: session.start,
          timestamp: event.timeStamp,
        });
  applyDrawingPreview(bindings, canvas, session.object, next, session.start, point);
}
