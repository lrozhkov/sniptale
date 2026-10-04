import {
  initDB,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  ASSET_REFS_STORE,
} from '../../infrastructure/indexed-db/core';
import { parseScenarioProjectEntry, parseScenarioAssetEntry } from '../read-guards';
import { parseAssetRef, readAssetFile } from '../../assets';

/** Reads one committed document without publication recovery or editor writes. */
export async function readScenarioViewingSnapshot(id: string) {
  const db = await initDB();
  const entry = parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, id));
  if (
    !entry ||
    entry.lifecycle?.trashedAt !== undefined ||
    entry.project.purpose === 'step-template'
  )
    return null;
  return { project: entry.project, revision: entry.workspaceRevision };
}

/** Reads only published immutable media belonging to the selected scenario. */
export async function readScenarioViewingAsset(
  projectId: string,
  id: string
): Promise<Blob | undefined> {
  const db = await initDB();
  const tx = db.transaction([SCENARIO_ASSETS_STORE, ASSET_REFS_STORE], 'readonly');
  const entry = parseScenarioAssetEntry(await tx.objectStore(SCENARIO_ASSETS_STORE).get(id));
  if (!entry || entry.projectId !== projectId) return undefined;
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(entry.assetId));
  await tx.done;
  if (!ref) return undefined;
  const file = await readAssetFile(ref, id);
  return file.type ? file : file.slice(0, file.size, entry.mimeType);
}
