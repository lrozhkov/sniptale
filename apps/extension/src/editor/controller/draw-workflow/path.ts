import type { EditorObjectType } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import { configureEditorFreehandPath } from '../input/interactions';

export function handleEditorPathCreated(options: {
  canvas: import('fabric').Canvas | null;
  path: import('fabric').FabricObject;
  activeTool: 'highlighter' | 'pencil' | string;
  nextLabelIndex: (type: EditorObjectType) => number;
  prepareObject: (object: import('fabric').FabricObject) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const {
    canvas,
    path,
    activeTool,
    nextLabelIndex,
    prepareObject,
    commitHistory,
    syncRuntimeState,
  } = options;
  if (!canvas) {
    return;
  }

  const tool = activeTool === 'highlighter' ? 'highlighter' : 'pencil';
  const brush = canvas.freeDrawingBrush ?? null;
  const store = useEditorStore.getState();
  const settings = store.toolSettings[tool];
  configureEditorFreehandPath({
    brush,
    path,
    tool,
    labelIndex: nextLabelIndex(tool),
    settings,
  });

  prepareObject(path);
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
