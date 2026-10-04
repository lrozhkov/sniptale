import {
  initDB,
  SCENARIO_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
} from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioExportEntry } from '../read-guards';
import type { ScenarioExportEntry } from '../contracts';
import { normalizeHtmlExportFilename } from '../../../../features/file-naming/rules';
import { recoverScenarioHtmlPublications, unlinkScenarioHtmlOwnership } from '../export-artifacts';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../../assets';

/** Reloads the selected row inside its atomic mutation; resources and lifecycle remain intact. */
export async function renameScenarioHtmlExport(id: string, filename: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(SCENARIO_EXPORTS_STORE, 'readwrite');
    try {
      const entry = parseScenarioExportEntry(await tx.store.get(id));
      if (!entry || entry.format !== 'html' || entry.trashState?.trashedAt !== undefined) {
        tx.abort();
        throw new Error('Scenario HTML export is unavailable.');
      }
      await tx.store.put({
        ...entry,
        filename: normalizeHtmlExportFilename(filename, entry.filename),
      });
      await tx.done;
    } finally {
      await tx.done.catch(() => undefined);
    }
  });
}

export async function saveScenarioExport(entry: ScenarioExportEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(SCENARIO_EXPORTS_STORE, entry));
}

export async function listScenarioExports(projectId: string): Promise<ScenarioExportEntry[]> {
  const db = await initDB();
  return parseDbEntries(
    await db.getAllFromIndex(SCENARIO_EXPORTS_STORE, 'projectId', projectId),
    parseScenarioExportEntry
  );
}

export async function deleteScenarioExport(id: string): Promise<void> {
  await recoverScenarioHtmlPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [SCENARIO_EXPORTS_STORE, ASSET_REFS_STORE, ASSET_OWNERS_STORE, ASSET_OPERATIONS_STORE],
      'readwrite'
    );
    await unlinkScenarioHtmlOwnership(
      id,
      {
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
      physicalDelete
    );
    await tx.objectStore(SCENARIO_EXPORTS_STORE).delete(id);
    if (physicalDelete.assetIds.length)
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    await tx.done;
  });
  if (physicalDelete.assetIds.length)
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
}
