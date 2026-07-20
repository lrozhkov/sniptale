import type { Canvas, FabricObject } from 'fabric';

export function addEditorCanvasObject(options: {
  canvas: Canvas | null;
  object: FabricObject;
  prepareObject: (object: FabricObject) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, object, prepareObject, commitHistory, syncRuntimeState } = options;
  if (!canvas) {
    return;
  }

  prepareObject(object);
  canvas.add(object);
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
