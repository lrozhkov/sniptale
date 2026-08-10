import type { Canvas, FabricObject, TPointerEvent } from 'fabric';
import { isTextbox } from '../core/helpers';

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

  void canvas;
  void event;
  void commitHistory;
  void syncRuntimeState;
}
