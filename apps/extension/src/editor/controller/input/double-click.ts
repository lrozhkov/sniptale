import { Group, type Canvas, type FabricObject, type TPointerEvent } from 'fabric';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { isTextbox } from '../core/helpers';
import { activateTextTarget } from '../events/text-target';

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

  if (activeTool === 'select' && canvas instanceof EditorCanvas && target instanceof Group) {
    if (canvas.enterSelectionGroup(target, event)) syncRuntimeState();
  }

  void canvas;
  void event;
  void commitHistory;
  void syncRuntimeState;
}
