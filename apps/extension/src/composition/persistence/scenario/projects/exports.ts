import { initDB, SCENARIO_EXPORTS_STORE } from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioExportEntry } from '../read-guards';
import type { ScenarioExportEntry } from '../contracts';

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
  await runWithIndexedDbMutation((db) => db.delete(SCENARIO_EXPORTS_STORE, id));
}
