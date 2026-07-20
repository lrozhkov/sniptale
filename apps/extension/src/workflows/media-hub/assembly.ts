import {
  DIAGNOSTICS_META_STORE,
  EDITOR_SESSIONS_STORE,
  initDB,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PENDING_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import {
  listAllProjectExports,
  listProjectAssets,
  listVideoProjectReadResults,
} from '../../composition/persistence/projects/index';
import { listMediaLibrary } from '../../composition/persistence/media-library/index';
import { listRecordings } from '../../composition/persistence/recordings/index';
import { parseDbEntries } from '../../composition/persistence/infrastructure/indexed-db/read-primitives';
import {
  parsePendingScenarioAssetEntry,
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../../composition/persistence/scenario/read-guards';

import type { StorageCleanupReport } from '../../features/media-hub/types';
import { buildCleanupCandidates } from './cleanup';
import type { StorageCleanupInventory } from './cleanup.inventory.ts';
import { buildStorageCleanupReport } from '../../features/media-hub/report';

async function loadStorageCleanupInventory(): Promise<StorageCleanupInventory> {
  const db = await initDB();
  const [
    diagnostics,
    editorSessions,
    pendingScenarioAssets,
    scenarioAssets,
    scenarioExports,
    scenarioProjects,
    scenarioStepDocuments,
    thumbnails,
    videoProjects,
    webSnapshots,
  ] = await Promise.all([
    db.getAll(DIAGNOSTICS_META_STORE),
    db.getAll(EDITOR_SESSIONS_STORE),
    db.getAll(SCENARIO_PENDING_ASSETS_STORE),
    db.getAll(SCENARIO_ASSETS_STORE),
    db.getAll(SCENARIO_EXPORTS_STORE),
    db.getAll(SCENARIO_PROJECTS_STORE),
    db.getAll(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
    db.getAll(THUMBNAILS_STORE),
    db.getAll(VIDEO_PROJECTS_STORE),
    db.getAll(WEB_SNAPSHOTS_STORE),
  ]);

  return {
    diagnostics: diagnostics as StorageCleanupInventory['diagnostics'],
    editorSessions: editorSessions as StorageCleanupInventory['editorSessions'],
    pendingScenarioAssets: parseDbEntries(pendingScenarioAssets, parsePendingScenarioAssetEntry),
    scenarioAssets: parseDbEntries(scenarioAssets, parseScenarioAssetEntry),
    scenarioExports: parseDbEntries(scenarioExports, parseScenarioExportEntry),
    scenarioProjects: parseDbEntries(scenarioProjects, parseScenarioProjectEntry),
    scenarioStepDocuments:
      scenarioStepDocuments as StorageCleanupInventory['scenarioStepDocuments'],
    thumbnails: thumbnails as StorageCleanupInventory['thumbnails'],
    videoProjects: videoProjects as StorageCleanupInventory['videoProjects'],
    webSnapshots: webSnapshots as NonNullable<StorageCleanupInventory['webSnapshots']>,
  };
}

export async function collectStorageCleanupReport(topN = 10): Promise<StorageCleanupReport> {
  const [mediaItems, recordings, projectExports, projectAssets, projectDetails, rawInventory] =
    await Promise.all([
      listMediaLibrary(),
      listRecordings(),
      listAllProjectExports(),
      listProjectAssets(),
      listVideoProjectReadResults(),
      loadStorageCleanupInventory(),
    ]);
  const normalizedProjectDetails = projectDetails.flatMap((detail) =>
    detail.status === 'ready' ? [detail.project] : []
  );

  const candidates = buildCleanupCandidates({
    mediaItems,
    recordings,
    projectAssets,
    projectExports,
    projectDetails: normalizedProjectDetails,
    rawInventory,
    topN,
  });

  return buildStorageCleanupReport({
    ...candidates,
    topN,
  });
}
