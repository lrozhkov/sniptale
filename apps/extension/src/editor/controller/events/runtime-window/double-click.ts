import { handleEditorDoubleClick } from '../../input';
import { getRichShapeTextCapability } from '../../../objects/rich-shape';
import type { RuntimeWindowBindings } from './types';

export function createRuntimeDoubleClickHandler(bindings: RuntimeWindowBindings) {
  return (event: { e: import('fabric').TPointerEvent; target?: import('fabric').FabricObject }) => {
    if (
      event.target &&
      getRichShapeTextCapability(event.target) &&
      bindings.beginRichShapeTextEditing?.(event.target)
    ) {
      return;
    }

    handleEditorDoubleClick({
      canvas: bindings.getCanvas(),
      ...(event.target === undefined ? {} : { target: event.target }),
      event: event.e,
      activeTool: bindings.getActiveTool(),
      commitHistory: bindings.commitHistory,
      syncRuntimeState: bindings.syncRuntimeState,
    });
  };
}
