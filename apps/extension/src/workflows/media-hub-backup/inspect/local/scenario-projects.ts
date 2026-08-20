import {
  SCENARIO_ASSETS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_EXPORTS_STORE,
  THUMBNAILS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  ScenarioExportEntry,
  ScenarioProjectEntry,
  StoredScenarioStepEditorDocumentEntry,
} from '../../../../composition/persistence/scenario/contracts';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import {
  countScenarioProjectEntrySourceMetadata,
  hasEditorDocumentSourceMetadata,
} from '../../export/privacy';
import { parseAssetRef, readAssetFile } from '../../../../composition/persistence/assets';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';

type LocalBackupDb = Awaited<ReturnType<typeof initDB>>;

interface ScenarioProjectBackupInspection {
  sizeBytes: number;
  sourceMetadataCount: number;
  thumbnails: MediaThumbnailEntry[];
}

function isMediaThumbnailEntry(value: unknown): value is MediaThumbnailEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'assetId' in value &&
    typeof value.assetId === 'string' &&
    'blob' in value &&
    value.blob instanceof Blob
  );
}

function getJsonSizeBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

export async function inspectScenarioProjectBackupEntries(
  db: LocalBackupDb,
  scenarioProjects: ScenarioProjectEntry[],
  stepDocuments: StoredScenarioStepEditorDocumentEntry[]
): Promise<ScenarioProjectBackupInspection> {
  const inventory: ScenarioProjectBackupInspection = {
    sizeBytes: stepDocuments.reduce((total, entry) => total + getJsonSizeBytes(entry), 0),
    sourceMetadataCount: countScenarioSourceMetadata(scenarioProjects, stepDocuments),
    thumbnails: [],
  };

  for (const project of scenarioProjects) {
    await inspectScenarioProjectEntry(db, project, inventory);
  }

  return inventory;
}

function countScenarioSourceMetadata(
  scenarioProjects: ScenarioProjectEntry[],
  stepDocuments: StoredScenarioStepEditorDocumentEntry[]
): number {
  return (
    scenarioProjects.reduce(
      (count, entry) => count + countScenarioProjectEntrySourceMetadata(entry),
      0
    ) + stepDocuments.filter((entry) => hasEditorDocumentSourceMetadata(entry.document)).length
  );
}

async function inspectScenarioProjectEntry(
  db: LocalBackupDb,
  project: ScenarioProjectEntry,
  inventory: ScenarioProjectBackupInspection
): Promise<void> {
  inventory.sizeBytes += getJsonSizeBytes(project);

  const rawAssets = await db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', project.id);
  for (const raw of rawAssets) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset) throw new Error(`Invalid scenario asset metadata: ${project.id}.`);
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, asset.assetId));
    if (!ref) throw new Error(`Scenario asset reference is missing: ${asset.id}.`);
    await readAssetFile(ref, asset.id);
    inventory.sizeBytes += ref.size;
  }

  const exports = (await db.getAllFromIndex(
    SCENARIO_EXPORTS_STORE,
    'projectId',
    project.id
  )) as ScenarioExportEntry[];
  for (const entry of exports) {
    const exportThumbnail = await getThumbnail(db, `scenario-export:${entry.id}`);
    if (exportThumbnail) {
      inventory.thumbnails.push(exportThumbnail);
    }
  }
}

async function getThumbnail(db: LocalBackupDb, key: string): Promise<MediaThumbnailEntry | null> {
  const thumbnail: unknown = await db.get(THUMBNAILS_STORE, key);
  return isMediaThumbnailEntry(thumbnail) ? thumbnail : null;
}
