import type { FabricObject } from 'fabric';
import { prepareEditorObject } from '../../../document/objects/prepare';
import { addEditorCanvasObject } from '../../../input/canvas-actions/object-add';
import { syncEditorRasterEffects } from '../../../layer-effects/filters';
import type { EditorControllerInstance } from '../../types';
import { syncEditorDrawingTextObject } from '../../../../drawing/object/metadata';

export function addObjectForController(
  controller: EditorControllerInstance,
  object: FabricObject
): void {
  addEditorCanvasObject({
    canvas: controller.canvas,
    object,
    prepareObject: (item) => controller.prepareObject(item),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function initializeObjectForController(
  controller: EditorControllerInstance,
  object: FabricObject
): void {
  syncEditorRasterEffects(object);
  prepareEditorObject(object, {
    onTextboxExitEmpty: (textbox) => {
      controller.canvas?.remove(textbox);
      controller.canvas?.requestRenderAll();
      controller.syncRuntimeState();
    },
    onTextboxExitCommit: (textbox) => {
      syncEditorDrawingTextObject(textbox);
      controller.commitHistory();
      controller.syncRuntimeState();
    },
  });
}
