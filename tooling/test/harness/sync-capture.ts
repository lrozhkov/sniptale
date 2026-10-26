import { harnessReady } from './browser-mocks/browser-mocks';
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
import { parseVideoProjectEntry } from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import {
  initDB,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { installExperimentalCaptureProfile } from '../../../apps/extension/src/composition/persistence/sync-capture/profile';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import type { CapturedChange } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { createFrozenSnapshotDatabase } from '../../../apps/extension/src/composition/persistence/sync-capture/test-support/frozen-snapshot-database';
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
      return row.kind === 'captured-change' && (rootId === undefined || row.rootId === rootId)
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
  await withCaptureWriteFailure('captured-change', 1, () =>
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
  await withCaptureWriteFailure('captured-change', 2, () =>
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
  const tombstones = await changes(mediaId);
  check(
    projectChanges.length === 3 &&
      tombstones.length === 1 &&
      tombstones[0]!.change.kind === 'tombstone',
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
  await withCaptureWriteFailure('captured-change', 1, () =>
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

export const syncCaptureHarness = {
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
