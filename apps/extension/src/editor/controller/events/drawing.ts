import type { Canvas, FabricObject, TPointerEvent, Transform } from 'fabric';
import {
  createDrawingObject,
  clampDrawingTextWidth,
  resolveDrawingTextHeight,
  type DrawingObject,
} from '../../../features/drawing/public';
import { useEditorStore } from '../../state/useEditorStore';
import { cropDown } from '../crop-workflow/pointer';
import { activateTextTarget, isTextTarget } from './text-target';
import { completeDrawWorkflowFromBindings } from './draw-completion';
import type { EditorControllerEventBindings, EditorControllerEventHandlers } from './types';
import { handleStepMouseDown } from '../tools/step-drawing/pointer';
import { isEditorDrawingSelection } from '../../drawing/object/metadata';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { createEditorDrawingBlurObject } from '../../drawing/object/blur';
import {
  beginEditorSelectionModifierGesture,
  finishEditorSelectionModifierGesture,
  finishEditorSelectionModifierMouseDown,
  type EditorSelectionModifierGesture,
} from './selection-modifiers';
import { updateEditorDrawingDraft } from './drawing-draft';
import {
  isEditorDrawingSessionPointer,
  readEditorDrawingPointerId,
} from './drawing-pointer-session';
import { endEditorCanvasTransform } from '../input/canvas-actions';

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
  point: import('fabric').Point,
  pointerId: number | null
): void {
  const type = getDrawingObjectType(drawing);
  const object = createEditorDrawingFabricObject(drawing, bindings.nextLabelIndex(type));
  if (drawing.kind === 'pencil' || drawing.kind === 'marker') object.visible = false;
  bindings.prepareObject(object);
  bindings.startDrawSession(type, point, object, pointerId);
}

function startText(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point,
  pointerId: number | null
): void {
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
  bindings.startDrawSession('text', point, object, pointerId);
}

function startBlur(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point,
  pointerId: number | null
): void {
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
  bindings.startDrawSession('blur', point, object, pointerId);
}

function startDrawing(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  event: { e: TPointerEvent; target?: FabricObject; transform?: Pick<Transform, 'target'> | null }
): boolean {
  const tool = bindings.getActiveTool();
  if (tool === 'select') return false;
  if (event.transform && isEditorDrawingSelection(event.transform.target)) return false;
  if (cropDown(bindings, canvas, tool, event)) return true;
  const point = canvas.getScenePoint(event.e);
  const pointerId = readEditorDrawingPointerId(event.e);
  if (tool === 'step') {
    handleStepMouseDown(bindings, point);
    bindings.commitHistory();
    bindings.syncRuntimeState();
    return false;
  }
  if (tool === 'frame-annotation') return false;
  clearSelection(canvas, bindings);
  if (tool === 'text') {
    startText(bindings, point, pointerId);
    return true;
  }
  if (tool === 'blur') {
    startBlur(bindings, point, pointerId);
    return true;
  }
  if (tool !== 'pencil' && tool !== 'marker' && tool !== 'shape' && tool !== 'arrow') {
    return false;
  }
  const drawing = createDrawingObject(
    tool,
    point,
    event.e.timeStamp,
    useEditorStore.getState().toolSettings
  );
  if (!drawing || drawing.kind === 'blur') return false;
  addDrawingDraft(bindings, drawing, point, pointerId);
  return true;
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
  | 'handlePointerDownBeforeFabric'
  | 'handlePointerCancel'
  | 'handleWindowPointerMove'
  | 'handleWindowPointerUp'
> {
  let textTargetCandidate: {
    point: import('fabric').Point;
    target: FabricObject;
  } | null = null;
  let selectionModifierGesture: EditorSelectionModifierGesture | null = null;
  let lastHandledMoveEvent: TPointerEvent | null = null;
  const updateDraftOnce = (event: TPointerEvent) => {
    const session = bindings.getDrawSession();
    if (!session || !isEditorDrawingSessionPointer(session, event)) return false;
    if (lastHandledMoveEvent === event) return true;
    lastHandledMoveEvent = event;
    updateEditorDrawingDraft(bindings, [event]);
    return true;
  };

  return {
    handlePathCreated: () => undefined,
    handleMouseDownBefore: (event) => {
      const canvas = bindings.getCanvas();
      if (!canvas) return;
      selectionModifierGesture = beginEditorSelectionModifierGesture({
        activeTool: bindings.getActiveTool(),
        canvas,
        event: event.e,
        ...(event.target ? { target: event.target } : {}),
      });
    },
    handlePointerDownBeforeFabric: (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const canvas = bindings.getCanvas();
      lastHandledMoveEvent = null;
      textTargetCandidate = null;
      selectionModifierGesture = null;
      endEditorCanvasTransform(canvas, event);
      if (bindings.getDrawSession()) bindings.cancelTransientInteraction();
    },
    handleMouseDown: (event) => {
      lastHandledMoveEvent = null;
      const canvas = bindings.getCanvas();
      if (canvas) {
        selectionModifierGesture = finishEditorSelectionModifierMouseDown(
          canvas,
          selectionModifierGesture
        );
      }
      if ('button' in event.e && event.e.button === 2) return;
      if (!canvas || !bindings.getSource()) return;
      if (bindings.getActiveTool() === 'text' && isTextTarget(event.target)) {
        const point = canvas.getScenePoint(event.e);
        canvas.setActiveObject(event.target, event.e);
        textTargetCandidate = { point, target: event.target };
        return;
      }
      textTargetCandidate = null;
      if (startDrawing(bindings, canvas, event)) {
        canvas.skipTargetFind = true;
        canvas.setCursor('crosshair');
      }
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
      updateDraftOnce(event.e);
    },
    handleMouseUp: (event) => {
      const drawSession = bindings.getDrawSession();
      if (drawSession) {
        if (event && !isEditorDrawingSessionPointer(drawSession, event.e)) return;
        lastHandledMoveEvent = null;
        textTargetCandidate = null;
        selectionModifierGesture = null;
        completeDrawWorkflowFromBindings(bindings);
        return;
      }
      const canvas = bindings.getCanvas();
      if (canvas && finishEditorSelectionModifierGesture(canvas, selectionModifierGesture)) {
        selectionModifierGesture = null;
        bindings.syncRuntimeState();
        return;
      }
      selectionModifierGesture = null;
      if (canvas && textTargetCandidate) {
        activateTextTarget(canvas, textTargetCandidate.target, () => bindings.syncRuntimeState(), {
          selectAll: false,
        });
        textTargetCandidate = null;
        return;
      }
      completeDrawWorkflowFromBindings(bindings);
    },
    handleWindowPointerMove: (event) => {
      if (!bindings.getCanvas()) return;
      updateDraftOnce(event);
    },
    handleWindowPointerUp: (event) => {
      const drawSession = bindings.getDrawSession();
      if (!drawSession || !isEditorDrawingSessionPointer(drawSession, event)) return;
      lastHandledMoveEvent = null;
      completeDrawWorkflowFromBindings(bindings);
    },
    handlePointerCancel: (event) => {
      textTargetCandidate = null;
      selectionModifierGesture = null;
      lastHandledMoveEvent = null;
      const drawSession = bindings.getDrawSession();
      if (drawSession && !isEditorDrawingSessionPointer(drawSession, event)) return;
      endEditorCanvasTransform(bindings.getCanvas(), event);
      if (drawSession) bindings.cancelTransientInteraction();
    },
  };
}
