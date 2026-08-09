import { createLogger } from '@sniptale/platform/observability/logger';
import { SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, initDB } from '../../infrastructure/indexed-db/core';
import {
  parseScenarioStepEditorDocumentEntries,
  parseScenarioStepEditorDocumentEntry,
} from './index.guards.ts';
import type { ScenarioStepEditorDocumentEntry } from '../contracts';

const logger = createLogger({ namespace: 'SharedScenarioStepEditorDocumentsDb' });

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

export { parseScenarioStepEditorDocumentEntry } from './index.guards.ts';
