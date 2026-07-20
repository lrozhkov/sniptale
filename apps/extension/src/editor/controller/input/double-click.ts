import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
import { isTextbox } from '../core/helpers';
import { updateEditorArrowOnDoubleClick } from './interactions';
import { isArrowObject } from '../../objects/arrow';
import { isLineObject, updateLinePointOnDoubleClick } from '../../objects/line';

export function handleEditorDoubleClick(options: {
  canvas: Canvas | null;
  target?: FabricObject;
  event: TPointerEvent;
  activeTool: string;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, target, event, activeTool, commitHistory, syncRuntimeState } = options;
  if (target && isTextbox(target) && activeTool === 'select') {
    target.enterEditing();
    target.selectAll();
    return;
  }

  if (!canvas || !target || activeTool !== 'select') {
    return;
  }

  if (isLineObject(target)) {
    updateLinePointOnDoubleClick(target);
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    syncRuntimeState();
    return;
  }

  if (!isArrowObject(target)) {
    return;
  }

  const point = canvas.getScenePoint(event);
  updateEditorArrowOnDoubleClick(target, point);
  canvas.setActiveObject(target);
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
