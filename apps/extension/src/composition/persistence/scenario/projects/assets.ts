import {
  initDB,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
} from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parsePendingScenarioAssetEntry, parseScenarioAssetEntry } from '../read-guards';
import type { PendingScenarioAssetEntry, ScenarioAssetEntry } from '../contracts';

export async function saveScenarioAsset(entry: ScenarioAssetEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(SCENARIO_ASSETS_STORE, entry));
}

export async function getScenarioAsset(id: string): Promise<ScenarioAssetEntry | undefined> {
  const db = await initDB();
  return parseScenarioAssetEntry(await db.get(SCENARIO_ASSETS_STORE, id)) ?? undefined;
}

export async function listScenarioAssets(projectId: string): Promise<ScenarioAssetEntry[]> {
  const db = await initDB();
  return parseDbEntries(
    await db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', projectId),
    parseScenarioAssetEntry
  );
}

export async function deleteScenarioAsset(id: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(SCENARIO_ASSETS_STORE, id));
}

export async function savePendingScenarioAsset(entry: PendingScenarioAssetEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(SCENARIO_PENDING_ASSETS_STORE, entry));
}

export async function getPendingScenarioAsset(
  id: string
): Promise<PendingScenarioAssetEntry | undefined> {
  const db = await initDB();
  return (
    parsePendingScenarioAssetEntry(await db.get(SCENARIO_PENDING_ASSETS_STORE, id)) ?? undefined
  );
}

export async function listPendingScenarioAssets(): Promise<PendingScenarioAssetEntry[]> {
  const db = await initDB();
  return parseDbEntries(
    await db.getAll(SCENARIO_PENDING_ASSETS_STORE),
    parsePendingScenarioAssetEntry
  );
}

export async function deletePendingScenarioAsset(id: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(SCENARIO_PENDING_ASSETS_STORE, id));
}
