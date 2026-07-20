import type JSZip from 'jszip';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';
import type {
  MediaHubBackupMetadata,
  MediaHubImportConflictStrategy,
  MediaHubImportResult,
} from '../contracts/types';
import { withMediaHubWriteGuard } from '../../../features/media-hub/storage-errors';
import { type BackupImportAssetPlan, prepareBackupImportAsset } from './prepare';
import { prepareProjectDomains } from './project/prepare';
import { restorePreparedImportPlan } from './batches';

type RestoreCounters = {
  changedIds: string[];
  conflictsResolved: number;
  assetPlans: BackupImportAssetPlan[];
  skipped: number;
};

interface ProjectOwnedMediaMirrors {
  projectAssetIds: Set<string>;
  projectExportIds: Set<string>;
}

function collectProjectOwnedMediaMirrors(
  metadata: MediaHubBackupMetadata
): ProjectOwnedMediaMirrors {
  const projectAssetIds = new Set<string>();
  const projectExportIds = new Set<string>();

  for (const project of metadata.videoProjects ?? []) {
    for (const asset of project.projectAssets) {
      if ('id' in asset.entry && typeof asset.entry.id === 'string') {
        projectAssetIds.add(asset.entry.id);
      }
    }
    for (const projectExport of project.projectExports) {
      projectExportIds.add(projectExport.entry.id);
    }
  }

  return { projectAssetIds, projectExportIds };
}

function isProjectOwnedMediaMirror(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  mirrors: ProjectOwnedMediaMirrors
): boolean {
  if (entry.source.kind === 'project-export') {
    return mirrors.projectExportIds.has(entry.source.exportId);
  }
  if (entry.source.kind === 'project-asset') {
    return mirrors.projectAssetIds.has(entry.source.projectAssetId);
  }
  return false;
}

async function prepareImportAssets(args: {
  metadata: MediaHubBackupMetadata;
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>;
  strategy: MediaHubImportConflictStrategy;
  zip: JSZip;
}): Promise<Pick<RestoreCounters, 'changedIds' | 'conflictsResolved' | 'assetPlans' | 'skipped'>> {
  const changedIds: string[] = [];
  const assetPlans: BackupImportAssetPlan[] = [];
  const projectOwnedMirrors = collectProjectOwnedMediaMirrors(args.metadata);
  let conflictsResolved = 0;
  let skipped = 0;

  for (const asset of args.metadata.assets) {
    if (isProjectOwnedMediaMirror(asset.entry, projectOwnedMirrors)) {
      continue;
    }

    const { prepared, resolvedConflict } = await prepareBackupImportAsset({
      asset,
      remapEntryForDuplicate: args.remapEntryForDuplicate,
      strategy: args.strategy,
      zip: args.zip,
    });

    if (!prepared) {
      skipped += 1;
      continue;
    }

    if (resolvedConflict) {
      conflictsResolved += 1;
    }

    assetPlans.push(prepared);
    changedIds.push(prepared.nextEntry.id);
  }

  return { changedIds, conflictsResolved, assetPlans, skipped };
}

export async function importMediaHubBackupAssets(args: {
  metadata: MediaHubBackupMetadata;
  remapEntryForDuplicate: (
    entry: Omit<MediaLibraryEntry, 'blob'>
  ) => Omit<MediaLibraryEntry, 'blob'>;
  strategy: MediaHubImportConflictStrategy;
  zip: JSZip;
}): Promise<MediaHubImportResult> {
  const counters: RestoreCounters = {
    changedIds: [],
    conflictsResolved: 0,
    assetPlans: [],
    skipped: 0,
  };
  let imported = 0;

  await withMediaHubWriteGuard(translate('shared.mediaHub.importBackupAction'), async () => {
    const prepared = await prepareImportAssets(args);
    counters.changedIds = prepared.changedIds;
    counters.conflictsResolved = prepared.conflictsResolved;
    counters.assetPlans = prepared.assetPlans;
    counters.skipped = prepared.skipped;
    const preparedProjectDomains = await prepareProjectDomains(args);
    counters.changedIds.push(...preparedProjectDomains.changedIds);
    counters.conflictsResolved += preparedProjectDomains.conflictsResolved;
    counters.skipped += preparedProjectDomains.skipped;
    imported = await restorePreparedImportPlan({
      assetPlans: prepared.assetPlans,
      preparedProjectDomains,
      strategy: args.strategy,
      zip: args.zip,
    });
  });

  if (counters.changedIds.length > 0) {
    publishMediaHubLibraryChanged('import', counters.changedIds);
  }

  return {
    conflictsResolved: counters.conflictsResolved,
    imported,
    skipped: counters.skipped,
  };
}
