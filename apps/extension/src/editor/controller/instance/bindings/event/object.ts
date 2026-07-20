import type { FabricObject, Point } from 'fabric';
import type { EditorObjectType } from '../../../../../features/editor/document/types';
import { isRichShapeObject } from '../../../../objects/rich-shape/guards';
import { startRichShapeTextEditor } from '../../../rich-shape-text-editor/session-start';
import type { DrawSession } from '../../../core/types';
import type { EditorControllerInstance } from '../../types';

export function createEditorControllerEventObjectBindings(controller: EditorControllerInstance) {
  return {
    getActiveCropRect: () => controller.getActiveCropRect(),
    ensureObjectReachable: (object: FabricObject) => controller.ensureObjectReachable(object),
    applyGridSnap: (object: FabricObject) => controller.applyGridSnap(object),
    nextLabelIndex: (type: EditorObjectType) => controller.nextLabelIndex(type),
    prepareObject: (object: FabricObject) => controller.prepareObject(object),
    startDrawSession: (tool: DrawSession['tool'], start: Point, object: FabricObject) =>
      controller.startDrawSession(tool, start, object),
    decorateShape: (
      object: FabricObject,
      type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
    ) => controller.decorateShape(object, type),
    addObject: (object: FabricObject) => controller.addObject(object),
    switchToSelectTool: () => controller.switchToSelectTool(),
    advanceStepValue: () => controller.advanceStepValue(),
    beginRichShapeTextEditing: (object: FabricObject) => {
      if (!controller.canvas || !isRichShapeObject(object)) {
        return false;
      }

      return startRichShapeTextEditor({
        canvas: controller.canvas,
        object,
        owner: controller,
      });
    },
  };
}
