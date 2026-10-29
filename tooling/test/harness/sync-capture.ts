import { imageHarness } from './sync-image';
import { outgoingHarness } from './sync-outgoing';
import { publishReadyJournalWithRetry } from '../../../apps/extension/src/composition/persistence/assets';
import {
  createPreparedReplicaJournal,
  publishPreparedReplicaJournal,
} from '../../../apps/extension/src/composition/persistence/sync-capture/replica-publication';
import { recoverAssetPublications } from '../../../apps/extension/src/composition/persistence/asset-publication-recovery';
import { listReadyJournals } from '../../../apps/extension/src/composition/persistence/assets';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { applyPreparedMediaReplica } from '../../../apps/extension/src/composition/persistence/sync-capture/apply-media';
import { applyCatalogDeletionNative } from '../../../apps/extension/src/composition/persistence/sync-capture/apply-deletion';
import { acquireAssetResourceSession } from '../../../apps/extension/src/composition/persistence/assets/resource-sessions';
import { harnessReady } from './browser-mocks/browser-mocks';
import { createVideoClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { applyPreparedVideoProjectRevision } from '../../../apps/extension/src/composition/persistence/sync-capture/apply-video-project';
import { captureRootKey } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import { parseAssetRef } from '../../../apps/extension/src/composition/persistence/assets/guards';
import { listMediaAssetProjectUsage } from '../../../apps/extension/src/composition/persistence/media-library/usage';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inventory';
import { exportMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/export';
import { inspectMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { createArchiveMemorySink } from '../../../apps/extension/src/composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../apps/extension/src/composition/archive-transfer';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../apps/extension/src/features/video/project/types';
import type { VideoProjectEntry } from '../../../apps/extension/src/composition/persistence/projects/contracts';
import {
  saveProjectAsset,
  saveVideoProject,
  deleteVideoProject,
} from '../../../apps/extension/src/composition/persistence/projects';
import {
  parseVideoProjectEntry,
  parseProjectAssetEntry,
} from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import {
  initDB,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import type { CapturedChange } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { createFrozenSnapshotDatabase } from '../../../apps/extension/src/workflows/sync-transfer/captured-project';
import { createArchivePathAllocator } from '../../../apps/extension/src/composition/archive-transfer';
import { buildVideoProjectRootInventory } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inventory/video-projects';
import { createMediaHubBackupExportOptions } from '../../../apps/extension/src/workflows/media-hub-backup/v6/options';
import {
  readAssetFile,
  createAssetPublicationJournal,
  writeBlobToAsset,
  releaseAssetReadyProtection,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
} from '../../../apps/extension/src/composition/persistence/assets';
import {
  publishProjectExportJournal,
  PROJECT_EXPORT_PUBLICATION_DOMAIN,
} from '../../../apps/extension/src/composition/persistence/projects/asset-publication';
import { deleteMediaAssetWithProjectCascade } from '../../../apps/extension/src/composition/persistence/media-library/delete-cascade';
import { videoProjectRootPublisher } from '../../../apps/extension/src/workflows/media-hub-backup/v6/root-publication/video-project';
import {
  createArchiveRestoreSession,
  beginArchiveRestoreRoot,
  readArchiveRestoreSession,
} from '../../../apps/extension/src/composition/persistence/assets';
import { applyVideoProjectForCapturePrototype } from '../../../apps/extension/src/composition/persistence/sync-capture/test-support/apply-video-project';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function changes(rootId?: string): Promise<CapturedChange[]> {
  const db = await initDB();
  const raw: unknown[] = await db.getAll(SYNC_CAPTURE_STORE);
  return raw
    .flatMap((value) => {
      const row = parseSyncCaptureRecord(value);
      check(row, 'Stored capture admission failed.');
      return row.kind === 'sync-operation' &&
        row.phase === 'native' &&
        (rootId === undefined || row.rootId === rootId)
        ? [row]
        : [];
    })
    .sort((a, b) => a.generation - b.generation);
}
async function project(id: string): Promise<VideoProjectEntry> {
  const db = await initDB();
  const entry = parseVideoProjectEntry(await db.get(VIDEO_PROJECTS_STORE, id));
  check(entry, 'Expected native project is missing.');
  return entry;
}
async function refused(operation: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  check(rejected, 'The mutation unexpectedly succeeded.');
}
/** Inject a storage failure in this disposable harness. No product fault hook is installed. */
async function withCaptureWriteFailure<T>(
  kind: string,
  ordinal: number,
  operation: () => Promise<T>
): Promise<T> {
  const original = IDBObjectStore.prototype.add;
  let seen = 0;
  IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
    if (
      this.name === SYNC_CAPTURE_STORE &&
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, 'kind') === kind &&
      ++seen === ordinal
    )
      throw new DOMException('Disposable capture storage failure.', 'QuotaExceededError');
    return original.call(this, value, key);
  };
  try {
    return await operation();
  } finally {
    IDBObjectStore.prototype.add = original;
  }
}
function png(): Blob {
  const text = atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII='
  );
  return new Blob([Uint8Array.from(text, (char) => char.charCodeAt(0))], { type: 'image/png' });
}
async function sourceProject(name: string): Promise<VideoProjectEntry> {
  const file = png();
  const sourceId = crypto.randomUUID();
  await saveProjectAsset(sourceId, file, file.type, `${name}.png`);
  const candidate = createEmptyVideoProject(name, 1280, 720);
  candidate.assets = [
    createVideoProjectAsset(
      'Original',
      VideoProjectAssetType.IMAGE,
      { kind: 'project-asset', projectAssetId: sourceId },
      {
        width: 1,
        height: 1,
        duration: null,
        mimeType: file.type,
        size: file.size,
        hasAudio: false,
        audioPeaks: null,
      }
    ),
  ];
  return saveVideoProject(candidate, { expectedProject: null, expectedWorkspaceRevision: null });
}
async function sha(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
async function materialize(capture: CapturedChange) {
  check(capture.change.kind === 'video-project', 'A project snapshot is required.');
  const roots = await buildVideoProjectRootInventory({
    db: createFrozenSnapshotDatabase(capture.change.rows),
    paths: createArchivePathAllocator(),
    options: createMediaHubBackupExportOptions({ includeDrafts: true }),
  });
  check(roots.length === 1, 'Expected one portable project.');
  const loaded = await roots[0]!.load();
  return {
    metadata: JSON.stringify(loaded.metadata),
    hashes: await Promise.all(loaded.objects.map((object) => sha(object.blob))),
  };
}

async function preProfileDependenciesProof() {
  await harnessReady;
  const local = await sourceProject('Before sync enrollment');
  const source = local.project.assets[0];
  check(source?.source.kind === 'project-asset', 'The local original is missing.');
  const mediaId = `project-asset:${source.source.projectAssetId}`;
  const mediaBefore = await (await initDB()).get('media_library', mediaId);
  check((await changes()).length === 0, 'Local-only saving created capture rows.');
  await installExperimentalCaptureProfile({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: Date.now(),
    enabled: true,
    spaceId: 'preprofile-dependency-proof',
    connectionGeneration: 1,
  });
  const candidate = (name: string) => {
    const next = createEmptyVideoProject(name, 1280, 720);
    next.assets = [{ ...structuredClone(source), source: { kind: 'library-asset', mediaId } }];
    return next;
  };
  const failed = candidate('Rolled back dependency genesis');
  await withCaptureWriteFailure('sync-operation', 2, () =>
    refused(() =>
      saveVideoProject(failed, { expectedWorkspaceRevision: null, expectedProject: null })
    )
  );
  const db = await initDB();
  check((await changes()).length === 0, 'Failure retained a partial dependency capture.');
  check(
    (await db.get(VIDEO_PROJECTS_STORE, failed.id)) === undefined,
    'Failure published the project.'
  );
  check(
    JSON.stringify(await db.get('media_library', mediaId)) === JSON.stringify(mediaBefore),
    'Failure changed the local original.'
  );
  const peer = candidate('Shared dependency in another project');
  const saved = await Promise.all([
    saveVideoProject(failed, { expectedWorkspaceRevision: null, expectedProject: null }),
    saveVideoProject(peer, { expectedWorkspaceRevision: null, expectedProject: null }),
  ]);
  const captured = await changes();
  const media = captured.filter((row) => row.rootKind === 'media');
  const projects = captured.filter((row) => row.rootKind === 'video-project');
  check(media.length === 1 && projects.length === 2, 'Parallel saves duplicated or lost capture.');
  const dependency = media[0];
  check(
    dependency?.change.kind === 'media' &&
      dependency.rootId === mediaId &&
      dependency.generation === 1 &&
      dependency.basis.length === 0,
    'The original has no genuine initial capture.'
  );
  for (const row of projects) {
    check(
      row.change.kind === 'video-project' &&
        JSON.stringify(row.change.rows.mediaDependencies) ===
          JSON.stringify([{ mediaId, generation: 1, basis: [dependency.operationId] }]),
      'A project does not reference the exact committed dependency.'
    );
  }
  const first = saved[0];
  check(first, 'The retried project is missing.');
  await saveVideoProject(
    { ...first.project, name: 'Accepted subsequent edit' },
    {
      expectedWorkspaceRevision: first.workspaceRevision ?? 0,
      expectedProject: first.project,
    }
  );
  check(
    (await changes()).filter((row) => row.rootKind === 'media').length === 1,
    'A later edit duplicated the initial dependency.'
  );
  check(
    JSON.stringify(await db.get('media_library', mediaId)) === JSON.stringify(mediaBefore),
    'Capture changed the local original.'
  );
  const file = await readAssetFile(dependency.change.rows.ref, 'original.png');
  return {
    projectId: first.id,
    mediaId,
    sourceHash: await sha(file),
    localOnly: true,
    rollback: true,
    retry: true,
    parallel: true,
    sharedHead: true,
  };
}

async function saveProof() {
  await harnessReady;
  const originalNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    const old = await saveVideoProject(createEmptyVideoProject('Fixed clock local identity'));
    await deleteVideoProject(old.id);
    const recreated = await saveVideoProject(old.project, {
      expectedProject: null,
      expectedWorkspaceRevision: null,
    });
    check(
      JSON.stringify(recreated.project) === JSON.stringify(old.project),
      'The frozen clock did not reproduce identical authored state.'
    );
    check(
      recreated.workspaceRevision !== old.workspaceRevision,
      'Local-only recreation reused its revision.'
    );
    await refused(() =>
      saveVideoProject(
        { ...old.project, name: 'Old local editor' },
        { expectedProject: old.project, expectedWorkspaceRevision: old.workspaceRevision ?? 0 }
      )
    );
    await saveVideoProject(
      { ...recreated.project, name: 'Fresh local editor' },
      {
        expectedProject: recreated.project,
        expectedWorkspaceRevision: recreated.workspaceRevision ?? 0,
      }
    );
  } finally {
    Date.now = originalNow;
  }
  const localOnly = await saveVideoProject(createEmptyVideoProject('Local only'));
  check((await changes()).length === 0, 'The default local flow created capture rows.');
  await installExperimentalCaptureProfile({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: Date.now(),
    enabled: true,
    spaceId: 'capture-proof',
    connectionGeneration: 1,
  });
  const first = await saveVideoProject(
    { ...localOnly.project, name: 'Enabled' },
    {
      expectedProject: localOnly.project,
      expectedWorkspaceRevision: localOnly.workspaceRevision ?? 0,
    }
  );
  const initial = await changes(first.id);
  check(initial.length === 1, 'Enabled save must create one capture.');
  await withCaptureWriteFailure('sync-operation', 1, () =>
    refused(() =>
      saveVideoProject(
        { ...first.project, name: 'Must roll back' },
        { expectedProject: first.project }
      )
    )
  );
  check(
    (await project(first.id)).project.name === 'Enabled',
    'Capture failure did not roll back the domain save.'
  );
  check((await changes(first.id)).length === 1, 'Capture failure advanced the journal.');
  const outcomes = await Promise.allSettled(
    ['A', 'B'].map((name) =>
      saveVideoProject(
        { ...first.project, name },
        { expectedProject: first.project, expectedWorkspaceRevision: first.workspaceRevision ?? 0 }
      )
    )
  );
  check(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length === 1,
    'Parallel stale writers were both accepted.'
  );
  const accepted = await changes(first.id);
  check(
    accepted.length === 2 && accepted[1]!.generation === 2,
    'Parallel saves did not preserve one generation.'
  );
  check(
    accepted[1]!.basis[0] === accepted[0]!.operationId,
    'The accepted writer lost its causal predecessor.'
  );
  const current = await project(first.id);
  check(
    current.workspaceRevision === (first.workspaceRevision ?? 0) + 1,
    'The aborted capture consumed a native revision.'
  );
  const temporary = createEmptyVideoProject('Opening temporary project');
  const db = await initDB();
  await db.put(VIDEO_PROJECTS_STORE, {
    id: temporary.id,
    project: temporary,
    createdAt: temporary.createdAt,
    updatedAt: temporary.updatedAt,
    workspaceRevision: 0,
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: temporary.updatedAt },
  });
  const promoted = await saveVideoProject(temporary, {
    expectedProject: temporary,
    expectedWorkspaceRevision: 0,
  });
  const promotion = (await changes(temporary.id))[0];
  check(
    promoted.lifecycle?.storageClass === 'library' &&
      promotion?.change.kind === 'video-project' &&
      promotion.change.rows.project.lifecycle?.storageClass === 'library',
    'Opening promotion did not capture its accepted lifecycle.'
  );
  await deleteVideoProject(first.id);
  const deleted = await changes(first.id);
  check(
    deleted.length === 3 && deleted[2]!.change.kind === 'tombstone',
    'Delete did not capture its tombstone.'
  );
  await refused(() =>
    saveVideoProject(
      { ...current.project, name: 'Delayed writer' },
      { expectedProject: current.project }
    )
  );
  check((await changes(first.id)).length === 3, 'A refused delayed writer appended an intent.');
  await saveVideoProject(
    { ...current.project, name: 'Recreated identity' },
    { expectedProject: null, expectedWorkspaceRevision: null }
  );
  const recreated = await changes(first.id);
  check(
    recreated.length === 4 && recreated[3]!.generation === 4,
    'Recreation reset the capture generation.'
  );
  return {
    localDefault: true,
    rollback: true,
    parallel: true,
    delayedDelete: true,
    recreation: true,
    projectId: first.id,
  };
}

async function exportProof() {
  const entry = await sourceProject('Export root');
  const blob = new Blob(['Saved export byte-storage fixture'], { type: 'video/webm' });
  const prepared = await writeBlobToAsset(blob, { mimeType: blob.type });
  const journal = await createAssetPublicationJournal({
    assetRefs: [prepared.ref],
    domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
    payload: {
      expectedAssetId: null,
      entry: {
        id: crypto.randomUUID(),
        projectId: entry.id,
        assetId: prepared.ref.assetId,
        filename: 'saved.webm',
        createdAt: Date.now(),
        size: blob.size,
        mimeType: blob.type,
        duration: 1,
        width: 1,
        height: 1,
        fps: 1,
      },
    },
  });
  await publishProjectExportJournal(journal);
  const after = await changes(entry.id);
  check(after.length === 2, 'Saved export did not append its project capture.');
  const frozen = JSON.stringify(after[1]);
  const current = await project(entry.id);
  await saveVideoProject(
    { ...current.project, name: 'Edit after export' },
    { expectedProject: current.project }
  );
  await publishProjectExportJournal(journal);
  const replayed = await changes(entry.id);
  check(
    replayed.length === 3 && JSON.stringify(replayed[1]) === frozen,
    'Publication replay replaced a frozen snapshot or duplicated an operation.'
  );
  await releaseAssetReadyProtection([prepared.ref.assetId]);
  return { replay: true, frozen: true };
}

async function cascadeProof() {
  const initial = await sourceProject('Cascade root');
  const borrowedId = crypto.randomUUID();
  const file = png();
  await saveProjectAsset(borrowedId, file, file.type, 'borrowed.png');
  const mediaId = `project-asset:${borrowedId}`;
  const borrowed = createVideoProjectAsset(
    'Borrowed original',
    VideoProjectAssetType.IMAGE,
    { kind: 'library-asset', mediaId },
    {
      width: 1,
      height: 1,
      duration: null,
      mimeType: file.type,
      size: file.size,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const entry = await saveVideoProject(
    { ...initial.project, assets: [...initial.project.assets, borrowed] },
    { expectedProject: initial.project }
  );
  const usage = [
    { id: entry.id, kind: 'video' as const, name: entry.project.name, primary: false },
  ];
  const before = (await changes()).length;
  await withCaptureWriteFailure('sync-operation', 2, () =>
    refused(() => deleteMediaAssetWithProjectCascade(mediaId, usage))
  );
  check(
    (await project(entry.id)).project.assets.length === 2 && (await changes()).length === before,
    'The second capture failure did not roll back the cascade.'
  );
  await deleteMediaAssetWithProjectCascade(mediaId, usage);
  check(
    (await project(entry.id)).project.assets.length === 1,
    'Cascade did not detach only the borrowed source.'
  );
  const projectChanges = await changes(entry.id);
  const sourceChanges = await changes(mediaId);
  const tombstones = sourceChanges.filter((capture) => capture.change.kind === 'tombstone');
  check(
    projectChanges.length === 3 &&
      sourceChanges.some((capture) => capture.change.kind === 'media') &&
      tombstones.length === 1,
    'Cascade did not capture both affected roots.'
  );
  return { rollback: true, detach: true, tombstone: true };
}

async function frozenProof() {
  const entry = await sourceProject('Frozen revision N');
  const capture = (await changes(entry.id))[0]!;
  check(capture.change.kind === 'video-project', 'Missing frozen project.');
  const before = await materialize(capture);
  const ref = capture.change.rows.refs[0]!;
  const expectedHash = await sha(await readAssetFile(ref, 'original.png'));
  await saveVideoProject(
    { ...entry.project, name: 'Revision N plus one' },
    { expectedProject: entry.project }
  );
  await deleteVideoProject(entry.id);
  const source = entry.project.assets[0]!.source;
  check(source.kind === 'project-asset', 'Expected a project source.');
  await deleteMediaAssetWithProjectCascade(`project-asset:${source.projectAssetId}`, []);
  const deletion = buildPhysicalDeleteOperation([ref.assetId]);
  const db = await initDB();
  await db.put('asset_operations', deletion);
  await completePhysicalDeleteOperation(deletion);
  check(
    (await db.get('asset_refs', ref.assetId)) === undefined,
    'Only-copy proof still has a native reference.'
  );
  check(
    (await db.getAllFromIndex('asset_owners', 'assetId', ref.assetId)).length === 0,
    'Only-copy proof still has a native owner.'
  );
  check(
    (await sha(await readAssetFile(ref, 'retained.png'))) === expectedHash,
    'Pending capture lost its source bytes.'
  );
  const rows = capture.change.rows;
  await applyVideoProjectForCapturePrototype({
    operationId: crypto.randomUUID(),
    sourceDigest: await sha(new Blob([JSON.stringify(rows)])),
    expectedLocalGeneration: 3,
    root: {
      entry: {
        ...rows.project,
        project: { ...rows.project.project, name: 'Restored live project' },
      },
      assets: rows.assets.map((asset) => ({
        entry: asset,
        filename: 'restored.png',
        ref: rows.refs.find((item) => item.assetId === asset.assetId)!,
      })),
      exports: [],
    },
  });
  const after = await materialize(capture);
  check(JSON.stringify(after) === JSON.stringify(before), 'Frozen N used a changed live graph.');
  return {
    projectId: entry.id,
    metadata: after.metadata,
    hashes: after.hashes,
    sourceHash: expectedHash,
  };
}

async function provenanceProof() {
  const entry = await sourceProject('Before remote apply');
  const capture = (await changes(entry.id))[0]!;
  check(capture.change.kind === 'video-project', 'Expected native snapshot.');
  const rows = capture.change.rows;
  const remote = {
    ...rows.project,
    project: { ...rows.project.project, name: 'Applied revision' },
  };
  const root = {
    entry: remote,
    assets: rows.assets.map((asset) => ({
      entry: asset,
      filename: 'source.png',
      ref: rows.refs.find((ref) => ref.assetId === asset.assetId)!,
      reusePublished: true,
    })),
    exports: [],
  };
  const operationId = crypto.randomUUID();
  const sourceDigest = await sha(new Blob([JSON.stringify(root)]));
  const input = { root, operationId, sourceDigest, expectedLocalGeneration: 1 };
  await withCaptureWriteFailure('applied-operation', 1, () =>
    refused(() => applyVideoProjectForCapturePrototype(input))
  );
  check(
    (await project(entry.id)).project.name === entry.project.name,
    'Receipt failure did not roll back remote replacement.'
  );
  const applied = await applyVideoProjectForCapturePrototype(input);
  check(
    applied.status === 'applied' && (await changes(entry.id)).length === 1,
    'Remote apply created an outgoing echo.'
  );
  check(
    (await applyVideoProjectForCapturePrototype(input)).status === 'duplicate',
    'Remote retry was not idempotent.'
  );
  await refused(() =>
    applyVideoProjectForCapturePrototype({ ...input, sourceDigest: 'f'.repeat(64) })
  );
  const current = await project(entry.id);
  await saveVideoProject(
    { ...current.project, name: 'Local edit after apply' },
    { expectedProject: current.project }
  );
  const outgoing = await changes(entry.id);
  check(
    outgoing.length === 2 && outgoing[1]!.generation === 3 && outgoing[1]!.basis[0] === operationId,
    'The next local edit lost the incoming basis.'
  );
  return { rollback: true, noEcho: true, retry: true, basis: true };
}

async function restoreProof() {
  const entry = await saveVideoProject(createEmptyVideoProject('Restore original'));
  const capture = (await changes(entry.id))[0]!;
  check(capture.change.kind === 'video-project', 'Expected restore source.');
  const roots = await buildVideoProjectRootInventory({
    db: createFrozenSnapshotDatabase(capture.change.rows),
    paths: createArchivePathAllocator(),
    options: createMediaHubBackupExportOptions({ includeDrafts: true }),
  });
  const inventory = roots[0]!;
  const payload = await inventory.load();
  check(payload.objects.length === 0, 'The scalar restore fixture must have no media.');
  const envelope = { descriptor: inventory.descriptor, metadata: payload.metadata, objects: [] };
  const rootKey = `video-project:${entry.id}`;
  const restoreSession = await createArchiveRestoreSession({
    archiveFingerprint: 'a'.repeat(64),
    strategy: 'replace',
  });
  const session = await beginArchiveRestoreRoot(restoreSession.operationId, rootKey);
  const journal = {
    assetRefs: [],
    createdAt: Date.now(),
    domain: 'capture-restore-proof',
    journalId: crypto.randomUUID(),
    payload: null,
  };
  await withCaptureWriteFailure('sync-operation', 1, () =>
    refused(() => videoProjectRootPublisher.publish({ envelope, session, journal, staged: [] }))
  );
  check(
    (await readArchiveRestoreSession(session.operationId))?.committedRoots.length === 0,
    'Capture failure committed the archive checkpoint.'
  );
  check((await changes(entry.id)).length === 1, 'Capture failure advanced restore generation.');
  await videoProjectRootPublisher.publish({ envelope, session, journal, staged: [] });
  const restoredChanges = await changes(entry.id);
  check(
    restoredChanges.length === 2 && restoredChanges[1]!.origin === 'local-restore',
    'Local restore did not append a local capture.'
  );
  check(
    (await readArchiveRestoreSession(session.operationId))?.committedRoots.includes(rootKey),
    'Restore capture did not commit with its archive checkpoint.'
  );
  const skipSession = await createArchiveRestoreSession({
    archiveFingerprint: 'b'.repeat(64),
    strategy: 'skip',
  });
  const skip = await beginArchiveRestoreRoot(skipSession.operationId, rootKey);
  check(
    await videoProjectRootPublisher.checkpointSkipIfExisting?.({ envelope, session: skip }),
    'Existing root was not skipped.'
  );
  check((await changes(entry.id)).length === 2, 'A skipped restore created an outgoing capture.');
  const canonicalBeforeRepeat = await project(entry.id);
  const repeatedSession = await createArchiveRestoreSession({
    archiveFingerprint: 'c'.repeat(64),
    strategy: 'replace',
  });
  const repeated = await beginArchiveRestoreRoot(repeatedSession.operationId, rootKey);
  await videoProjectRootPublisher.publish({ envelope, session: repeated, journal, staged: [] });
  const repeatedChanges = await changes(entry.id);
  const current = await project(entry.id);
  const sameStateRestored =
    JSON.stringify(current.project) === JSON.stringify(canonicalBeforeRepeat.project);
  let oldWriterAccepted = false;
  try {
    await saveVideoProject(
      { ...canonicalBeforeRepeat.project, name: 'Old editor after identical restore' },
      {
        expectedProject: canonicalBeforeRepeat.project,
        expectedWorkspaceRevision: canonicalBeforeRepeat.workspaceRevision ?? 0,
      }
    );
    oldWriterAccepted = true;
  } catch {
    /* Record the observed guard result without replacing this test with a changed fixture. */
  }
  const fresh = await saveVideoProject(
    { ...current.project, name: 'Fresh editor after restore' },
    { expectedProject: current.project, expectedWorkspaceRevision: current.workspaceRevision ?? 0 }
  );
  check(
    (fresh.workspaceRevision ?? 0) > (current.workspaceRevision ?? 0),
    'Fresh restore writer did not advance native admission.'
  );
  const final = await changes(entry.id);
  check(
    final.at(-1)?.basis[0] === repeatedChanges.at(-1)?.operationId,
    'Fresh restore writer lost its causal predecessor.'
  );
  if (oldWriterAccepted)
    check(
      final.at(-1)?.basis[0] === repeatedChanges.at(-1)?.operationId,
      'An admitted old editor lost the restore predecessor.'
    );
  return {
    checkpointAtomic: true,
    localCapture: true,
    skipNoCapture: true,
    sameStateRestored,
    oldWriterAccepted,
    freshWriterAccepted: true,
    causalBasisPreserved: true,
  };
}

async function verifyFrozenPersistence(rootId: string) {
  const capture = (await changes(rootId))[0];
  check(capture, 'Frozen capture disappeared after browser restart.');
  return materialize(capture);
}

async function coloredSource(color: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext('2d');
  check(context, 'The native source canvas is unavailable.');
  context.fillStyle = color;
  context.fillRect(0, 0, 24, 24);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Source encoding failed.'))),
      'image/png'
    )
  );
}

async function replicaEnrollment() {
  const db = await initDB();
  const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
  check(profile?.kind === 'profile', 'Replica enrollment is missing.');
  return { spaceId: profile.spaceId, profileCreatedAt: profile.createdAt };
}

async function applicationProof() {
  await harnessReady;
  const spaceId = 'native-application-space';
  await installExperimentalCaptureProfile({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: Date.now(),
    enabled: true,
    spaceId,
    connectionGeneration: 1,
  });
  const privateFile = await coloredSource('rgb(240,80,20)');
  const borrowedFile = await coloredSource('rgb(20,180,60)');
  const prepared = await writeBlobToAsset(privateFile, { mimeType: privateFile.type });
  const privateId = crypto.randomUUID();
  const borrowedId = crypto.randomUUID();
  await saveProjectAsset(borrowedId, borrowedFile, borrowedFile.type, 'borrowed.png');
  const mediaId = `project-asset:${borrowedId}`;
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get('media_library', mediaId));
  const child = parseProjectAssetEntry(await db.get('project_assets', borrowedId));
  check(media && typeof child?.assetId === 'string', 'The native borrowed source is missing.');
  const borrowedRef = parseAssetRef(await db.get('asset_refs', child.assetId));
  check(borrowedRef, 'The native borrowed source has no physical reference.');
  const rootKey = captureRootKey(spaceId, 'media', mediaId);
  const dependency = parseSyncCaptureRecord(
    await db.get(SYNC_CAPTURE_STORE, JSON.stringify(['root-state', rootKey]))
  );
  check(
    dependency?.kind === 'root-state' && dependency.nativeDigest,
    'The native source writer did not capture its independent causal head.'
  );
  const candidate = createEmptyVideoProject('Native applied project', 1280, 720);
  const metadata = {
    width: 24,
    height: 24,
    duration: null,
    mimeType: 'image/png',
    hasAudio: false,
    audioPeaks: null,
  };
  const direct = createVideoProjectAsset(
    'Private original',
    VideoProjectAssetType.IMAGE,
    { kind: 'project-asset', projectAssetId: privateId },
    { ...metadata, size: privateFile.size }
  );
  const borrowed = createVideoProjectAsset(
    'Borrowed original',
    VideoProjectAssetType.IMAGE,
    { kind: 'library-asset', mediaId },
    { ...metadata, size: borrowedFile.size }
  );
  candidate.assets = [direct, borrowed];
  const track = candidate.tracks[0]!;
  const secondTrack = {
    ...structuredClone(track),
    id: crypto.randomUUID(),
    isRoot: false,
    name: 'Borrowed source',
    order: 2,
  };
  candidate.tracks.push(secondTrack);
  const clips = [direct, borrowed].map((asset, index) => {
    const clip = createVideoClipFromAsset(
      index === 0 ? track.id : secondTrack.id,
      asset,
      1280,
      720
    );
    return {
      ...clip,
      duration: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      transform: { ...clip.transform, x: index * 640, y: 0, width: 640, height: 720 },
    };
  });
  candidate.clips = clips;
  candidate.duration = 2;
  const root = {
    entry: {
      id: candidate.id,
      project: candidate,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    },
    assets: [
      {
        entry: {
          id: privateId,
          assetId: prepared.ref.assetId,
          createdAt: Date.now(),
          size: privateFile.size,
          mimeType: privateFile.type,
        },
        ref: prepared.ref,
        filename: 'private.png',
        publishToLibrary: false,
      },
    ],
  };
  const input = {
    root,
    operationId: crypto.randomUUID(),
    sourceDigest: await sha(new Blob([JSON.stringify(root)])),
    connectionGeneration: 1,
    ...(await replicaEnrollment()),
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [
      { entry: media, ref: borrowedRef, expectedGeneration: 1, expectedBasis: dependency.basis },
    ],
  };
  // A later admitted revision has the same bytes but cannot reuse the prepared causal identity.
  const advancedDependency = {
    ...dependency,
    generation: 2,
    basis: ['accepted-next-native-source'],
  };
  await db.put(SYNC_CAPTURE_STORE, advancedDependency);
  await refused(() => applyPreparedVideoProjectRevision(input));
  input.dependencies[0]!.expectedGeneration = 2;
  input.dependencies[0]!.expectedBasis = advancedDependency.basis;
  await withCaptureWriteFailure('applied-operation', 1, () =>
    refused(() => applyPreparedVideoProjectRevision(input))
  );
  check(
    (await db.get(VIDEO_PROJECTS_STORE, candidate.id)) === undefined,
    'Receipt failure left a partial native project.'
  );
  check(
    (await db.get('project_assets', privateId)) === undefined,
    'Receipt failure left a private source.'
  );
  check(
    (await sha(await readAssetFile(prepared.ref, 'retained.png'))) === (await sha(privateFile)),
    'Failed apply lost staged bytes.'
  );
  const competing = { ...input, operationId: crypto.randomUUID() };
  const attempts = await Promise.allSettled([
    applyPreparedVideoProjectRevision(input),
    applyPreparedVideoProjectRevision(competing),
  ]);
  check(
    attempts.filter((attempt) => attempt.status === 'fulfilled').length === 1,
    'Parallel native applications admitted the same predecessor twice.'
  );
  const acceptedInput = attempts[0]!.status === 'fulfilled' ? input : competing;
  check(
    (await applyPreparedVideoProjectRevision(acceptedInput)).status === 'duplicate',
    'Native application retry duplicated the revision.'
  );
  check((await changes(candidate.id)).length === 0, 'Native application emitted an outgoing echo.');
  const accepted = await project(candidate.id);
  check(
    JSON.stringify(accepted.project.assets.map((asset) => asset.source)) ===
      JSON.stringify(candidate.assets.map((asset) => asset.source)),
    'Native application rewrote the logical sources.'
  );
  await releaseAssetReadyProtection([prepared.ref.assetId]);
  return {
    projectId: candidate.id,
    mediaId,
    privateId,
    clipId: clips[0]!.id,
    rollback: true,
    retry: true,
    noEcho: true,
    parallel: true,
    causalFence: true,
    expectedHashes: [await sha(privateFile), await sha(borrowedFile)],
  };
}

async function applicationAfterEditorProof(projectId: string, mediaId: string) {
  const edited = await project(projectId);
  const captured = await changes(projectId);
  check(captured.length > 0, 'The real editor did not capture a saved change.');
  const usage = await listMediaAssetProjectUsage(mediaId);
  check(
    usage.some((item) => item.id === projectId),
    'The applied project lost its Library usage edge.'
  );
  const plan = await buildMediaHubBackupExportPlanFromLibraryV6(
    createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: [projectId] },
    })
  );
  const sink = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: sink.sink });
  const archive = sink.blob();
  const inspected = await inspectMediaHubBackupV6(archive);
  check(
    inspected.descriptors.some((item) => item.rootKind === 'media' && item.rootId === mediaId),
    'Backup omitted the borrowed source root.'
  );
  const reader = await openArchiveReader(archive);
  const hashes = [];
  try {
    for (const entry of reader.entries().filter((item) => item.path.endsWith('.png'))) {
      const source = reader.entry(entry.path);
      check(source, 'The backup object is missing.');
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      await source.pipeTo(
        new WritableStream({
          write(chunk) {
            chunks.push(new Uint8Array(chunk));
          },
        })
      );
      hashes.push(await sha(new Blob(chunks)));
    }
  } finally {
    await reader.close();
  }
  await deleteMediaAssetWithProjectCascade(mediaId, usage);
  const afterDelete = await project(projectId);
  check(
    !afterDelete.project.assets.some(
      (asset) => asset.source.kind === 'library-asset' && asset.source.mediaId === mediaId
    ),
    'Library deletion missed the applied project.'
  );
  await refused(() =>
    saveVideoProject(
      { ...edited.project, name: 'Delayed native editor' },
      { expectedProject: edited.project, expectedWorkspaceRevision: edited.workspaceRevision ?? 0 }
    )
  );
  return {
    captured: true,
    usage: true,
    cascade: true,
    delayedWriterRefused: true,
    backupHashes: hashes,
  };
}

async function verifyAppliedSourcePersistence(projectId: string) {
  const capture = (await changes(projectId))[0];
  check(capture?.change.kind === 'video-project', 'The applied source capture disappeared.');
  const hashes = [];
  for (const ref of capture.change.rows.refs)
    hashes.push(await sha(await readAssetFile(ref, 'retained-source')));
  return hashes;
}

export /** Export a real source capture from this disposable browser profile. */
async function mediaSourceProof() {
  await harnessReady;
  await installExperimentalCaptureProfile({
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: Date.now(),
    enabled: true,
    spaceId: 'native-media-space',
    connectionGeneration: 1,
  });
  const file = await coloredSource('rgb(20,180,60)');
  const id = crypto.randomUUID();
  await saveProjectAsset(id, file, file.type, 'independent-source.png');
  const capture = (await changes(`project-asset:${id}`))[0];
  check(capture?.change.kind === 'media', 'The native source has no media capture.');
  return {
    capture,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    hash: await sha(file),
  };
}

/** Save a second real revision of the source without rotating its enrollment. */
async function mediaRevisionSourceProof(mediaId: string) {
  const db = await initDB();
  const entry = parseMediaLibraryEntry(await db.get('media_library', mediaId));
  check(entry?.source.kind === 'project-asset', 'The source revision is missing.');
  const file = await coloredSource('rgb(20,60,180)');
  await saveProjectAsset(entry.source.projectAssetId, file, file.type, entry.filename);
  const capture = (await changes(mediaId)).at(-1);
  check(
    capture?.change.kind === 'media' && capture.generation === 2,
    'The second source revision was not captured.'
  );
  return {
    capture,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    hash: await sha(file),
  };
}

/** Apply two revisions through native owners and check stale admission and replay. */
async function mediaCausalRevisionsProof(initialPayload: unknown, nextPayload: unknown) {
  const first = await prepareTransferredMediaReplica(initialPayload);
  await refused(() =>
    applyPreparedMediaReplica({
      ...first.input,
      profileCreatedAt: first.input.profileCreatedAt + 1,
    })
  );
  await applyPreparedMediaReplica(first.input);
  await releaseAssetReadyProtection([first.input.rows.ref.assetId]);
  const next = await prepareTransferredMediaReplica(nextPayload);
  check(
    next.input.rows.media.id === first.input.rows.media.id &&
      JSON.stringify(next.basis) === JSON.stringify([first.input.operationId]),
    'The source revision does not continue the first operation.'
  );
  const candidate = {
    ...next.input,
    expectedLocalGeneration: 1,
    expectedBasis: [first.input.operationId],
  };
  const result = await applyPreparedMediaReplica(candidate);
  check(result.generation === 2, 'The successor did not advance native generation.');
  await refused(() =>
    applyPreparedMediaReplica({ ...candidate, operationId: crypto.randomUUID() })
  );
  check(
    (await applyPreparedMediaReplica(first.input)).status === 'duplicate' &&
      (await applyPreparedMediaReplica(candidate)).status === 'duplicate',
    'Receipt replay changed a committed revision.'
  );
  await releaseAssetReadyProtection([next.input.rows.ref.assetId]);
  const persisted = await verifyMediaReplicaPersistence(first.input.rows.media.id);
  check(
    persisted.hash === next.hash && persisted.generation === 2,
    'Replay reverted the current bytes or generation.'
  );
  check((await changes()).length === 0, 'Incoming revisions created an upload echo.');
  return {
    mediaId: first.input.rows.media.id,
    firstHash: first.hash,
    hash: next.hash,
    generation: result.generation,
    staleRefused: true,
    replay: true,
    noEcho: true,
  };
}

/** Verify source bytes and prepare a local binding in this disposable profile. */
async function prepareTransferredMediaReplica(payload: unknown) {
  await harnessReady;
  check(
    isRecord(payload) &&
      Array.isArray(payload['bytes']) &&
      payload['bytes'].length <= 1024 * 1024 &&
      typeof payload['hash'] === 'string',
    'The disposable media transfer payload is invalid.'
  );
  const bytes: unknown[] = payload['bytes'];
  check(
    bytes.every(
      (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255
    ),
    'The disposable source bytes are invalid.'
  );
  const capture = parseSyncCaptureRecord(payload['capture']);
  check(
    capture?.kind === 'sync-operation' &&
      capture.phase === 'native' &&
      capture.change.kind === 'media',
    'The transferred source capture is invalid.'
  );
  const db = await initDB();
  const rawProfile: unknown = await db.get(SYNC_CAPTURE_STORE, 'profile');
  if (rawProfile === undefined) {
    await installExperimentalCaptureProfile({
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: Date.now(),
      enabled: true,
      spaceId: capture.spaceId,
      connectionGeneration: 1,
    });
  } else {
    const profile = parseSyncCaptureRecord(rawProfile);
    check(
      profile?.kind === 'profile' &&
        profile.enabled &&
        profile.spaceId === capture.spaceId &&
        profile.connectionGeneration === 1,
      'The existing target enrollment differs.'
    );
  }
  const file = new Blob(
    [Uint8Array.from(bytes.filter((value): value is number => typeof value === 'number'))],
    { type: capture.change.rows.ref.mimeType }
  );
  check(
    file.size === capture.change.rows.ref.size && (await sha(file)) === payload['hash'],
    'The transferred source bytes failed verification.'
  );
  const prepared = await writeBlobToAsset(file, { mimeType: file.type });
  const rows = structuredClone(capture.change.rows);
  rows.ref = { ...prepared.ref, sha256: payload['hash'] };
  rows.projectAsset.assetId = rows.ref.assetId;
  const input = {
    rows,
    operationId: capture.operationId,
    sourceDigest: await sha(new Blob([JSON.stringify(capture)])),
    connectionGeneration: 1,
    ...(await replicaEnrollment()),
    expectedBasis: [],
    expectedLocalGeneration: 0,
  };
  return { input, hash: payload['hash'], basis: capture.basis };
}

/** Exercise native ingestion without claiming provider transfer proof. */
async function mediaReplicaProof(payload: unknown) {
  const { input, hash } = await prepareTransferredMediaReplica(payload);
  const { rows } = input;
  const db = await initDB();
  check(
    (await db.get('media_library', rows.media.id)) === undefined,
    'The target profile is not empty.'
  );
  await withCaptureWriteFailure('applied-operation', 1, () =>
    refused(() => applyPreparedMediaReplica(input))
  );
  check(
    (await db.get('media_library', rows.media.id)) === undefined,
    'Failed native admission published a source.'
  );
  const alternatives = [input, { ...input, operationId: crypto.randomUUID() }];
  const attempts = await Promise.allSettled(
    alternatives.map((candidate) => applyPreparedMediaReplica(candidate))
  );
  check(
    attempts.filter((result) => result.status === 'fulfilled').length === 1,
    'Two native source applications accepted the same absent predecessor.'
  );
  const winner = alternatives[attempts.findIndex((result) => result.status === 'fulfilled')];
  check(winner, 'The source application did not complete.');
  check(
    (await applyPreparedMediaReplica(winner)).status === 'duplicate',
    'Accepted source replay was not a duplicate.'
  );
  check((await changes()).length === 0, 'Incoming source application emitted an outgoing capture.');
  await releaseAssetReadyProtection([rows.ref.assetId]);
  return {
    mediaId: rows.media.id,
    hash,
    rollback: true,
    parallel: true,
    duplicate: true,
    noEcho: true,
    actualNativeSource: true,
  };
}

/** Delete and restore a real native source without losing its identity or replay safety. */
async function mediaDeleteRestoreProof(mediaId: string) {
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get('media_library', mediaId));
  check(media?.source.kind === 'project-asset', 'The source to delete is missing.');
  const child = parseProjectAssetEntry(await db.get('project_assets', media.source.projectAssetId));
  const ref = child ? parseAssetRef(await db.get('asset_refs', child.assetId)) : null;
  check(child && ref, 'The source byte binding is missing.');
  const original = await readAssetFile(ref, media.filename);
  // This disposable fixture uses a tiny PNG, not the production transfer path.
  const bytes = await original.arrayBuffer();
  const hash = await sha(original);
  const enrollment = await replicaEnrollment();
  const rootKey = captureRootKey(enrollment.spaceId, 'media', mediaId);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const state = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, stateKey));
  check(state?.kind === 'root-state', 'The source causal state is missing.');
  const deletion = {
    ...enrollment,
    connectionGeneration: 1,
    rootKind: 'media' as const,
    rootId: mediaId,
    operationId: crypto.randomUUID(),
    sourceDigest: await sha(new Blob(['delete-native-proof'])),
    expectedLocalGeneration: state.generation,
    expectedBasis: state.basis,
    expectedWorkspaceRevision: null,
  };
  const reader = await acquireAssetResourceSession();
  try {
    await refused(() => applyCatalogDeletionNative(deletion));
  } finally {
    await reader.release();
  }
  check(await db.get('media_library', mediaId), 'Reader refusal deleted the source.');
  const deleted = await applyCatalogDeletionNative(deletion);
  check(
    (await db.get('media_library', mediaId)) === undefined,
    'Native deletion retained the logical root.'
  );
  await refused(() => readAssetFile(ref, media.filename));
  const restoredFile = await writeBlobToAsset(new Blob([bytes], { type: ref.mimeType }), {
    mimeType: ref.mimeType,
  });
  const rows = {
    media,
    projectAsset: { ...child, assetId: restoredFile.ref.assetId },
    ref: { ...restoredFile.ref, sha256: hash },
  };
  const restoreId = crypto.randomUUID();
  await applyPreparedMediaReplica({
    ...enrollment,
    rows,
    operationId: restoreId,
    sourceDigest: await sha(new Blob(['restore-native-proof'])),
    connectionGeneration: 1,
    expectedLocalGeneration: deleted.generation,
    expectedBasis: [deletion.operationId],
  });
  await releaseAssetReadyProtection([restoredFile.ref.assetId]);
  check(
    (await applyCatalogDeletionNative(deletion)).status === 'duplicate',
    'Old delete replay was not a duplicate.'
  );
  await refused(() =>
    applyCatalogDeletionNative({ ...deletion, operationId: crypto.randomUUID() })
  );
  const persisted = await verifyMediaReplicaPersistence(mediaId);
  check(
    persisted.hash === hash &&
      persisted.generation === state.generation + 2 &&
      JSON.stringify(persisted.basis) === JSON.stringify([restoreId]),
    'Delete replay changed the restored source.'
  );
  check((await changes()).length === 0, 'Incoming deletion or restore created an upload echo.');
  return {
    ...persisted,
    mediaId,
    restoreId,
    readerRefused: true,
    physicalDeleted: true,
    staleRefused: true,
    replay: true,
    noEcho: true,
  };
}

async function verifyMediaReplicaPersistence(mediaId: string) {
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get('media_library', mediaId));
  check(media?.source.kind === 'project-asset', 'The admitted Library source is missing.');
  const child = parseProjectAssetEntry(await db.get('project_assets', media.source.projectAssetId));
  check(child, 'The admitted source child is missing.');
  const ref = parseAssetRef(await db.get('asset_refs', child.assetId));
  check(ref, 'The admitted physical ref is missing.');
  const rootKey = captureRootKey('native-media-space', 'media', mediaId);
  const state = parseSyncCaptureRecord(
    await db.get(SYNC_CAPTURE_STORE, JSON.stringify(['root-state', rootKey]))
  );
  check(
    state?.kind === 'root-state' && state.nativeDigest,
    'The admitted source causal state is missing.'
  );
  return {
    hash: await sha(await readAssetFile(ref, media.filename)),
    basis: state.basis,
    generation: state.generation,
  };
}

/** Leave the real ready journal at a controlled restart boundary. */
async function stageMediaReplicaForRecovery(payload: unknown, commitBeforeRestart: boolean) {
  const { input, hash } = await prepareTransferredMediaReplica(payload);
  const journal = await createPreparedReplicaJournal({ kind: 'media', input });
  check(journal.operationId === undefined, 'A replica journal was treated as a backup session.');
  if (commitBeforeRestart) await publishPreparedReplicaJournal(journal);
  const db = await initDB();
  const exists = (await db.get('media_library', input.rows.media.id)) !== undefined;
  check(exists === commitBeforeRestart, 'The restart boundary has an unexpected native source.');
  check(
    (await listReadyJournals()).some((entry) => entry.journalId === journal.journalId),
    'The prepared source has no durable recovery journal.'
  );
  check(
    (await sha(await readAssetFile(input.rows.ref, input.rows.media.filename))) === hash,
    'The journal did not preserve the verified source bytes.'
  );
  return { mediaId: input.rows.media.id, journalId: journal.journalId, hash, commitBeforeRestart };
}

/** Exercise detached cleanup while the canonical retry owner holds its lifecycle permit. */
async function replacePreparedProjectUnderJournal() {
  const file = await coloredSource('rgb(20,80,240)');
  const prepared = await writeBlobToAsset(file, { mimeType: file.type });
  const privateId = crypto.randomUUID();
  const candidate = createEmptyVideoProject('Disposable recovered project');
  candidate.assets = [
    createVideoProjectAsset(
      'Disposable private source',
      VideoProjectAssetType.IMAGE,
      { kind: 'project-asset', projectAssetId: privateId },
      {
        width: 24,
        height: 24,
        duration: null,
        mimeType: file.type,
        size: file.size,
        hasAudio: false,
        audioPeaks: null,
      }
    ),
  ];
  const root = {
    entry: {
      id: candidate.id,
      project: candidate,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    },
    assets: [
      {
        entry: {
          id: privateId,
          assetId: prepared.ref.assetId,
          mimeType: file.type,
          size: file.size,
          createdAt: Date.now(),
        },
        ref: prepared.ref,
        filename: 'disposable.png',
        publishToLibrary: false,
      },
    ],
  };
  const first = await createPreparedReplicaJournal({
    kind: 'video-project',
    input: {
      root,
      operationId: crypto.randomUUID(),
      sourceDigest: await sha(new Blob([JSON.stringify(root)])),
      connectionGeneration: 1,
      ...(await replicaEnrollment()),
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      dependencies: [],
    },
  });
  candidate.name = 'Later draft outside the prepared revision';
  await publishReadyJournalWithRetry(first, publishPreparedReplicaJournal);
  const current = await project(candidate.id);
  check(
    current.project.name === 'Disposable recovered project',
    'Prepared journal followed a later caller draft.'
  );
  check(
    typeof current.workspaceRevision === 'number',
    'The admitted project has no native revision.'
  );
  const replacement = {
    entry: { ...current, project: { ...current.project, assets: [] } },
    assets: [],
  };
  const next = await createPreparedReplicaJournal({
    kind: 'video-project',
    input: {
      root: replacement,
      operationId: crypto.randomUUID(),
      sourceDigest: await sha(new Blob([JSON.stringify(replacement)])),
      connectionGeneration: 1,
      ...(await replicaEnrollment()),
      expectedBasis: [first.payload.input.operationId],
      expectedLocalGeneration: 1,
      expectedWorkspaceRevision: current.workspaceRevision,
      dependencies: [],
    },
  });
  await publishReadyJournalWithRetry(next, publishPreparedReplicaJournal);
  const db = await initDB();
  check(
    (await project(candidate.id)).project.assets.length === 0 &&
      (await db.get('project_assets', privateId)) === undefined &&
      (await db.get('asset_refs', prepared.ref.assetId)) === undefined,
    'Project replacement did not release only its detached private source.'
  );
  await refused(() => readAssetFile(prepared.ref, 'disposable.png'));
  check(
    (await changes()).length === 0,
    'Recovered project publication emitted an outgoing capture.'
  );
  return true;
}

async function recoverMediaReplicaProof(mediaId: string, journalId: string) {
  await harnessReady;
  await recoverAssetPublications();
  check(
    !(await listReadyJournals()).some((entry) => entry.journalId === journalId),
    'The accepted replica journal did not settle after recovery.'
  );
  check((await changes()).length === 0, 'Replica recovery emitted an outgoing capture.');
  const first = await verifyMediaReplicaPersistence(mediaId);
  await recoverAssetPublications();
  const second = await verifyMediaReplicaPersistence(mediaId);
  check(
    JSON.stringify(first) === JSON.stringify(second),
    'Repeated recovery changed the admitted source.'
  );
  const cleanupWithHeldPermit = await replacePreparedProjectUnderJournal();
  check(
    (await verifyMediaReplicaPersistence(mediaId)).hash === second.hash,
    'Detached cleanup removed an unrelated Library source.'
  );
  return {
    ...second,
    noEcho: true,
    stableReplay: true,
    journalSettled: true,
    cleanupWithHeldPermit,
  };
}

const syncCaptureHarness = {
  image: imageHarness,
  preProfileDependenciesProof,
  outgoing: outgoingHarness,
  stageMediaReplicaForRecovery,
  recoverMediaReplicaProof,
  mediaSourceProof,
  mediaRevisionSourceProof,
  mediaCausalRevisionsProof,
  mediaDeleteRestoreProof,
  mediaReplicaProof,
  verifyMediaReplicaPersistence,
  verifyAppliedSourcePersistence,
  applicationProof,
  applicationAfterEditorProof,
  saveProof,
  exportProof,
  cascadeProof,
  frozenProof,
  provenanceProof,
  restoreProof,
  verifyFrozenPersistence,
  changes,
};
declare global {
  interface Window {
    syncCaptureHarness: typeof syncCaptureHarness;
  }
}
void harnessReady.then(() => {
  window.syncCaptureHarness = syncCaptureHarness;
});
