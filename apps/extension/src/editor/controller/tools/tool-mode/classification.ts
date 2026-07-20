import type { EditorTool } from '../../../../features/editor/document/types';
import type { RasterInteractionTool } from './types';

export function isStickyAnnotationTool(tool: EditorTool): boolean {
  switch (tool) {
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'pencil':
    case 'highlighter':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'shape-library':
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'blur':
    case 'arrow':
    case 'line':
    case 'callout':
    case 'text':
    case 'step':
      return true;
    case 'select':
    case 'image':
    case 'crop':
      return false;
  }
}

export function isRasterInteractionTool(tool: EditorTool): tool is RasterInteractionTool {
  return tool === 'selection' || tool === 'brush' || tool === 'eraser' || tool === 'fill';
}

export function isFreeDrawingTool(tool: EditorTool): tool is 'pencil' | 'highlighter' {
  return tool === 'pencil' || tool === 'highlighter';
}
