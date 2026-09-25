import {
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { promoteLibraryLifecycle } from './contracts';
import { collectVideoProjectReferences } from './references';

type MutableStore = {
  get(key: string): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

export async function promoteLinkedRecordingLifecycles(args: {
  mediaStore: MutableStore;
  now: number;
  recordingIds: ReadonlySet<string>;
  recordingStore: MutableStore;
}): Promise<void> {
  for (const recordingId of args.recordingIds) {
    const recording = parseRecordingEntry(await args.recordingStore.get(recordingId));
    if (!recording) continue;
    if (recording.lifecycle?.storageClass === 'temporary') {
      await args.recordingStore.put({
        ...recording,
        lifecycle: promoteLibraryLifecycle(recording.lifecycle, args.now),
      });
    }

    const media = parseMediaLibraryEntry(
      await args.mediaStore.get(createRecordingMediaId(recordingId))
    );
    if (
      media?.source.kind === 'recording' &&
      media.source.recordingId === recordingId &&
      media.lifecycle?.storageClass === 'temporary'
    ) {
      await args.mediaStore.put({
        ...media,
        lifecycle: promoteLibraryLifecycle(media.lifecycle, args.now),
      });
    }
  }
}

export async function repairLinkedRecordingLifecycles(now = Date.now()): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([VIDEO_PROJECTS_STORE, STORE_NAME, MEDIA_LIBRARY_STORE], 'readwrite');
    const projectStore = tx.objectStore(VIDEO_PROJECTS_STORE);
    const recordingIds = new Set<string>();
    for (const raw of await projectStore.getAll()) {
      const project = parseVideoProjectEntry(raw);
      if (!project) continue;
      for (const id of collectVideoProjectReferences(project).recordingIds) recordingIds.add(id);
    }
    await promoteLinkedRecordingLifecycles({
      mediaStore: tx.objectStore(MEDIA_LIBRARY_STORE),
      now,
      recordingIds,
      recordingStore: tx.objectStore(STORE_NAME),
    });
    await tx.done;
  });
}
