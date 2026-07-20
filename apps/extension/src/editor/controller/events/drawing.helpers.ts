import type { EditorTool } from '../../../features/editor/document/types';
export { isTargetInCurrentSelection } from '../selection/target';

type EditingFabricObject = import('fabric').FabricObject & {
  exitEditing?: () => void;
  isEditing?: boolean;
};

export function isStickyAnnotationTool(tool: EditorTool): boolean {
  switch (tool) {
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
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'select':
    case 'image':
    case 'crop':
      return false;
  }
}

export function clearActiveAnnotationSelection(
  canvas: import('fabric').Canvas,
  syncRuntimeState: () => void
): void {
  const activeObject = canvas.getActiveObject() as EditingFabricObject | undefined;
  if (activeObject?.isEditing && typeof activeObject.exitEditing === 'function') {
    activeObject.exitEditing();
  }

  const activeObjects = canvas.getActiveObjects();
  if (activeObjects.length === 0 && !activeObject) {
    return;
  }

  canvas.discardActiveObject();
  canvas.requestRenderAll();
  syncRuntimeState();
}
