import { isRasterEditorTool } from '../../raster-tools/interactions/tool';
import { handleRasterToolMouseUp } from '../../raster-tools/interactions/up';
import { shouldKeepArrowDrawSessionOpen } from '../arrow-drawing';
import { completeDrawSessionFromBindings } from '../draw-session-completion';
import { shouldKeepLineDrawSessionOpen } from '../line-drawing';
import type { DrawingEventBindings } from './types';

export function createMouseUpHandler(bindings: DrawingEventBindings) {
  return () => {
    if (
      isRasterEditorTool(bindings.getActiveTool()) &&
      !bindings.getDrawSession() &&
      !bindings.getCropGuide()
    ) {
      void handleRasterToolMouseUp(bindings);
      return;
    }

    if (shouldKeepArrowDrawSessionOpen(bindings) || shouldKeepLineDrawSessionOpen(bindings)) {
      return;
    }

    completeDrawSessionFromBindings(bindings);
  };
}
