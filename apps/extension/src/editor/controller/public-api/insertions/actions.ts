import { insertEditorImageObject, insertEditorTechnicalDataObject } from '../../public-actions';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../tools/technical-data';
import { insertEditorControllerRichShapeFromAdapter } from '../rich-shape-adapter';
import type { EditorInsertionControllerApi } from './contracts';

export async function insertEditorControllerImage(
  controller: EditorInsertionControllerApi,
  dataUrl: string,
  name: string | null = null
): Promise<void> {
  await insertEditorImageObject({
    canvas: controller.canvas,
    source: controller.source,
    dataUrl,
    name,
    prepareObject: (object) => controller.prepareObject(object),
    nextLabelIndex: () => controller.nextLabelIndex('image'),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function insertEditorControllerTechnicalData(
  controller: EditorInsertionControllerApi,
  kinds: readonly EditorTechnicalDataKind[],
  layout: EditorTechnicalDataLayout = 'column'
): void {
  insertEditorTechnicalDataObject({
    canvas: controller.canvas,
    source: controller.source,
    kinds,
    layout,
    prepareObject: (object) => controller.prepareObject(object),
    nextLabelIndex: () => controller.nextLabelIndex('text'),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}

export function insertEditorControllerRichShape(
  controller: EditorInsertionControllerApi,
  shapeId: string
): void {
  insertEditorControllerRichShapeFromAdapter(controller, shapeId);
}
