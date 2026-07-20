import type { BackupBlobDescriptor, ScenarioBackupProjectDescriptor } from '../contracts/types';

export function assertScenarioExportThumbnailOwnership(
  descriptor: Pick<ScenarioBackupProjectDescriptor, 'exportThumbnails' | 'exports'>
): void {
  if (!descriptor.exportThumbnails) {
    return;
  }

  const exportThumbnailIds = new Set(
    descriptor.exports.map((entry) => `scenario-export:${entry.id}`)
  );
  for (const thumbnail of descriptor.exportThumbnails) {
    if (!exportThumbnailIds.has(readScenarioExportThumbnailAssetId(thumbnail))) {
      throw new Error('Invalid scenario export thumbnail backup metadata.');
    }
  }
}

function readScenarioExportThumbnailAssetId(descriptor: BackupBlobDescriptor): string {
  const { entry } = descriptor;
  if ('assetId' in entry && typeof entry.assetId === 'string') {
    return entry.assetId;
  }

  throw new Error('Invalid scenario export thumbnail backup metadata.');
}
