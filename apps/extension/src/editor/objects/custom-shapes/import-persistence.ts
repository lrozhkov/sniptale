import type {
  EditorCustomShapeDefinition,
  EditorCustomShapeStoredDefinition,
} from '../../../features/editor/document/rich-shape';
import {
  deleteCustomShapeDefinition,
  disableCustomShapeDefinition,
  loadCustomShapeLibrary,
  saveCustomShapeDefinition,
} from './storage';
export { assertCustomShapeImportFileCanBeRead } from './budget';

async function restorePreviousShape(previous: EditorCustomShapeStoredDefinition): Promise<void> {
  await saveCustomShapeDefinition(previous, previous.sourceFileName);
  if (!previous.enabled) {
    await disableCustomShapeDefinition(previous.id);
  }
}

async function rollbackSavedDefinitions(
  savedIds: readonly string[],
  previousById: Map<string, EditorCustomShapeStoredDefinition | null>
): Promise<void> {
  for (const id of [...savedIds].reverse()) {
    const previous = previousById.get(id);
    if (previous) {
      await restorePreviousShape(previous);
    } else {
      await deleteCustomShapeDefinition(id);
    }
  }
}

export async function saveCustomShapeDefinitionsWithRollback(
  definitions: readonly EditorCustomShapeDefinition[],
  sourceFileName: string
): Promise<void> {
  const existingById = new Map((await loadCustomShapeLibrary()).map((shape) => [shape.id, shape]));
  const savedIds: string[] = [];
  const previousById = new Map<string, EditorCustomShapeStoredDefinition | null>();

  try {
    for (const definition of definitions) {
      if (!previousById.has(definition.id)) {
        previousById.set(definition.id, existingById.get(definition.id) ?? null);
      }
      await saveCustomShapeDefinition(definition, sourceFileName);
      savedIds.push(definition.id);
    }
  } catch (error) {
    await rollbackSavedDefinitions(savedIds, previousById);
    throw error;
  }
}
