import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../../features/editor/document/types';
import { prepareEditorObject } from '../../../document/objects/prepare';
import { addEditorCanvasObject } from '../../../input/canvas-actions/object-add';
import { decorateEditorShape } from '../../../input/canvas-actions/shape-decoration';
import { syncEditorRasterEffects } from '../../../layer-effects/filters';
import type { EditorControllerInstance } from '../../types';

function consumeInitialTextInsertFlag(textbox: import('fabric').Textbox): boolean {
  const shouldResetTool = Boolean(textbox.sniptaleTextInitialInsertPending);
  textbox.sniptaleTextInitialInsertPending = false;
  return shouldResetTool;
}

export function decorateShapeForController(
  controller: EditorControllerInstance,
  object: FabricObject,
  type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
): void {
  decorateEditorShape(object, type, (itemType) => controller.nextLabelIndex(itemType));
}

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
      const shouldResetTool = consumeInitialTextInsertFlag(textbox);
      controller.canvas?.remove(textbox);
      controller.canvas?.requestRenderAll();
      if (shouldResetTool) {
        controller.switchToSelectTool();
      }
      controller.syncRuntimeState();
    },
    onTextboxExitCommit: (textbox) => {
      if (consumeInitialTextInsertFlag(textbox)) {
        controller.switchToSelectTool();
      }
      controller.commitHistory();
      controller.syncRuntimeState();
    },
  });
}
