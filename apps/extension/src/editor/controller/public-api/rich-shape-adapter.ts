import { insertEditorRichShapeObject } from '../public-actions/rich-shape';
import type { EditorInsertionControllerApi } from './insertions/contracts';

export function insertEditorControllerRichShapeFromAdapter(
  controller: EditorInsertionControllerApi,
  shapeId: string,
  options?: { customDefinition?: unknown; rough?: unknown }
): void {
  insertEditorRichShapeObject({
    canvas: controller.canvas,
    source: controller.source,
    shapeId,
    prepareObject: (object) => controller.prepareObject(object),
    nextLabelIndex: () => controller.nextLabelIndex('rich-shape'),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
    ...(options?.rough === undefined ? {} : { rough: Boolean(options.rough) }),
    ...(options?.customDefinition ? { customDefinition: options.customDefinition } : {}),
  });
}
