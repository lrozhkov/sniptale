import type { EditorTool } from '../../../../features/editor/document/types';
import type { EditorRichShapeToolSelection } from '../../../state/types';

const DEFAULT_SHAPE_ID = 'rectangle';

function createDefaultSelection(tool: EditorTool): EditorRichShapeToolSelection | null {
  if (tool === 'shape-library') {
    return null;
  }

  return {
    shapeId: DEFAULT_SHAPE_ID,
    rough: tool === 'rough-shape',
  };
}

export function resolveActiveRichShapeToolSelection(
  tool: EditorTool,
  selection: EditorRichShapeToolSelection | null
): EditorRichShapeToolSelection | null {
  const activeSelection = selection ?? createDefaultSelection(tool);
  if (!activeSelection) {
    return null;
  }

  return {
    ...activeSelection,
    rough: tool === 'rough-shape' || activeSelection.rough,
  };
}
