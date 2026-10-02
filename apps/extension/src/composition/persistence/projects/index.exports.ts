import { deleteUnreferencedMediaSource } from '../media-library/delete-cascade';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import { parseRecordingMetadata } from '../../../features/media-hub/recording-metadata';
import { ASSET_REFS_STORE, initDB, PROJECT_EXPORTS_STORE } from '../infrastructure/indexed-db/core';
import {
  assertAssetWriteAdmission,
  createAssetPublicationJournal,
  discardPreparedAsset,
  parseAssetRef,
  publishReadyJournalWithRetry,
  readAssetFile,
  releaseAssetReadyProtection,
  writeBlobToAsset,
  type PreparedAssetObject,
} from '../assets';
import { createProjectExportMediaId } from '../../../features/media-hub/media-id';
import type { HydratedProjectExportEntry, StoredProjectExportEntry } from './contracts';
import { parseProjectExportEntry } from './read-guards';
import { parseDbEntries } from '../infrastructure/indexed-db/read-primitives';
import {
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
  publishProjectExportJournal,
  recoverProjectMediaPublications,
  type ProjectExportPublicationPayload,
} from './asset-publication';

export type SaveProjectExportInput = Omit<StoredProjectExportEntry, 'assetId' | 'size'> & {
  blob?: Blob;
  preparedAsset?: PreparedAssetObject;
};

function validateProjectExportInput(input: SaveProjectExportInput): void {
  if (input.recordingMetadata !== undefined && !parseRecordingMetadata(input.recordingMetadata)) {
    throw new Error('Export acquisition metadata is invalid.');
  }
  if ((input.blob ? 1 : 0) + (input.preparedAsset ? 1 : 0) !== 1) {
    throw new Error('Project export must provide exactly one binary source.');
  }
}

export async function saveProjectExport(input: SaveProjectExportInput): Promise<void> {
  await commitProjectExport(input);
}

export async function commitProjectExport(input: SaveProjectExportInput): Promise<void> {
  validateProjectExportInput(input);
  // Supplied staging objects already hold a transition lease; recovery cannot
  // wait for that lease while publication is waiting for recovery.
  let expectedAssetId: string | null = null;
  if (!input.preparedAsset) {
    await recoverProjectMediaPublications();
    const sourceDb = await initDB();
    const rawPrevious: unknown = await sourceDb.get(PROJECT_EXPORTS_STORE, input.id);
    const previous = parseProjectExportEntry(rawPrevious);
    if (rawPrevious !== undefined && (!previous || previous.id !== input.id))
      throw new Error('Invalid existing project export.');
    expectedAssetId = previous?.assetId ?? null;
  }
  if (input.blob) await assertAssetWriteAdmission(input.blob.size);
  const prepared =
    input.preparedAsset ??
    (await writeBlobToAsset(input.blob!, {
      mimeType: input.mimeType || input.blob!.type || 'video/webm',
    }));
  const entry: StoredProjectExportEntry = {
    assetId: prepared.ref.assetId,
    createdAt: input.createdAt,
    duration: input.duration,
    filename: input.filename,
    fps: input.fps,
    height: input.height,
    id: input.id,
    projectId: input.projectId,
    size: prepared.ref.size,
    width: input.width,
    ...(input.format ? { format: input.format } : {}),
    mimeType: prepared.ref.mimeType,
    ...(input.recordingMetadata
      ? { recordingMetadata: parseRecordingMetadata(input.recordingMetadata)! }
      : {}),
  };
  let journalCreated = false;
  try {
    const payload: ProjectExportPublicationPayload = { entry, expectedAssetId };
    const journal = await createAssetPublicationJournal({
      assetRefs: [prepared.ref],
      domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
      payload,
    });
    journalCreated = true;
    await publishReadyJournalWithRetry(journal, publishProjectExportJournal);
    if (input.blob) await releaseAssetReadyProtection([prepared.ref.assetId]);
  } catch (error) {
    if (!journalCreated) await discardPreparedAsset(prepared.ref.assetId);
    throw error;
  }
}

export async function getProjectExport(
  id: string
): Promise<HydratedProjectExportEntry | undefined> {
  const db = await initDB();
  const entry = parseProjectExportEntry(await db.get(PROJECT_EXPORTS_STORE, id));
  if (!entry) return undefined;
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, entry.assetId));
  if (!ref) return undefined;
  try {
    return { ...entry, file: await readAssetFile(ref, entry.filename) };
  } catch {
    return undefined;
  }
}

export async function listProjectExports(projectId: string): Promise<StoredProjectExportEntry[]> {
  const db = await initDB();
  const entries = await db.getAllFromIndex(PROJECT_EXPORTS_STORE, 'projectId', projectId);
  return parseDbEntries(entries, parseProjectExportEntry);
}

export async function listAllProjectExports(): Promise<StoredProjectExportEntry[]> {
  const db = await initDB();
  return parseDbEntries(await db.getAll(PROJECT_EXPORTS_STORE), parseProjectExportEntry);
}

export async function deleteProjectExport(id: string): Promise<void> {
  await recoverProjectMediaPublications();
  const db = await initDB();
  const raw: unknown = await db.get(PROJECT_EXPORTS_STORE, id);
  if (raw === undefined) return;
  const entry = parseProjectExportEntry(raw);
  if (!entry || entry.id !== id) throw new MediaAssetDeletionBlockedError('source-unavailable');
  await deleteUnreferencedMediaSource({
    id: createProjectExportMediaId(id),
    source: { kind: 'project-export', exportId: id, projectId: entry.projectId },
  });
}
