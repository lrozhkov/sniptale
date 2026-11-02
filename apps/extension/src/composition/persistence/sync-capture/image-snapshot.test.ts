import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry, createProjectAssetEntry } from '../projects/index.test-support';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  captureImageInTransaction,
  captureMediaInTransaction,
  captureRootCheckpointInTransaction,
} from './capture';
import { readCheckpointInTransaction } from './checkpoints';
import { SCENARIO_CAPTURE_STORES } from './scenario-snapshot';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { deleteScenarioExport } from '../scenario/projects/exports';
import { parseSyncCaptureRecord } from './guards';
import { assetResidencyCopyId } from '../assets/residency-records';
import { captureRootKey } from './contracts';
import {
  parseCapturedImageRows,
  digestCapturedImageRows,
  digestUnloadedImageReplicaRows,
  readImageReplicaPredecessorInTransaction,
  freezeImageInTransaction,
} from './image-snapshot';
import { collectSyncCaptureClaims } from './claims';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../scenario/export-artifacts', async (original) => ({
  ...(await original<typeof import('../scenario/export-artifacts')>()),
  recoverScenarioHtmlPublications: vi.fn(async () => 0),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
}));
beforeEach(() => vi.clearAllMocks());

function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_capture');
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  const media = createMediaLibraryEntry({
    id: 'image',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    mimeType: 'image/png',
    size: 8,
    blob: new Blob(['original'], { type: 'image/png' }),
    workspaceRevision: 0,
    imageContentState: 'original',
    lifecycle: { savedAt: 1, updatedAt: 1, storageClass: 'library' },
  });
  table('media_library').set(media.id, media);
  const ref = {
    assetId: 'source-file',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source-file' },
    mimeType: 'image/png',
    size: 8,
    sha256: null,
  };
  const workspace = {
    aggregateId: media.id,
    createdAt: 1,
    updatedAt: 2,
    revision: 1,
    sourceTitle: null,
    sourceUrl: null,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), ref.assetId),
  };
  const stores = [
    'media_library',
    'image_workspaces',
    'aggregate_presentations',
    'asset_refs',
    'sync_capture',
  ];
  async function capture(edited = false, checkpoint: 'freeze' | 'defer' = 'freeze') {
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(stores, 'readwrite');
      try {
        if (edited) {
          await tx
            .objectStore('media_library')
            .put({ ...media, workspaceRevision: 1, imageContentState: 'edited' });
          await tx.objectStore('image_workspaces').put(workspace);
          await tx.objectStore('asset_refs').put(ref);
        }
        const result = await captureImageInTransaction(tx, media.id, { checkpoint });
        await tx.done;
        return result;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
  }
  return {
    ...fixture,
    media,
    ref,
    workspace,
    table,
    capture,
    fail: () => {
      fail = true;
    },
    allow: () => {
      fail = false;
    },
  };
}

it('captures workspace before presentation without inventing readiness', async () => {
  const f = setup();
  const first = await f.capture();
  const second = await f.capture(true);
  expect(first?.phase).toBe('native');
  expect(second?.phase).toBe('native');
  if (
    first?.phase !== 'native' ||
    first.change.kind !== 'image' ||
    second?.phase !== 'native' ||
    second.change.kind !== 'image'
  )
    throw new Error('Expected image captures.');
  expect(first.change.rows.workspace).toBeNull();
  expect(second.change.rows.workspace?.revision).toBe(1);
  expect(second.change.rows.presentation).toBeNull();
  expect(second.basis).toEqual([first.operationId]);
  expect(await first.change.rows.media.blob?.text()).toBe('original');
  expect(collectSyncCaptureClaims([first, second])).toEqual({
    valid: true,
    assetIds: new Set([f.ref.assetId]),
  });
});

it('rolls back native rows when capture fails and permits exact retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.fail();
  await expect(f.capture(true)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.allow();
  expect(await f.capture(true)).toMatchObject({ generation: 1, change: { kind: 'image' } });
});

it('keeps local-only and temporary image writes outside capture', async () => {
  const f = setup();
  f.table('sync_capture').delete('profile');
  expect(await f.capture()).toBeNull();
  f.table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  f.table('media_library').set(f.media.id, {
    ...f.media,
    lifecycle: { storageClass: 'temporary', updatedAt: 1, savedAt: null },
  });
  expect(await f.capture()).toBeNull();
});

it('rejects missing document refs and bounds metadata without counting Blob bytes', () => {
  const f = setup();
  const rows = {
    media: { ...f.media, workspaceRevision: 1 },
    workspace: f.workspace,
    presentation: null,
    refs: [f.ref],
  };
  expect(parseCapturedImageRows(rows)).not.toBeNull();
  expect(parseCapturedImageRows({ ...rows, refs: [] })).toBeNull();
  expect(
    parseCapturedImageRows({ ...rows, workspace: { ...f.workspace, revision: 2 } })
  ).toBeNull();
  expect(
    parseCapturedImageRows({
      ...rows,
      media: { ...rows.media, sourceTitle: 'x'.repeat(1024 * 1024) },
    })
  ).toBeNull();
  expect(digestCapturedImageRows(rows)).toMatch(/^[a-f0-9]{64}$/u);
});

it('rejects malformed retained image captures and preserves immutable binary slot descriptors', async () => {
  const f = setup();
  const captured = await f.capture();
  expect(parseSyncCaptureRecord(captured)).not.toBeNull();
  if (captured?.phase !== 'native' || captured.change.kind !== 'image')
    throw new Error('Expected image capture.');
  const frozen = structuredClone(captured);
  f.table('media_library').set(f.media.id, {
    ...f.media,
    blob: new Blob(['new-body'], { type: 'image/png' }),
  });
  if (frozen.change.kind !== 'image') throw new Error('Expected frozen image.');
  expect(await frozen.change.rows.media.blob?.text()).toBe('original');
  expect(parseSyncCaptureRecord({ ...captured, sourceSha256: '0'.repeat(64) })).toBeNull();
});

it('serializes controlled parallel image captures into causal predecessors', async () => {
  const f = setup();
  let release!: () => void;
  io.database.mockResolvedValueOnce(f.database).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(f.database);
      })
  );
  const first = f.capture();
  const second = f.capture(true);
  const acceptedFirst = await first;
  release();
  const acceptedSecond = await second;
  expect(acceptedFirst).toMatchObject({ generation: 1 });
  expect(acceptedSecond).toMatchObject({ generation: 2, basis: [acceptedFirst?.operationId] });
});

it('captures stored image originals separately from authored document refs and pins both', async () => {
  const f = setup();
  const { blob: _blob, ...media } = f.media;
  const originalRef = {
    ...f.ref,
    assetId: 'stored-original',
    location: { kind: 'opfs' as const, objectKey: 'objects/stored-original' },
  };
  f.table('media_library').set(media.id, {
    ...media,
    kind: 'image',
    source: { kind: 'stored-asset', assetId: originalRef.assetId },
    workspaceRevision: 1,
  });
  f.table('image_workspaces').set(media.id, f.workspace);
  f.table('asset_refs').set(originalRef.assetId, originalRef);
  f.table('asset_refs').set(f.ref.assetId, f.ref);
  const key = JSON.stringify(['media-library', media.id, 'source']);
  f.table('asset_owners').set(key, {
    ownerKind: 'media-library',
    ownerId: media.id,
    role: 'source',
    assetId: originalRef.assetId,
  });
  const captured = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        'media_library',
        'image_workspaces',
        'aggregate_presentations',
        'asset_refs',
        'asset_owners',
        'sync_capture',
      ],
      'readwrite'
    );
    const result = await captureMediaInTransaction(tx, media.id, { checkpoint: 'freeze' });
    await tx.done;
    return result;
  });
  expect(captured).toMatchObject({
    change: { kind: 'image', rows: { originalRef, refs: [f.ref] } },
  });
  expect(collectSyncCaptureClaims([captured]).assetIds).toEqual(
    new Set([originalRef.assetId, f.ref.assetId])
  );
  f.table('asset_owners').set(key, {
    ownerKind: 'media-library',
    ownerId: 'other',
    role: 'source',
    assetId: originalRef.assetId,
  });
  await expect(
    runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          'media_library',
          'image_workspaces',
          'aggregate_presentations',
          'asset_refs',
          'asset_owners',
          'sync_capture',
        ],
        'readwrite'
      );
      return captureMediaInTransaction(tx, media.id, { checkpoint: 'freeze' });
    })
  ).rejects.toThrow('ownership');
});

async function unloadedImage(duplicate = false, blobType = 'image/png') {
  const f = setup();
  f.rows.set('asset_residency', new Map());
  const originalMedia = { ...f.media, blob: new Blob(['original'], { type: blobType }) };
  f.table('media_library').set(f.media.id, originalMedia);
  if (duplicate)
    f.table('aggregate_presentations').set(JSON.stringify(['image', f.media.id]), {
      aggregateId: f.media.id,
      aggregateKind: 'image',
      presentationRevision: 0,
      previewBlob: f.media.blob,
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
      updatedAt: 1,
    });
  const captured = await f.capture();
  if (!captured || captured.phase !== 'native' || captured.change.kind !== 'image')
    throw new Error('Expected image');
  const rootKey = captureRootKey('space', 'media', f.media.id);
  const state = parseSyncCaptureRecord(
    f.table('sync_capture').get(JSON.stringify(['root-state', rootKey]))
  );
  if (!state || state.kind !== 'root-state') throw new Error('Expected current state');
  const id = assetResidencyCopyId({ kind: 'inline-image', mediaId: f.media.id });
  const copy = {
    version: 1,
    kind: 'copy',
    id,
    revision: 2,
    operationId: 'unload',
    phase: 'unloaded',
    lastUsedAt: 1,
    target: {
      kind: 'inline-image',
      mediaId: f.media.id,
      createdAt: f.media.createdAt,
      workspaceRevision: 0,
      rootGeneration: state.generation,
      nativeDigest: state.nativeDigest,
      size: f.media.size,
      mimeType: f.media.mimeType,
      blobType,
      ...(duplicate
        ? { duplicatePreview: { presentationRevision: 0, blobType: 'image/png' } }
        : {}),
    },
    remote: {
      key: 'Originals/original.png',
      sha256: 'a'.repeat(64),
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.example.test/root/',
        accountId: 'alice',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
    },
  };
  f.table('asset_residency').set(id, copy);
  const { blob: _blob, ...media } = originalMedia;
  f.table('media_library').set(media.id, media);
  if (duplicate)
    f.table('aggregate_presentations').set(JSON.stringify(['image', media.id]), {
      aggregateId: media.id,
      aggregateKind: 'image',
      presentationRevision: 0,
      thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
      updatedAt: 1,
    });
  const tx = () =>
    f.database.transaction(
      [
        'asset_residency',
        'sync_capture',
        'media_library',
        'image_workspaces',
        'aggregate_presentations',
        'asset_refs',
        'asset_owners',
      ],
      'readonly'
    ) as unknown as Parameters<typeof readImageReplicaPredecessorInTransaction>[0];
  return {
    ...f,
    copy,
    state,
    media,
    tx,
    read: () => readImageReplicaPredecessorInTransaction(tx(), media.id, state),
  };
}

it.each([
  [false, 'image/png'],
  [true, 'image/png'],
  [false, ''],
  [true, ''],
] as const)(
  'projects the exact accepted metadata digest without fabricating or reading missing Blob slots (preview=%s, type=%s)',
  async (duplicate, blobType) => {
    const f = await unloadedImage(duplicate, blobType);
    const readBytes = vi.spyOn(Blob.prototype, 'arrayBuffer');
    try {
      const previous = await f.read();
      expect(previous.digest).toBe(f.state.nativeDigest);
      expect(previous.rows.media.blob).toBeUndefined();
      expect(previous.unloadedCopy).toEqual(f.copy);
      expect(parseCapturedImageRows(previous.rows)).toBeNull();
      await expect(freezeImageInTransaction(f.tx(), f.media.id)).rejects.toThrow(
        'Unsupported screenshot'
      );
      expect(readBytes).not.toHaveBeenCalled();
    } finally {
      readBytes.mockRestore();
    }
  }
);

it.each([
  'missing-copy',
  'wrong-phase',
  'epoch',
  'space',
  'descriptor',
  'metadata',
  'malformed',
] as const)('refuses an unloaded predecessor with changed %s evidence', async (change) => {
  const f = await unloadedImage();
  if (change === 'missing-copy') f.table('asset_residency').clear();
  if (change === 'wrong-phase')
    f.table('asset_residency').set(f.copy.id, { ...f.copy, phase: 'resident' });
  if (change === 'epoch')
    f.table('asset_residency').set(f.copy.id, {
      ...f.copy,
      target: { ...f.copy.target, rootGeneration: 2 },
    });
  if (change === 'space')
    f.table('asset_residency').set(f.copy.id, {
      ...f.copy,
      remote: { ...f.copy.remote, binding: { ...f.copy.remote.binding, spaceId: 'foreign' } },
    });
  if (change === 'descriptor')
    f.table('asset_residency').set(f.copy.id, {
      ...f.copy,
      target: { ...f.copy.target, blobType: '' },
    });
  if (change === 'metadata')
    f.table('media_library').set(f.media.id, { ...f.media, tags: ['changed'] });
  if (change === 'malformed')
    f.table('asset_residency').set(f.copy.id, { ...f.copy, unexpected: true });
  await expect(f.read()).rejects.toThrow();
});

it('refuses a returned preview under an unloaded duplicate descriptor', async () => {
  const f = await unloadedImage(true);
  f.table('aggregate_presentations').set(JSON.stringify(['image', f.media.id]), {
    aggregateId: f.media.id,
    aggregateKind: 'image',
    presentationRevision: 0,
    previewBlob: new Blob(['original'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
    updatedAt: 1,
  });
  await expect(f.read()).rejects.toThrow('preview changed');
});

async function guideWithUnloadedScreenshot() {
  const f = await unloadedImage();
  for (const name of SCENARIO_CAPTURE_STORES) if (!f.rows.has(name)) f.rows.set(name, new Map());
  const project = createGuideProject('Copied screenshot', 'guide', 1);
  const step = createGuideStep('Image', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image-block',
      assetId: 'scenario-image',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'image.png' },
    })
  );
  project.items.push(step);
  const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 });
  f.table('scenario_projects').set(entry.id, entry);
  f.table('scenario_assets').set('scenario-image', {
    id: 'scenario-image',
    projectId: entry.id,
    assetId: f.ref.assetId,
    galleryAssetId: f.media.id,
    mimeType: 'image/png',
    width: 10,
    height: 10,
    createdAt: 1,
    size: 8,
  });
  f.table('asset_refs').set(f.ref.assetId, f.ref);
  f.table('asset_owners').set(JSON.stringify(['scenario-asset', 'scenario-image', 'body']), {
    ownerKind: 'scenario-asset',
    ownerId: 'scenario-image',
    role: 'body',
    assetId: f.ref.assetId,
  });
  const body = {
    ...f.ref,
    assetId: 'html-body',
    location: { kind: 'opfs', objectKey: 'objects/html-body' },
  };
  const ownerKey = JSON.stringify(['scenario-export', 'html-export', 'body']);
  f.table('asset_refs').set(body.assetId, body);
  f.table('asset_owners').set(ownerKey, {
    ownerKind: 'scenario-export',
    ownerId: 'html-export',
    role: 'body',
    assetId: body.assetId,
  });
  f.table('scenario_exports').set('html-export', {
    id: 'html-export',
    projectId: entry.id,
    format: 'html',
    filename: 'guide.html',
    createdAt: 2,
    size: 8,
    html: { mode: 'guide', assetId: body.assetId },
    trashState: { updatedAt: 3, trashedAt: 3 },
  });
  return { ...f, entry, body, ownerKey };
}

async function checkpointGuide(f: Awaited<ReturnType<typeof guideWithUnloadedScreenshot>>) {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([...SCENARIO_CAPTURE_STORES], 'readwrite');
    try {
      const pending = await readCheckpointInTransaction(
        tx,
        { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
        { rootKind: 'scenario-project', rootId: f.entry.id }
      );
      if (!pending) throw new Error('Expected the accepted Guide checkpoint.');
      const result = await captureRootCheckpointInTransaction(tx, pending, { force: true });
      await tx.done;
      return result;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

it('purges a Guide export with an exact unloaded screenshot dependency without new image bytes', async () => {
  const f = await guideWithUnloadedScreenshot();
  await deleteScenarioExport('html-export');
  await checkpointGuide(f);
  expect(f.table('scenario_exports').has('html-export')).toBe(false);
  expect(f.table('asset_refs').has(f.body.assetId)).toBe(false);
  expect(f.table('asset_owners').has(f.ownerKey)).toBe(false);
  expect(f.table('media_library').get(f.media.id)).not.toHaveProperty('blob');
  const captures = [...f.table('sync_capture').values()].map(parseSyncCaptureRecord);
  const parents = captures.filter(
    (row) =>
      row?.kind === 'sync-operation' &&
      row.phase === 'native' &&
      row.change.kind === 'scenario-project'
  );
  expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({
    change: {
      rows: {
        exports: [],
        mediaDependencies: [
          {
            mediaId: f.media.id,
            generation: f.state.generation,
            basis: f.state.basis,
          },
        ],
      },
    },
  });
  expect(
    captures.filter((row) => row?.kind === 'sync-operation' && row.rootKind === 'media')
  ).toHaveLength(1);
});

it('preserves the accepted export purge and retries its refused checkpoint after dependency repair', async () => {
  const f = await guideWithUnloadedScreenshot();
  const original = f.table('media_library').get(f.media.id);
  f.table('media_library').set(f.media.id, { ...f.media, createdAt: f.media.createdAt + 1 });
  await deleteScenarioExport('html-export');
  expect(f.table('scenario_exports').has('html-export')).toBe(false);
  expect(f.table('asset_refs').has(f.body.assetId)).toBe(false);
  const beforeRefusal = structuredClone(f.rows);
  await expect(checkpointGuide(f)).rejects.toThrow();
  expect(f.rows).toEqual(beforeRefusal);
  f.table('media_library').set(f.media.id, original);
  const accepted = await checkpointGuide(f);
  expect(accepted).toMatchObject({
    phase: 'native',
    change: { kind: 'scenario-project', rows: { exports: [] } },
  });
  expect(f.table('scenario_exports').has('html-export')).toBe(false);
});

it.each([0, 1])(
  'freezes only matching image presentation at revision %s without changing native render data',
  async (presentationRevision) => {
    const f = setup();
    const presentation = {
      aggregateId: f.media.id,
      aggregateKind: 'image',
      presentationRevision,
      thumbnailBlob: new Blob(['thumbnail'], { type: 'image/webp' }),
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      updatedAt: 2,
    };
    f.table('sync_capture').set('profile', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'space',
      connectionGeneration: 1,
      checkpointIntervalMs: 300000,
    });
    f.table('aggregate_presentations').set(JSON.stringify(['image', f.media.id]), presentation);
    expect(await f.capture(true, 'defer')).toBeNull();
    await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          'media_library',
          'image_workspaces',
          'aggregate_presentations',
          'asset_refs',
          'sync_capture',
        ],
        'readwrite'
      );
      try {
        const root = { rootKind: 'media' as const, rootId: f.media.id };
        const pending = await readCheckpointInTransaction(
          tx,
          { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
          root
        );
        if (!pending) throw new Error('Expected pending image checkpoint.');
        const captured = await captureRootCheckpointInTransaction(tx, pending, {
          now: pending.dueAt,
        });
        if (captured?.phase !== 'native' || captured.change.kind !== 'image')
          throw new Error('Expected image checkpoint.');
        expect(captured.change.rows.workspace?.revision).toBe(1);
        expect(captured.change.rows.presentation).toEqual(
          presentationRevision === 1 ? presentation : null
        );
        const state = parseSyncCaptureRecord(
          await tx.objectStore('sync_capture').get(JSON.stringify(['root-state', captured.rootKey]))
        );
        if (!state || state.kind !== 'root-state') throw new Error('Expected native root state.');
        const predecessor = await readImageReplicaPredecessorInTransaction(tx, f.media.id, state);
        expect(predecessor.digest).toBe(state.nativeDigest);
        expect(predecessor.rows.presentation).toEqual(presentation);
        await tx.done;
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
    expect(f.table('aggregate_presentations').get(JSON.stringify(['image', f.media.id]))).toEqual(
      presentation
    );
  }
);

it.each([false, true])(
  'hashes a new unloaded presentation as the same full native after-image (previous duplicate=%s)',
  async (duplicate) => {
    const f = await unloadedImage(duplicate);
    const before = await f.read();
    if (before.unloadedCopy?.target.kind !== 'inline-image')
      throw new Error('Expected inline copy');
    const previousTarget = before.unloadedCopy.target;
    const { duplicatePreview: _duplicatePreview, ...original } = previousTarget;
    const presentation = {
      aggregateId: f.media.id,
      aggregateKind: 'image' as const,
      presentationRevision: 0,
      previewBlob: new Blob(['independent-render'], { type: 'image/webp' }),
      thumbnailBlob: new Blob(['new-thumbnail'], { type: 'image/webp' }),
      updatedAt: 2,
    };
    const after = { ...before.rows, presentation };
    const readBytes = vi.spyOn(Blob.prototype, 'arrayBuffer');
    try {
      const digest = digestUnloadedImageReplicaRows(after, original);
      expect(digest).toBe(
        digestCapturedImageRows({
          ...after,
          media: { ...after.media, blob: new Blob(['original'], { type: original.blobType }) },
        })
      );
      expect(parseCapturedImageRows(after)).toBeNull();
      expect(readBytes).not.toHaveBeenCalled();
      if (duplicate) {
        expect(() => digestUnloadedImageReplicaRows(after, previousTarget)).toThrow();
      }
    } finally {
      readBytes.mockRestore();
    }
  }
);

it.each(['valid', 'child-id', 'child-ref', 'owner', 'mime', 'size', 'borrowed', 'blob'] as const)(
  'freezes only the exact imported Image original child ref owner and workspace closure: %s',
  async (fault) => {
    const f = setup();
    const id = 'project-asset:imported-image';
    const child = createProjectAssetEntry({
      id: 'imported-image',
      assetId: f.ref.assetId,
      size: f.ref.size,
      mimeType: f.ref.mimeType,
    });
    const media = {
      ...f.media,
      id,
      kind: 'image' as const,
      source: { kind: 'project-asset' as const, projectAssetId: child.id },
      blob: undefined,
      workspaceRevision: 1,
      imageContentState: 'edited' as const,
    };
    f.table('media_library').set(id, media);
    f.table('project_assets').set(child.id, {
      ...child,
      ...(fault === 'child-id' ? { id: 'other' } : {}),
      ...(fault === 'child-ref' ? { assetId: 'other' } : {}),
      ...(fault === 'mime' ? { mimeType: 'image/jpeg' } : {}),
      ...(fault === 'size' ? { size: 9 } : {}),
      ...(fault === 'borrowed' ? { originMediaId: 'foreign' } : {}),
    });
    f.table('asset_refs').set(f.ref.assetId, f.ref);
    f.table('asset_owners').set(JSON.stringify(['project-asset', child.id, 'body']), {
      assetId: fault === 'owner' ? 'other' : f.ref.assetId,
      ownerKind: 'project-asset',
      ownerId: child.id,
      role: 'body',
    });
    f.table('image_workspaces').set(id, { ...f.workspace, aggregateId: id });
    if (fault === 'blob')
      f.table('media_library').set(id, {
        ...media,
        blob: new Blob(['original'], { type: 'image/png' }),
      });
    const before = structuredClone(f.rows);
    await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          'media_library',
          'project_assets',
          'asset_refs',
          'asset_owners',
          'image_workspaces',
          'aggregate_presentations',
        ],
        'readonly'
      );
      if (fault === 'valid') {
        const frozen = await freezeImageInTransaction(tx, id);
        expect(frozen.projectAsset).toEqual(child);
        expect(frozen.originalRef).toEqual(f.ref);
        expect(frozen.workspace?.aggregateId).toBe(id);
      } else await expect(freezeImageInTransaction(tx, id)).rejects.toThrow();
      await tx.done;
    });
    expect(f.rows).toEqual(before);
  }
);

it('rebases a clean imported Image presentation cache without creating authored work', async () => {
  const f = setup();
  const id = 'project-asset:cache-import';
  const child = createProjectAssetEntry({
    id: 'cache-import',
    assetId: f.ref.assetId,
    mimeType: f.ref.mimeType,
    size: f.ref.size,
  });
  const { blob: _blob, ...base } = f.media;
  const media = {
    ...base,
    id,
    source: { kind: 'project-asset' as const, projectAssetId: child.id },
    workspaceRevision: 1,
    imageContentState: 'edited' as const,
  };
  f.table('media_library').set(id, media);
  f.table('project_assets').set(child.id, child);
  f.table('asset_refs').set(f.ref.assetId, f.ref);
  f.table('asset_owners').set(JSON.stringify(['project-asset', child.id, 'body']), {
    ownerKind: 'project-asset',
    ownerId: child.id,
    role: 'body',
    assetId: f.ref.assetId,
  });
  f.table('image_workspaces').set(id, { ...f.workspace, aggregateId: id });
  const database = {
    ...f.database,
    transaction(stores: string[], mode: string) {
      const tx = f.database.transaction(stores, mode);
      return {
        ...tx,
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return name === 'aggregate_presentations'
            ? {
                ...store,
                get: (key: IDBValidKey) =>
                  store.get(
                    Array.isArray(key) && key[0] === 'image' && typeof key[1] === 'string'
                      ? key[1]
                      : key
                  ),
              }
            : store;
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
  const stores = [
    'sync_capture',
    'media_library',
    'project_assets',
    'asset_refs',
    'asset_owners',
    'image_workspaces',
    'aggregate_presentations',
  ];
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(stores, 'readwrite');
    await captureImageInTransaction(tx, id, { checkpoint: 'freeze' });
    await tx.done;
  });
  const rootKey = captureRootKey('space', 'media', id);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const before = parseSyncCaptureRecord(f.table('sync_capture').get(stateKey));
  if (before?.kind !== 'root-state') throw new Error('Expected native Image state');
  const captureRows = structuredClone(f.table('sync_capture'));
  const { commitImagePresentation } = await import('../image-aggregates/mutations');
  await commitImagePresentation({
    aggregateId: id,
    expectedWorkspaceRevision: 1,
    previewBlob: new Blob(['rendered'], { type: 'image/png' }),
    thumbnailBlob: new Blob(['thumb'], { type: 'image/png' }),
  });
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(stores, 'readonly');
    const rows = await freezeImageInTransaction(tx, id);
    await tx.done;
    expect(rows.presentation?.previewBlob).toBeInstanceOf(Blob);
    expect(f.table('sync_capture').get(stateKey)).toEqual({
      ...before,
      nativeDigest: digestCapturedImageRows(rows),
    });
    expect(digestCapturedImageRows(rows)).not.toBe(before.nativeDigest);
  });
  captureRows.delete(stateKey);
  const after = structuredClone(f.table('sync_capture'));
  after.delete(stateKey);
  expect(after).toEqual(captureRows);
});
