import { createLogger } from '@sniptale/platform/observability/logger';
import {
  ASSET_REFS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  initDB,
} from '../../infrastructure/indexed-db/core';
import {
  hydratePersistedEditorDocument,
  materializePersistedEditorDocumentForLegacyTransfer,
} from '../../document-assets';
import {
  parseScenarioStepEditorDocumentEntries,
  parseScenarioStepEditorDocumentEntry,
} from './index.guards.ts';
import type {
  ScenarioStepEditorDocumentEntry,
  StoredScenarioStepEditorDocumentEntry,
} from '../contracts';
import { recoverScenarioAssetPublications } from '../aggregate-mutations';

const logger = createLogger({ namespace: 'SharedScenarioStepEditorDocumentsDb' });

async function hydrateEntry(
  entry: StoredScenarioStepEditorDocumentEntry
): Promise<ScenarioStepEditorDocumentEntry> {
  const db = await initDB();
  const refs = await Promise.all(
    entry.document.assets.map((asset) => db.get(ASSET_REFS_STORE, asset.assetId))
  );
  const hydrated = await hydratePersistedEditorDocument({ document: entry.document, refs });
  return { ...entry, document: hydrated.document, releaseDocumentAssets: hydrated.release };
}

export async function getScenarioStepEditorDocument(
  stepId: string
): Promise<ScenarioStepEditorDocumentEntry | undefined> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  const rawEntry: unknown = await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, stepId);
  const entry = parseScenarioStepEditorDocumentEntry(rawEntry);

  if (!entry && rawEntry !== undefined) {
    logger.warn('Ignoring invalid scenario step editor document entry from IndexedDB', {
      stepId,
    });
  }

  return entry ? hydrateEntry(entry) : undefined;
}

export async function getScenarioStepEditorDocumentForTransfer(
  stepId: string
): Promise<ScenarioStepEditorDocumentEntry | undefined> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  const entry = parseScenarioStepEditorDocumentEntry(
    await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, stepId)
  );
  if (!entry) return undefined;
  const refs = await Promise.all(
    entry.document.assets.map((asset) => db.get(ASSET_REFS_STORE, asset.assetId))
  );
  return {
    ...entry,
    document: await materializePersistedEditorDocumentForLegacyTransfer({
      document: entry.document,
      refs,
    }),
  };
}

export async function listStoredScenarioStepEditorDocuments(
  projectId: string
): Promise<StoredScenarioStepEditorDocumentEntry[]> {
  await recoverScenarioAssetPublications();
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

export async function listScenarioStepEditorDocuments(
  projectId: string
): Promise<ScenarioStepEditorDocumentEntry[]> {
  return Promise.all((await listStoredScenarioStepEditorDocuments(projectId)).map(hydrateEntry));
}

export { parseScenarioStepEditorDocumentEntry } from './index.guards.ts';
