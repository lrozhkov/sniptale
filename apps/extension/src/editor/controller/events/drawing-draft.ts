import type { Canvas, FabricObject, TPointerEvent } from 'fabric';

import {
  appendDrawingSamples,
  createDrawingBounds,
  updateCreatedDrawingObject,
  type DrawingObject,
  type DrawingSample,
} from '../../../features/drawing/public';
import {
  readEditorDrawingObject,
  stageEditorDrawingObject,
  writeEditorDrawingObject,
} from '../../drawing/object/metadata';
import {
  replaceEditorDrawingFabricGeometry,
  updateEditorDrawingPathDraft,
  updateEditorDrawingShapeDraft,
} from '../../drawing/object/vector';
import type { EditorControllerEventBindings } from './types';
import {
  getEditorFreeCanvasBounds,
  normalizeEditorCropSelection,
  normalizeEditorFreeCanvasSelection,
} from '../tools/crop';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { getEditorCanvasWorkspaceInsets } from '../../document/canvas-surface/editing-surface';

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
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  object: FabricObject,
  start: { x: number; y: number },
  point: { x: number; y: number }
): void {
  const size = bindings.getCanvasDocumentSize();
  const mode = useEditorStore.getState().canvasCropMode;
  if (mode === 'expand' && canvas instanceof EditorCanvas) {
    canvas.extendWorkspaceToContain({
      left: point.x,
      top: point.y,
      right: point.x,
      bottom: point.y,
    });
  }
  const insets = getEditorCanvasWorkspaceInsets(canvas, size);
  const freeBounds =
    mode === 'expand' ? getEditorFreeCanvasBounds(size, canvas.getZoom(), insets) : null;
  const constrainedPoint = freeBounds
    ? {
        x: Math.max(freeBounds.left, Math.min(freeBounds.right, point.x)),
        y: Math.max(freeBounds.top, Math.min(freeBounds.bottom, point.y)),
      }
    : point;
  const bounds = createDrawingBounds(start, constrainedPoint);
  const selection =
    mode === 'crop'
      ? normalizeEditorCropSelection(
          { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height },
          size
        )
      : normalizeEditorFreeCanvasSelection(
          { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height },
          size,
          canvas.getZoom(),
          insets
        );
  object.set({
    left: selection.left,
    top: selection.top,
    width: selection.width,
    height: selection.height,
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
  if (drawing.kind === 'pencil' || drawing.kind === 'marker') {
    stageEditorDrawingObject(object, drawing);
    object.visible = false;
    return true;
  }
  return (
    drawing.kind === 'arrow' && updateEditorDrawingPathDraft(object, drawing, { preview: true })
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
    updateCropDraft(bindings, canvas, session.object, session.start, point);
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
          arrowFreeAngle: drawing.kind === 'arrow',
          ...(session.arrowDrawFromTip === undefined
            ? {}
            : { arrowFromTip: session.arrowDrawFromTip }),
          modifiers,
          object: drawing,
          point,
          start: session.start,
          timestamp: event.timeStamp,
        });
  applyDrawingPreview(bindings, canvas, session.object, next, session.start, point);
}
