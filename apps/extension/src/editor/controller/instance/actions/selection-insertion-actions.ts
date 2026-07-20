import { insertEditorControllerImage, insertEditorControllerTechnicalData } from '../../public-api';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../tools/technical-data';
import type { EditorControllerInstance } from '../types';

export async function insertImageForController(
  controller: EditorControllerInstance,
  dataUrl: string,
  name: string | null = null
): Promise<void> {
  await insertEditorControllerImage(controller.getPublicApiAdapter(), dataUrl, name);
}

export function insertTechnicalDataForController(
  controller: EditorControllerInstance,
  kinds: readonly EditorTechnicalDataKind[],
  layout: EditorTechnicalDataLayout = 'column'
): void {
  insertEditorControllerTechnicalData(controller.getPublicApiAdapter(), kinds, layout);
}
