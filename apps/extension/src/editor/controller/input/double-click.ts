import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
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

  void canvas;
  void event;
  void commitHistory;
  void syncRuntimeState;
}
