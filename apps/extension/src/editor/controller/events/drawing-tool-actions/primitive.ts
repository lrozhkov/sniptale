import { useEditorStore } from '../../../state/useEditorStore';
import { createArrowObject } from '../../../objects/arrow';
import { createLineObject, updateLineObject } from '../../../objects/line';
import {
  createDiamondDraft,
  createEllipseDraft,
  createRectangleDraft,
} from '../../drawing/shape-drafts';
import { createCropGuideRect } from '../../tools/crop';
import type { EditorControllerEventBindings } from '../types';

export function handleShapeMouseDown(
  bindings: EditorControllerEventBindings,
  activeTool: 'rectangle' | 'ellipse' | 'diamond',
  point: import('fabric').Point
): void {
  const shapeFactory = {
    rectangle: createRectangleDraft,
    ellipse: createEllipseDraft,
    diamond: createDiamondDraft,
  }[activeTool];

  const shape = shapeFactory(point);
  bindings.decorateShape(shape, activeTool);
  bindings.startDrawSession(activeTool, point, shape);
}

export function handleArrowMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const arrow = createArrowObject({
    id: crypto.randomUUID(),
    labelIndex: bindings.nextLabelIndex('arrow'),
    start: point,
    end: point,
    settings: useEditorStore.getState().toolSettings.arrow,
  });
  arrow.sniptaleArrowDrawing = true;
  arrow.sniptaleArrowDraftPoints = [point, point];
  arrow.sniptaleArrowPointerMoved = false;
  bindings.prepareObject(arrow);
  bindings.startDrawSession('arrow', point, arrow);
}

export function handleLineMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const settings = useEditorStore.getState().toolSettings.line;
  const line = createLineObject({
    id: crypto.randomUUID(),
    labelIndex: bindings.nextLabelIndex('line'),
    points: [point, point],
    settings,
  });
  line.sniptaleLineDrawing = true;
  line.sniptaleLinePointerMoved = false;
  updateLineObject(line, { settings });
  bindings.prepareObject(line);
  bindings.startDrawSession('line', point, line);
}

export function handleCropMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  bindings.startDrawSession('crop', point, createCropGuideRect(point));
}
