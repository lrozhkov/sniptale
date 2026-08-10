import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
import {
  createDrawingBounds,
  createDrawingObject,
  clampDrawingTextWidth,
  resolveDrawingTextHeight,
  updateCreatedDrawingObject,
  type DrawingObject,
} from '../../../features/drawing/public';
import { useEditorStore } from '../../state/useEditorStore';
import { cropDown } from '../crop-workflow/pointer';
import { activateTextTarget, isTextTarget } from './text-target';
import { completeDrawWorkflowFromBindings } from './draw-completion';
import type { EditorControllerEventBindings, EditorControllerEventHandlers } from './types';
import { handleStepMouseDown } from '../tools/step-drawing/pointer';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../../drawing/object/metadata';
import {
  createEditorDrawingFabricObject,
  replaceEditorDrawingFabricGeometry,
  updateEditorDrawingPathDraft,
} from '../../drawing/object/vector';
import { createEditorDrawingBlurObject } from '../../drawing/object/blur';

function clearSelection(canvas: Canvas, bindings: EditorControllerEventBindings): void {
  if (canvas.getActiveObjects().length === 0) return;
  canvas.discardActiveObject();
  bindings.syncRuntimeState();
}

function getDrawingObjectType(drawing: Exclude<DrawingObject, { kind: 'blur' }>) {
  return drawing.kind === 'rectangle' ||
    drawing.kind === 'ellipse' ||
    drawing.kind === 'triangle' ||
    drawing.kind === 'parallelogram'
    ? ('shape' as const)
    : drawing.kind;
}

function addDrawingDraft(
  bindings: EditorControllerEventBindings,
  drawing: Exclude<DrawingObject, { kind: 'blur' }>,
  point: import('fabric').Point
): void {
  const type = getDrawingObjectType(drawing);
  const object = createEditorDrawingFabricObject(drawing, bindings.nextLabelIndex(type));
  bindings.prepareObject(object);
  bindings.startDrawSession(type, point, object);
}

function startText(bindings: EditorControllerEventBindings, point: import('fabric').Point): void {
  const defaults = useEditorStore.getState().toolSettings.text;
  const source = bindings.getSource();
  if (!source) return;
  const maxWidth = Math.max(80, source.left + source.displayWidth - point.x);
  const width = clampDrawingTextWidth('', defaults.fontSize, 80, maxWidth);
  const drawing = {
    id: `drawing-${crypto.randomUUID()}`,
    kind: 'text',
    bounds: {
      x: point.x,
      y: point.y,
      width,
      height: resolveDrawingTextHeight('', defaults.fontSize, width),
    },
    text: '',
    ...defaults,
  } as const;
  const object = createEditorDrawingFabricObject(drawing, bindings.nextLabelIndex('text'));
  object.sniptaleDrawingTextAutoWidth = true;
  object.sniptaleDrawingTextMaxWidth = maxWidth;
  bindings.prepareObject(object);
  bindings.startDrawSession('text', point, object);
}

function startBlur(bindings: EditorControllerEventBindings, point: import('fabric').Point): void {
  const source = bindings.getSource();
  if (!source) return;
  const drawing: Extract<DrawingObject, { kind: 'blur' }> = {
    id: `drawing-${crypto.randomUUID()}`,
    kind: 'blur',
    bounds: { x: point.x, y: point.y, width: 1, height: 1 },
  };
  const object = createEditorDrawingBlurObject({
    drawing,
    labelIndex: bindings.nextLabelIndex('blur'),
    source,
  });
  bindings.prepareObject(object);
  bindings.startDrawSession('blur', point, object);
}

function startDrawing(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  event: { e: TPointerEvent; target?: FabricObject }
): void {
  const tool = bindings.getActiveTool();
  if (tool === 'select') return;
  if (cropDown(bindings, canvas, tool, event)) return;
  const point = canvas.getScenePoint(event.e);
  if (tool === 'step') {
    handleStepMouseDown(bindings, point);
    bindings.commitHistory();
    bindings.syncRuntimeState();
    return;
  }
  if (tool === 'frame-annotation') return;
  clearSelection(canvas, bindings);
  if (tool === 'text') {
    startText(bindings, point);
    return;
  }
  if (tool === 'blur') {
    startBlur(bindings, point);
    return;
  }
  if (tool !== 'pencil' && tool !== 'marker' && tool !== 'shape' && tool !== 'arrow') {
    return;
  }
  const drawing = createDrawingObject(
    tool,
    point,
    event.e.timeStamp,
    useEditorStore.getState().toolSettings
  );
  if (drawing && drawing.kind !== 'blur') addDrawingDraft(bindings, drawing, point);
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

function updateDraft(bindings: EditorControllerEventBindings, event: { e: TPointerEvent }): void {
  const canvas = bindings.getCanvas();
  const session = bindings.getDrawSession();
  if (!canvas || !session?.object) return;
  const point = canvas.getScenePoint(event.e);
  session.lastPoint = point;
  const drawing = readEditorDrawingObject(session.object);
  if (!drawing) return;
  const next = updateCreatedDrawingObject({
    modifiers: { ctrlKey: event.e.ctrlKey, shiftKey: event.e.shiftKey },
    object: drawing,
    point,
    start: session.start,
    timestamp: event.e.timeStamp,
  });
  if (next.kind === 'blur') {
    const bounds = createDrawingBounds(session.start, point);
    session.object.set({
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    writeEditorDrawingObject(session.object, { ...next, bounds });
    session.object.setCoords();
    canvas.requestRenderAll();
    return;
  }
  if (
    (next.kind === 'pencil' || next.kind === 'marker' || next.kind === 'arrow') &&
    updateEditorDrawingPathDraft(session.object, next, { preview: true })
  ) {
    canvas.requestRenderAll();
    return;
  }
  replaceDraft(bindings, canvas, session.object, next);
}

export function createEditorDrawingEventHandlers(
  bindings: EditorControllerEventBindings
): Pick<
  EditorControllerEventHandlers,
  | 'handlePathCreated'
  | 'handleMouseDownBefore'
  | 'handleMouseDown'
  | 'handleMouseMove'
  | 'handleMouseUp'
> {
  let textTargetCandidate: {
    point: import('fabric').Point;
    target: FabricObject;
  } | null = null;

  return {
    handlePathCreated: () => undefined,
    handleMouseDownBefore: () => undefined,
    handleMouseDown: (event) => {
      if ('button' in event.e && event.e.button === 2) return;
      const canvas = bindings.getCanvas();
      if (!canvas || !bindings.getSource()) return;
      if (bindings.getActiveTool() === 'text' && isTextTarget(event.target)) {
        const point = canvas.getScenePoint(event.e);
        canvas.setActiveObject(event.target, event.e);
        textTargetCandidate = { point, target: event.target };
        return;
      }
      textTargetCandidate = null;
      startDrawing(bindings, canvas, event);
    },
    handleMouseMove: (event) => {
      const canvas = bindings.getCanvas();
      if (canvas && textTargetCandidate) {
        const point = canvas.getScenePoint(event.e);
        if (
          Math.hypot(point.x - textTargetCandidate.point.x, point.y - textTargetCandidate.point.y) >
          3
        ) {
          textTargetCandidate = null;
        }
      }
      updateDraft(bindings, event);
    },
    handleMouseUp: () => {
      const canvas = bindings.getCanvas();
      if (canvas && textTargetCandidate) {
        activateTextTarget(canvas, textTargetCandidate.target, () => bindings.syncRuntimeState(), {
          selectAll: false,
        });
        textTargetCandidate = null;
        return;
      }
      completeDrawWorkflowFromBindings(bindings);
    },
  };
}
