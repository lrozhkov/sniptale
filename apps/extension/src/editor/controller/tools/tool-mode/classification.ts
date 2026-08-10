import type { EditorTool } from '../../../../features/editor/document/types';

export function isStickyAnnotationTool(tool: EditorTool): boolean {
  switch (tool) {
    case 'pencil':
    case 'marker':
    case 'frame-annotation':
    case 'shape':
    case 'blur':
    case 'arrow':
    case 'text':
    case 'step':
      return true;
    case 'select':
    case 'image':
    case 'crop':
      return false;
  }
}
