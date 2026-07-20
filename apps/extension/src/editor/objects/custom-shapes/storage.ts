import type { EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';
import {
  deleteEditorCustomShape,
  listEditorCustomShapes,
  saveEditorCustomShape,
  setEditorCustomShapeEnabled,
} from './persistence';

export async function loadCustomShapeLibrary() {
  return listEditorCustomShapes();
}

export async function saveCustomShapeDefinition(
  definition: EditorCustomShapeDefinition,
  sourceFileName: string | null
) {
  return saveEditorCustomShape(definition, { sourceFileName });
}

export async function disableCustomShapeDefinition(id: string): Promise<boolean> {
  return setEditorCustomShapeEnabled(id, false);
}

export async function deleteCustomShapeDefinition(id: string): Promise<void> {
  await deleteEditorCustomShape(id);
}
