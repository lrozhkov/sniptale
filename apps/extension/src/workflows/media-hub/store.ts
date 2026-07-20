import {
  addMediaLibraryEntryTags,
  deleteMediaLibraryAsset,
  saveScreenshotMediaAsset,
  updateMediaLibraryEntry,
  updateScreenshotMediaAsset,
} from '../../composition/persistence/media-library/index';
import { deleteRecording, saveRecording } from '../../composition/persistence/recordings/index';
import {
  deleteProjectExport,
  commitProjectExport,
  saveProjectAsset,
} from '../../composition/persistence/projects/index';
import { saveWebSnapshotMediaAsset } from '../../composition/persistence/web-snapshots';
import { saveRecordingTelemetry } from '../../composition/persistence/recordings/telemetry';
import type {
  MediaLibraryEntry,
  MediaLibraryItem,
  SaveScreenshotMediaAssetInput,
  SaveWebSnapshotMediaAssetInput,
} from '../../composition/persistence/media-library/contracts';
import type { ProjectExportEntry } from '../../composition/persistence/projects/contracts';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { isSafeArchiveEntryLeafFilename } from '@sniptale/platform/data/zip-profile/entry-filenames';
import { translate } from '../../platform/i18n';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { assertSafeProjectAssetStorageInput } from '../../features/media-hub/project-assets';
import { withMediaHubWriteGuard } from '../../features/media-hub/storage-errors';

export { deleteStorageCleanupCandidatesSafely, getStorageCleanupReport } from './store.cleanup';

function assertSafeMediaFilename(filename: string): void {
  if (!isSafeArchiveEntryLeafFilename(filename)) {
    throw new Error('Unsafe media filename.');
  }
}

function assertSafeOptionalMediaFilename(filename: string | undefined): void {
  if (filename !== undefined) {
    assertSafeMediaFilename(filename);
  }
}

export async function saveScreenshotMediaAssetSafely(
  input: SaveScreenshotMediaAssetInput
): Promise<MediaLibraryEntry> {
  assertSafeMediaFilename(input.filename);
  const entry = await withMediaHubWriteGuard(
    translate('shared.mediaHub.saveScreenshotAction'),
    () => saveScreenshotMediaAsset(input)
  );
  publishMediaHubLibraryChanged('create', [entry.id]);
  return entry;
}

export async function saveWebSnapshotMediaAssetSafely(
  input: SaveWebSnapshotMediaAssetInput
): Promise<{ assetId: string }> {
  assertSafeMediaFilename(input.filename);
  const result = await withMediaHubWriteGuard(
    translate('shared.mediaHub.saveWebSnapshotAction'),
    () => saveWebSnapshotMediaAsset(input)
  );
  publishMediaHubLibraryChanged('create', [result.assetId]);
  return { assetId: result.assetId };
}

export async function updateScreenshotMediaAssetSafely(
  assetId: string,
  blob: Blob,
  filename?: string
): Promise<MediaLibraryEntry> {
  assertSafeOptionalMediaFilename(filename);
  const entry = await withMediaHubWriteGuard(
    translate('shared.mediaHub.updateScreenshotAction'),
    () => updateScreenshotMediaAsset(assetId, blob, filename)
  );
  publishMediaHubLibraryChanged('update', [entry.id]);
  return entry;
}

export async function saveRecordingSafely(id: string, blob: Blob, filename: string): Promise<void> {
  assertSafeMediaFilename(filename);
  await withMediaHubWriteGuard(translate('shared.mediaHub.saveRecordingAction'), () =>
    saveRecording(id, blob, filename)
  );
  publishMediaHubLibraryChanged('create', [`recording:${id}`]);
}

export async function saveRecordingTelemetrySafely(entry: RecordingTelemetryEntry): Promise<void> {
  await withMediaHubWriteGuard(translate('shared.mediaHub.saveRecordingAction'), () =>
    saveRecordingTelemetry(entry)
  );
}

export async function saveProjectAssetSafely(
  id: string,
  blob: Blob,
  mimeType: string,
  filename = id
): Promise<void> {
  assertSafeMediaFilename(filename);
  assertSafeProjectAssetStorageInput(blob, mimeType);
  await withMediaHubWriteGuard(translate('shared.mediaHub.saveProjectAssetAction'), () =>
    saveProjectAsset(id, blob, mimeType, filename)
  );
  publishMediaHubLibraryChanged('create', [`project-asset:${id}`]);
}

export async function saveProjectExportSafely(entry: ProjectExportEntry): Promise<void> {
  assertSafeMediaFilename(entry.filename);
  await withMediaHubWriteGuard(translate('shared.mediaHub.saveProjectExportAction'), () =>
    commitProjectExport(entry)
  );
  publishMediaHubLibraryChanged('create', [`export:${entry.id}`]);
}

export async function deleteProjectExportSafely(id: string): Promise<void> {
  await withMediaHubWriteGuard(translate('shared.mediaHub.deleteProjectExportAction'), () =>
    deleteProjectExport(id)
  );
  publishMediaHubLibraryChanged('delete', [`export:${id}`]);
}

export async function updateMediaLibraryEntrySafely(
  assetId: string,
  patch: Partial<
    Pick<MediaLibraryEntry, 'filename' | 'tags' | 'sourceUrl' | 'sourceTitle' | 'sourceFavicon'>
  >
): Promise<void> {
  assertSafeOptionalMediaFilename(patch.filename);
  await withMediaHubWriteGuard(translate('shared.mediaHub.updateMediaMetadataAction'), () =>
    updateMediaLibraryEntry(assetId, patch)
  );
  publishMediaHubLibraryChanged('update', [assetId]);
}

export async function addMediaLibraryEntryTagsSafely(
  assetId: string,
  tagsToAdd: string[]
): Promise<void> {
  await withMediaHubWriteGuard(translate('shared.mediaHub.updateMediaMetadataAction'), () =>
    addMediaLibraryEntryTags(assetId, tagsToAdd)
  );
  publishMediaHubLibraryChanged('update', [assetId]);
}

export async function deleteMediaLibraryAssetsBatchSafely(assetIds: string[]): Promise<void> {
  await withMediaHubWriteGuard(translate('shared.mediaHub.deleteMediaBatchAction'), async () => {
    for (const assetId of assetIds) {
      await deleteMediaLibraryAsset(assetId);
    }
  });
  publishMediaHubLibraryChanged('delete', assetIds);
}

export async function deleteOrphanedRawRecordingsSafely(recordingIds: string[]): Promise<void> {
  await withMediaHubWriteGuard(
    translate('shared.mediaHub.cleanupOrphanedRecordingsAction'),
    async () => {
      for (const recordingId of recordingIds) {
        await deleteRecording(recordingId);
      }
    }
  );
  publishMediaHubLibraryChanged(
    'cleanup',
    recordingIds.map((recordingId) => `recording:${recordingId}`)
  );
}

export function filterMediaItemsByTags(
  items: MediaLibraryItem[],
  activeTags: string[]
): MediaLibraryItem[] {
  if (activeTags.length === 0) {
    return items;
  }

  return items.filter((item) => activeTags.every((tag) => item.tags.includes(tag)));
}
