import { openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { initDB } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  readAssetFile,
  listReadyJournals,
} from '../../../../apps/extension/src/composition/persistence/assets/opfs-store';
import {
  buildRecordingMediaEntry,
  buildProjectExportMediaEntry,
} from '../../../../apps/extension/src/composition/persistence/media-library/entry-mapping';
import {
  readLibraryProjectBindingSource,
  prepareLibraryProjectBinding,
} from '../../../../apps/extension/src/composition/persistence/projects/library-project-binding';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { ensureLibraryMediaAssets } from '../../../../apps/extension/src/video-editor/project/operations/assets';
import {
  saveVideoProject,
  getProjectAsset,
} from '../../../../apps/extension/src/composition/persistence/projects';
import {
  createAssetPublicationJournal,
  cancelAssetPublication,
} from '../../../../apps/extension/src/composition/persistence/assets/publication';
import {
  publishProjectAssetJournal,
  projectAssetPublicationAdapter,
  recoverProjectMediaPublications,
} from '../../../../apps/extension/src/composition/persistence/projects/asset-publication';
import type { ProjectAssetPublicationPayload } from '../../../../apps/extension/src/composition/persistence/projects/asset-publication-payload';

const assetId = 'known-audio-body';
function wave() {
  const bytes = new Uint8Array(44 + 9600);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    new TextEncoder().encodeInto(value, bytes.subarray(offset));
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, 9600, true);
  for (let i = 0; i < 4800; i++)
    view.setInt16(44 + i * 2, Math.round(Math.sin((i * 440 * 2 * Math.PI) / 48000) * 1000), true);
  return bytes;
}

/** Seeds one real immutable object, with two independent supported logical sources. */
export async function seed() {
  const bytes = wave();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const root = await navigator.storage.getDirectory();
  const objects = await (
    await root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true })
  ).getDirectoryHandle('objects', { create: true });
  const writable = await (await objects.getFileHandle(assetId, { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const recording = {
    id: 'mic',
    assetId,
    filename: 'microphone.wav',
    mimeType: 'audio/wav',
    size: bytes.length,
    createdAt: 1,
  };
  const exported = {
    id: 'audio',
    assetId,
    projectId: 'origin',
    filename: 'export.wav',
    mimeType: 'audio/wav',
    size: bytes.length,
    createdAt: 1,
    duration: 0.1,
    width: 0,
    height: 0,
    fps: 30,
  };
  try {
    const tx = db.transaction(
      ['recordings', 'project_exports', 'media_library', 'asset_refs', 'asset_owners'],
      'readwrite'
    );
    await tx.objectStore('recordings').put(recording);
    await tx.objectStore('project_exports').put(exported);
    await tx.objectStore('media_library').put(buildRecordingMediaEntry(recording));
    await tx.objectStore('media_library').put(buildProjectExportMediaEntry(exported));
    await tx.objectStore('asset_refs').put({
      assetId,
      mimeType: 'audio/wav',
      size: bytes.length,
      createdAt: 1,
      sha256,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    });
    await tx
      .objectStore('asset_owners')
      .put({ assetId, ownerKind: 'recording', ownerId: 'mic', role: 'body' });
    await tx
      .objectStore('asset_owners')
      .put({ assetId, ownerKind: 'project-export', ownerId: 'audio', role: 'body' });
    await tx.done;
  } finally {
    db.close();
  }
  await initDB();
  return { bytes: bytes.length, sha256 };
}

async function objectsState() {
  const db = await initDB();
  const root = await navigator.storage.getDirectory();
  const directory = await (
    await root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME)
  ).getDirectoryHandle('objects');
  let objectCount = 0;
  let objectBytes = 0;
  for await (const handle of directory.values())
    if (handle.kind === 'file') {
      objectCount++;
      objectBytes += (await handle.getFile()).size;
    }
  return {
    objectCount,
    objectBytes,
    refs: await db.count('asset_refs'),
    owners: await db.count('asset_owners'),
    children: await db.count('project_assets'),
  };
}

/** The real Montage acquisition and parent writers share bytes across two accepted projects. */
export async function insertTwice(kind: 'recording' | 'export') {
  const mediaId = kind === 'recording' ? 'recording:mic' : 'export:audio';
  const before = await objectsState();
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const project = createEmptyVideoProject(`Native ${index}`);
    const acquired = await ensureLibraryMediaAssets(project, mediaId);
    const asset = acquired[0];
    if (!asset || asset.source.kind !== 'project-asset') throw new Error('Missing project child');
    project.assets = acquired;
    await saveVideoProject(project);
    if ((await ensureLibraryMediaAssets(project, mediaId))[0]?.id !== asset.id)
      throw new Error('Repeated insertion did not reuse its child');
    const stored = await getProjectAsset(asset.source.projectAssetId);
    if (stored.status !== 'ready') throw new Error('Private child is unreadable');
    ids.push(asset.source.projectAssetId);
  }
  const source = await readLibraryProjectBindingSource(mediaId);
  const cancelled = await prepareLibraryProjectBinding(source, 'never-accepted');
  await cancelled.cancel();
  const after = await objectsState();
  const body = await readAssetFile(source.ref, source.filename);
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', await body.arrayBuffer())),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return { before, after, ids, sha256: digest, duration: 0.1 };
}

/** Commits without clearing a ready receipt, changes origin lifecycle, then replays it. */
export async function replayAfterOriginChange(deleted: boolean) {
  const source = await readLibraryProjectBindingSource('recording:mic');
  const journal = await createAssetPublicationJournal<ProjectAssetPublicationPayload>({
    domain: 'project-assets',
    assetRefs: [source.ref],
    payload: {
      entry: {
        id: 'lost-ack',
        assetId: source.ref.assetId,
        createdAt: 2,
        mimeType: source.ref.mimeType,
        size: source.ref.size,
        originMediaId: source.mediaId,
      },
      filename: source.filename,
      publishToLibrary: false,
      expectedAssetId: null,
      expectedLibrarySource: { mediaId: source.mediaId, source: source.source },
    },
  });
  await publishProjectAssetJournal(journal);
  const before = await objectsState();
  const db = await initDB();
  if (deleted) await db.delete('media_library', source.mediaId);
  else {
    const raw = await db.get('media_library', source.mediaId);
    await db.put('media_library', {
      ...raw,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 3, trashedAt: 3 },
    });
  }
  await projectAssetPublicationAdapter.publish(journal);
  await cancelAssetPublication(journal);
  return {
    before,
    after: await objectsState(),
    readableBytes: (await readAssetFile(source.ref, source.filename)).size,
  };
}

/** An inconsistent destination must preserve the ready receipt during real startup recovery. */
export async function recoverAmbiguousDestination() {
  const source = await readLibraryProjectBindingSource('recording:mic');
  const entry = {
    id: 'ambiguous',
    assetId: source.ref.assetId,
    createdAt: 2,
    mimeType: source.ref.mimeType,
    size: source.ref.size,
    originMediaId: source.mediaId,
  };
  const journal = await createAssetPublicationJournal<ProjectAssetPublicationPayload>({
    domain: 'project-assets',
    assetRefs: [source.ref],
    payload: {
      entry,
      filename: source.filename,
      publishToLibrary: false,
      expectedAssetId: null,
      expectedLibrarySource: { mediaId: source.mediaId, source: source.source },
    },
  });
  await publishProjectAssetJournal(journal);
  const db = await initDB();
  await db.put('project_assets', { ...entry, assetId: 'inconsistent-body' });
  await recoverProjectMediaPublications();
  return {
    retained: (await listReadyJournals()).some((ready) => ready.journalId === journal.journalId),
    state: await objectsState(),
    readableBytes: (await readAssetFile(source.ref, source.filename)).size,
  };
}
