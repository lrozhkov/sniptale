import { MEDIA_LIBRARY_STORE, THUMBNAILS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { collectReferencedProjectAssetIds } from '../../../features/media-hub/references';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
  buildRecordingMediaEntry,
  mergeMediaEntry,
} from './entry-mapping';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import {
  listAllProjectExports,
  listProjectAssets,
  listVideoProjectReadResults,
} from '../projects/index';
import { listRecordings } from '../recordings/index';
import type { MediaLibraryEntry } from './contracts';

interface LegacyMediaStore {
  delete(key: string): Promise<void>;
  put(value: MediaLibraryEntry): Promise<IDBValidKey>;
}

interface LegacyThumbnailStore {
  delete(key: string): Promise<void>;
}

function shouldDeleteStaleManagedEntry(entry: MediaLibraryEntry, desiredIds: Set<string>): boolean {
  if (entry.source.kind === 'screenshot') {
    return false;
  }

  return !desiredIds.has(entry.id);
}

export async function syncLegacyMediaLibrary(): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const [recordings, projectExports, projectAssets, currentEntries, projectDetails] =
      await Promise.all([
        listRecordings(),
        listAllProjectExports(),
        listProjectAssets(),
        db.getAll(MEDIA_LIBRARY_STORE) as Promise<MediaLibraryEntry[]>,
        listVideoProjectReadResults(),
      ]);
    const readyProjectDetails = projectDetails.flatMap((result) =>
      result.status === 'ready' ? [result.project] : []
    );
    const currentMap = new Map(currentEntries.map((entry) => [entry.id, entry]));
    const desiredManagedIds = new Set<string>();
    const tx = db.transaction([MEDIA_LIBRARY_STORE, THUMBNAILS_STORE], 'readwrite');
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const thumbnailsStore = tx.objectStore(THUMBNAILS_STORE);

    await syncRecordingMirrors({
      currentMap,
      desiredManagedIds,
      exportRecordingIds: new Set(projectExports.map((entry) => entry.recordingId)),
      mediaStore,
      recordings,
      thumbnailsStore,
    });
    await syncProjectExportMirrors({ currentMap, desiredManagedIds, mediaStore, projectExports });
    await syncProjectAssetMirrors({
      currentMap,
      desiredManagedIds,
      mediaStore,
      projectAssets,
      referencedProjectAssetIds: collectReferencedProjectAssetIds(readyProjectDetails),
    });
    await deleteStaleManagedMirrors({
      currentEntries,
      desiredManagedIds,
      mediaStore,
      thumbnailsStore,
    });
    await tx.done;
  });
}

async function syncRecordingMirrors(args: {
  currentMap: Map<string, MediaLibraryEntry>;
  desiredManagedIds: Set<string>;
  exportRecordingIds: Set<string>;
  mediaStore: LegacyMediaStore;
  recordings: Awaited<ReturnType<typeof listRecordings>>;
  thumbnailsStore: LegacyThumbnailStore;
}): Promise<void> {
  for (const recording of args.recordings) {
    if (args.exportRecordingIds.has(recording.id)) {
      await args.mediaStore.delete(createRecordingMediaId(recording.id));
      await args.thumbnailsStore.delete(createRecordingMediaId(recording.id));
      continue;
    }

    const baseEntry = buildRecordingMediaEntry(recording);
    args.desiredManagedIds.add(baseEntry.id);
    await args.mediaStore.put(mergeMediaEntry(args.currentMap.get(baseEntry.id), baseEntry));
  }
}

async function syncProjectExportMirrors(args: {
  currentMap: Map<string, MediaLibraryEntry>;
  desiredManagedIds: Set<string>;
  mediaStore: LegacyMediaStore;
  projectExports: Awaited<ReturnType<typeof listAllProjectExports>>;
}): Promise<void> {
  for (const projectExport of args.projectExports) {
    const baseEntry = buildProjectExportMediaEntry(projectExport);
    args.desiredManagedIds.add(baseEntry.id);
    await args.mediaStore.put(mergeMediaEntry(args.currentMap.get(baseEntry.id), baseEntry));
  }
}

async function syncProjectAssetMirrors(args: {
  currentMap: Map<string, MediaLibraryEntry>;
  desiredManagedIds: Set<string>;
  mediaStore: LegacyMediaStore;
  projectAssets: Awaited<ReturnType<typeof listProjectAssets>>;
  referencedProjectAssetIds: Set<string>;
}): Promise<void> {
  for (const projectAsset of args.projectAssets) {
    if (args.referencedProjectAssetIds.has(projectAsset.id)) {
      continue;
    }

    const baseEntry = {
      ...buildProjectAssetMediaEntry(projectAsset),
      filename: projectAsset.filename,
      originalFilename: projectAsset.filename,
    };
    args.desiredManagedIds.add(baseEntry.id);
    await args.mediaStore.put(mergeMediaEntry(args.currentMap.get(baseEntry.id), baseEntry));
  }
}

async function deleteStaleManagedMirrors(args: {
  currentEntries: MediaLibraryEntry[];
  desiredManagedIds: Set<string>;
  mediaStore: LegacyMediaStore;
  thumbnailsStore: LegacyThumbnailStore;
}): Promise<void> {
  for (const entry of args.currentEntries) {
    if (!shouldDeleteStaleManagedEntry(entry, args.desiredManagedIds)) {
      continue;
    }

    await args.mediaStore.delete(entry.id);
    await args.thumbnailsStore.delete(entry.id);
  }
}
