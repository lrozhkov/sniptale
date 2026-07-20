import type { EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';
import { normalizeEditorCustomShapeStoredDefinition } from '../../../features/editor/document/rich-shape/custom';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  EDITOR_CUSTOM_SHAPES_STORE,
  initDB,
} from '../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../composition/persistence/infrastructure/indexed-db/mutation';
import type { EditorCustomShapeEntry } from '../../../composition/persistence/editor-presets/contracts';

const logger = createLogger({ namespace: 'SharedEditorCustomShapesDb' });

function cloneEntry(entry: EditorCustomShapeEntry): EditorCustomShapeEntry {
  return structuredClone(entry);
}

function parseStoredEntry(value: unknown, id?: string): EditorCustomShapeEntry | null {
  if (value === undefined) {
    return null;
  }

  const entry = normalizeEditorCustomShapeStoredDefinition(value);
  if (!entry) {
    logger.warn('Ignoring invalid custom shape entry from IndexedDB', { id });
    return null;
  }

  return entry;
}

export async function listEditorCustomShapes(): Promise<EditorCustomShapeEntry[]> {
  const db = await initDB();
  const rawEntries: unknown[] = await db.getAll(EDITOR_CUSTOM_SHAPES_STORE);
  return rawEntries
    .map((entry) => parseStoredEntry(entry))
    .filter((entry): entry is EditorCustomShapeEntry => entry !== null)
    .map(cloneEntry)
    .sort((left, right) => left.updatedAt - right.updatedAt);
}

export async function saveEditorCustomShape(
  definition: EditorCustomShapeDefinition,
  options: { sourceFileName?: string | null } = {}
): Promise<EditorCustomShapeEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const rawExisting: unknown = await db.get(EDITOR_CUSTOM_SHAPES_STORE, definition.id);
    const existing = parseStoredEntry(rawExisting, definition.id);
    const now = Date.now();
    const entry: EditorCustomShapeEntry = {
      ...definition,
      createdAt: existing?.createdAt ?? now,
      enabled: existing?.enabled ?? true,
      sourceFileName:
        'sourceFileName' in options
          ? (options.sourceFileName ?? null)
          : (existing?.sourceFileName ?? null),
      updatedAt: now,
    };

    await db.put(EDITOR_CUSTOM_SHAPES_STORE, entry);
    return cloneEntry(entry);
  });
}

export async function setEditorCustomShapeEnabled(id: string, enabled: boolean): Promise<boolean> {
  return runWithIndexedDbMutation(async (db) => {
    const rawExisting: unknown = await db.get(EDITOR_CUSTOM_SHAPES_STORE, id);
    const existing = parseStoredEntry(rawExisting, id);
    if (!existing) {
      return false;
    }

    await db.put(EDITOR_CUSTOM_SHAPES_STORE, {
      ...existing,
      enabled,
      updatedAt: Date.now(),
    });
    return true;
  });
}

export async function deleteEditorCustomShape(id: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(EDITOR_CUSTOM_SHAPES_STORE, id));
}
