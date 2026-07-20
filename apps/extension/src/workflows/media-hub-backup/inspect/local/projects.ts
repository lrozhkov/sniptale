import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type {
  ScenarioProjectEntry,
  ScenarioStepEditorDocumentEntry,
} from '../../../../composition/persistence/scenario/contracts';
import type { VideoProjectEntry } from '../../../../composition/persistence/projects/contracts';
import type { initDB } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaHubBackupExportOptions } from '../../contracts/types';
import { inspectScenarioProjectBackupEntries } from './scenario-projects';
import { inspectVideoProjectBackupEntries } from './video-projects';

type LocalBackupDb = Awaited<ReturnType<typeof initDB>>;

interface LocalBackupProjectInspection {
  recordingCount: number;
  sizeBytes: number;
  sourceMetadataCount: number;
  telemetryCount: number;
  thumbnails: MediaThumbnailEntry[];
}

export async function inspectProjectOwnedBackupEntries(args: {
  db: LocalBackupDb;
  options: MediaHubBackupExportOptions;
  scenarioProjects: ScenarioProjectEntry[];
  stepDocuments: ScenarioStepEditorDocumentEntry[];
  videoProjects: VideoProjectEntry[];
}): Promise<LocalBackupProjectInspection> {
  const videoInventory = await inspectVideoProjectBackupEntries(
    args.db,
    args.videoProjects,
    args.options
  );
  const scenarioInventory = await inspectScenarioProjectBackupEntries(
    args.db,
    args.scenarioProjects,
    args.stepDocuments
  );

  return {
    recordingCount: videoInventory.recordingCount,
    sizeBytes: videoInventory.sizeBytes + scenarioInventory.sizeBytes,
    sourceMetadataCount: scenarioInventory.sourceMetadataCount,
    telemetryCount: videoInventory.telemetryCount,
    thumbnails: [...videoInventory.thumbnails, ...scenarioInventory.thumbnails],
  };
}
