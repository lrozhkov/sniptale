import { Group, type Canvas, type FabricObject, type TPointerEvent } from 'fabric';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { isTextbox } from '../core/helpers';
import { activateTextTarget } from '../events/text-target';
import { removeEditorDrawingArrowBendAtPoint } from '../../drawing/object/controls/arrow';

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
    if (canvas) {
      activateTextTarget(canvas, target, syncRuntimeState, { event, selectAll: false });
    }
    return;
  }

  if (
    canvas &&
    (activeTool === 'select' || activeTool === 'arrow') &&
    removeEditorDrawingArrowBendAtPoint(canvas, canvas.getScenePoint(event))
  ) {
    commitHistory();
    syncRuntimeState();
    return;
  }

  if (activeTool === 'select' && canvas instanceof EditorCanvas && target instanceof Group) {
    if (canvas.enterSelectionGroup(target, event)) syncRuntimeState();
  }
}
