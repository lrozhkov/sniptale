import type { Canvas } from 'fabric';

import { useEditorStore } from '../../../../state/useEditorStore';
import { isManagedBackgroundObject, resetFrameBackgroundDraft } from '../../../background';
import { isSourceObject } from '../../../../document/model';
import { getMutableEditorSelection } from './active-selection';

export function deleteEditorSelection(options: {
  canvas: Canvas | null;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const { canvas, commitHistory, syncRuntimeState } = options;
  const activeObjects = getMutableEditorSelection(canvas);
  if (!canvas || !activeObjects) {
    return;
  }

  const objects = activeObjects.filter((object) => !isSourceObject(object));
  if (objects.length === 0) {
    return;
  }

  const removedBackground = objects.some(isManagedBackgroundObject);
  objects.forEach((object) => canvas.remove(object));
  if (removedBackground) {
    useEditorStore.getState().updateFrame(resetFrameBackgroundDraft());
  }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}
