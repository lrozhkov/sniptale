import type { Canvas, FabricObject } from 'fabric';
import { selectLayerObject } from '../../../layer-actions';

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
}): void {
  const recovered = selectLayerObject(
    options.canvas,
    options.id,
    options.selectionOptions ?? {},
    options.ensureObjectReachable,
    options.focusObjectInViewport
  );
  if (recovered === null) {
    return;
  }

  if (recovered) {
    options.commitHistory();
  }
  options.syncRuntimeState();
}
