import type { EditorTool } from '../../../../features/editor/document/types';
import { resolveDrawingToolCursor } from '../../../../features/drawing/public';

export function resolveEditorToolCursor(tool: EditorTool, arrowDrawFromTip = false): string {
  switch (tool) {
    case 'pencil':
    case 'marker':
    case 'arrow':
    case 'blur':
    case 'text':
    case 'select':
    case 'shape':
      return resolveDrawingToolCursor(tool, arrowDrawFromTip);
    case 'crop':
    case 'frame-annotation':
    case 'image':
    case 'step':
      return 'crosshair';
  }
}
