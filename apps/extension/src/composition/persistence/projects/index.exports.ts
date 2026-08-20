import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_EXPORTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  assertAssetWriteAdmission,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
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
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
  PROJECT_MEDIA_ASSET_ROLE,
  publishProjectExportJournal,
  recoverProjectMediaPublications,
  type ProjectExportPublicationPayload,
} from './asset-publication';

export type SaveProjectExportInput = Omit<StoredProjectExportEntry, 'assetId' | 'size'> & {
  blob?: Blob;
  preparedAsset?: PreparedAssetObject;
};

function validateProjectExportInput(input: SaveProjectExportInput): void {
  if ((input.blob ? 1 : 0) + (input.preparedAsset ? 1 : 0) !== 1) {
    throw new Error('Project export must provide exactly one binary source.');
  }
}

export async function saveProjectExport(input: SaveProjectExportInput): Promise<void> {
  await commitProjectExport(input);
}

export async function commitProjectExport(input: SaveProjectExportInput): Promise<void> {
  validateProjectExportInput(input);
  await recoverProjectMediaPublications();
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
  };
  let journalCreated = false;
  try {
    const payload: ProjectExportPublicationPayload = { entry };
    const journal = await createAssetPublicationJournal({
      assetRefs: [prepared.ref],
      domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
      payload,
    });
    journalCreated = true;
    await publishReadyJournalWithRetry(journal, publishProjectExportJournal);
    if (input.blob) releaseAssetReadyProtection([prepared.ref.assetId]);
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
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        PROJECT_EXPORTS_STORE,
        MEDIA_LIBRARY_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const entry = parseProjectExportEntry(await tx.objectStore(PROJECT_EXPORTS_STORE).get(id));
    await tx.objectStore(PROJECT_EXPORTS_STORE).delete(id);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(createProjectExportMediaId(id));
    if (entry) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete([PROJECT_EXPORT_OWNER_KIND, id, PROJECT_MEDIA_ASSET_ROLE]);
      if ((await ownerStore.index('assetId').count(entry.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(entry.assetId);
        physicalDelete.assetIds.push(entry.assetId);
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
}
