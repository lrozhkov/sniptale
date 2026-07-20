import { insertEditorControllerRichShapeFromAdapter } from './rich-shape-adapter';
import type { EditorInsertionControllerApi } from './insertions/contracts';

export function insertEditorControllerRichShapeWithOptions(
  controller: EditorInsertionControllerApi,
  shapeId: string,
  options?: { rough?: unknown; customDefinition?: unknown }
): void {
  insertEditorControllerRichShapeFromAdapter(controller, shapeId, options);
}
