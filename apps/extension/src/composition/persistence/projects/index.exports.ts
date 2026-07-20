import {
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_EXPORTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  buildProjectExportMediaEntry,
  buildRecordingMediaEntry,
} from '../media-library/entry-mapping';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { getRecording } from '../recordings/index';
import type { ProjectExportEntry } from './contracts';
import { parseProjectExportEntry } from './read-guards';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';

export async function saveProjectExport(entry: ProjectExportEntry): Promise<void> {
  await commitProjectExport(entry);
}

export async function commitProjectExport(entry: ProjectExportEntry): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([PROJECT_EXPORTS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    await tx.objectStore(PROJECT_EXPORTS_STORE).put(entry);
    await mediaStore.delete(createRecordingMediaId(entry.recordingId));
    await mediaStore.put(buildProjectExportMediaEntry(entry));
    await tx.done;
  });
}

export async function getProjectExport(id: string): Promise<ProjectExportEntry | undefined> {
  const db = await initDB();
  return parseProjectExportEntry(await db.get(PROJECT_EXPORTS_STORE, id)) ?? undefined;
}

export async function listProjectExports(projectId: string): Promise<ProjectExportEntry[]> {
  const db = await initDB();
  const entries = await db.getAllFromIndex(PROJECT_EXPORTS_STORE, 'projectId', projectId);
  return parseDbEntries(entries, parseProjectExportEntry);
}

export async function listAllProjectExports(): Promise<ProjectExportEntry[]> {
  const db = await initDB();
  return parseDbEntries(await db.getAll(PROJECT_EXPORTS_STORE), parseProjectExportEntry);
}

export async function deleteProjectExport(id: string): Promise<void> {
  const db = await initDB();
  const existing = parseProjectExportEntry(await db.get(PROJECT_EXPORTS_STORE, id));
  const recording = existing ? await getRecording(existing.recordingId) : undefined;
  await runWithIndexedDbMutation(async (mutationDb) => {
    const tx = mutationDb.transaction([PROJECT_EXPORTS_STORE, MEDIA_LIBRARY_STORE], 'readwrite');
    await tx.objectStore(PROJECT_EXPORTS_STORE).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(`export:${id}`);
    if (recording)
      await tx.objectStore(MEDIA_LIBRARY_STORE).put(buildRecordingMediaEntry(recording));
    await tx.done;
  });
}
