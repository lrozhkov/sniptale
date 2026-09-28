import type { Canvas, FabricObject } from 'fabric';
import { selectLayerObject } from '../../../layer-actions';
import { EditorCanvas } from '../../../viewport/render-region';

export function selectEditorLayerById(options: {
  canvas: Canvas | null;
  id: string;
  selectionOptions?: {
    additive?: boolean;
    focusViewport?: boolean;
    range?: boolean;
    toggle?: boolean;
    anchorId?: string | null;
  };
  ensureObjectReachable: (object: FabricObject) => boolean;
  focusObjectInViewport: (object: FabricObject) => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): boolean {
  const recovered = selectLayerObject(
    options.canvas,
    options.id,
    options.selectionOptions ?? {},
    options.ensureObjectReachable,
    options.focusObjectInViewport
  );
  if (recovered === null) {
    return false;
  }

  if (options.canvas instanceof EditorCanvas) {
    const activeObjects = options.canvas.getActiveObjects();
    options.canvas.setLayerSelectionPriority(
      activeObjects.length === 1 ? (activeObjects[0] ?? null) : null
    );
  }

  if (recovered) {
    options.commitHistory();
  }
  options.syncRuntimeState();
  return true;
}
