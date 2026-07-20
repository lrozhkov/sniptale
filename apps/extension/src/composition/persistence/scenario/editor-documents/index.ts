import type { EditorDocument } from '../../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, initDB } from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import {
  parseScenarioStepEditorDocumentEntries,
  parseScenarioStepEditorDocumentEntry,
} from './index.guards.ts';
import type { ScenarioStepEditorDocumentEntry } from '../contracts';

const logger = createLogger({ namespace: 'SharedScenarioStepEditorDocumentsDb' });

export async function saveScenarioStepEditorDocument(input: {
  document: EditorDocument;
  projectId: string;
  stepId: string;
}): Promise<ScenarioStepEditorDocumentEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const rawExisting: unknown = await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, input.stepId);
    const existing = parseScenarioStepEditorDocumentEntry(rawExisting);
    const now = Date.now();

    if (!existing && rawExisting !== undefined) {
      logger.warn('Ignoring invalid scenario step editor document entry from IndexedDB', {
        stepId: input.stepId,
      });
    }

    const entry: ScenarioStepEditorDocumentEntry = {
      stepId: input.stepId,
      projectId: input.projectId,
      document: input.document,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await db.put(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, entry);
    return entry;
  });
}

export async function getScenarioStepEditorDocument(
  stepId: string
): Promise<ScenarioStepEditorDocumentEntry | undefined> {
  const db = await initDB();
  const rawEntry: unknown = await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, stepId);
  const entry = parseScenarioStepEditorDocumentEntry(rawEntry);

  if (!entry && rawEntry !== undefined) {
    logger.warn('Ignoring invalid scenario step editor document entry from IndexedDB', {
      stepId,
    });
  }

  return entry ?? undefined;
}

export async function listScenarioStepEditorDocuments(
  projectId: string
): Promise<ScenarioStepEditorDocumentEntry[]> {
  const db = await initDB();
  const rawEntries: unknown = await db.getAllFromIndex(
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    'projectId',
    projectId
  );
  const parsedEntries = parseScenarioStepEditorDocumentEntries(rawEntries);

  if (parsedEntries.hasInvalidRoot) {
    logger.warn('Ignoring invalid scenario step editor document list root from IndexedDB', {
      projectId,
    });
  }

  if (parsedEntries.invalidEntryCount > 0) {
    logger.warn('Dropped invalid scenario step editor document entries from IndexedDB list', {
      invalidEntryCount: parsedEntries.invalidEntryCount,
      projectId,
    });
  }

  return parsedEntries.entries;
}

export async function deleteScenarioStepEditorDocument(stepId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, stepId));
}

export { parseScenarioStepEditorDocumentEntry } from './index.guards.ts';
