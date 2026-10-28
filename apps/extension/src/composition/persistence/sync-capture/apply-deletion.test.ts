import type { PreparedVideoReviewReplicaRoot } from './prepared-review';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import { applyPreparedVideoReviewReplica } from './apply-review';
import {
  workspace as reviewTemplate,
  annotation,
} from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { fixtureWorkspaceValue } from '../review-workspaces/store.test-support';
import { commitVideoWorkspace } from '../review-workspaces/store';
import {
  isPersistenceMutationTransitionHeld,
  runWithPersistentDataErasureBarrier,
} from '../infrastructure/mutation-barrier';
import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { applyPreparedMediaReplica } from './apply-media';
import { applyPreparedVideoProjectRevision } from './apply-video-project';
import { captureRootKey } from './contracts';
import { digestCapturedMediaRows } from './freeze';
import { parseSyncCaptureRecord } from './guards';
import { applyCatalogDeletionNative, type ApplyCatalogDeletionInput } from './apply-deletion';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  journals: vi.fn(),
  cleanup: vi.fn(),
  afterResource: vi.fn(),
  busy: false,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  listReadyJournals: io.journals,
  completePhysicalDeleteOperation: io.cleanup,
}));
vi.mock('../assets/resource-sessions', async (original) => ({
  ...(await original<typeof import('../assets/resource-sessions')>()),
  tryAssetResourceCleanup: async (operation: () => Promise<unknown>) => {
    if (io.busy) return undefined;
    const result = await operation();
    io.afterResource();
    return result;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.afterResource.mockReset();
  io.busy = false;
  io.journals.mockResolvedValue([]);
  io.cleanup.mockResolvedValue(undefined);
});

async function setup(kind: 'media' | 'video-project' = 'media') {
  let refused = false;
  const f = createReviewWorkspaceStoreFixture((store) => refused && store === 'sync_capture');
  const table = (name: string) => f.rows.get(name)!;
  io.database.mockResolvedValue(f.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  });
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'image/png',
    size: 6,
    sha256: 'b'.repeat(64),
  };
  const rows = {
    ref,
    projectAsset: {
      id: 'source',
      assetId: ref.assetId,
      createdAt: 1,
      mimeType: ref.mimeType,
      size: ref.size,
    },
    media: createMediaLibraryEntry({
      id: 'project-asset:source',
      source: { kind: 'project-asset', projectAssetId: 'source' },
      mimeType: ref.mimeType,
      size: ref.size,
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    }),
  };
  const admission = {
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 3,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    operationId: 'original',
    sourceDigest: 'a'.repeat(64),
  };
  const project = createVideoProjectEntryWithMediaClip({ id: 'project' });
  project.project.assets = [];
  project.project.clips = [];
  if (kind === 'media') await applyPreparedMediaReplica({ ...admission, rows });
  else
    await applyPreparedVideoProjectRevision({
      ...admission,
      root: { entry: project, assets: [] },
      dependencies: [],
      expectedWorkspaceRevision: null,
    });
  const input: ApplyCatalogDeletionInput = {
    ...admission,
    operationId: 'delete',
    sourceDigest: 'c'.repeat(64),
    rootKind: kind,
    rootId: kind === 'media' ? rows.media.id : project.id,
    expectedLocalGeneration: 1,
    expectedBasis: ['original'],
    expectedWorkspaceRevision: kind === 'media' ? null : 1,
  };
  const rootKey = captureRootKey('space', kind, input.rootId);
  return {
    ...f,
    nativeRows: f.rows,
    table,
    input,
    rows,
    project,
    admission,
    stateKey: JSON.stringify(['root-state', rootKey]),
    refuseStorage(value: boolean) {
      refused = value;
    },
  };
}

it.each(['media', 'video-project'] as const)(
  'deletes an admitted %s root with an atomic graveyard and no outgoing echo',
  async (kind) => {
    const f = await setup(kind);
    expect(await applyCatalogDeletionNative(f.input)).toEqual({ status: 'applied', generation: 2 });
    expect(f.table(kind === 'media' ? 'media_library' : 'video_projects').has(f.input.rootId)).toBe(
      false
    );
    expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
      generation: 2,
      basis: ['delete'],
      deleted: true,
    });
    expect(f.table('sync_capture').get(f.stateKey)).not.toHaveProperty('nativeDigest');
    expect(f.table('sync_capture').get(f.stateKey)).toHaveProperty('deleted', true);
    expect(
      [...f.table('sync_capture').values()].some(
        (raw) => parseSyncCaptureRecord(raw)?.kind === 'sync-operation'
      )
    ).toBe(false);
    if (kind === 'media') {
      expect(f.table('project_assets').has('source')).toBe(false);
      expect(f.table('asset_operations').size).toBe(1);
      expect(io.cleanup).toHaveBeenCalledWith(
        expect.objectContaining({ assetIds: ['body'] }),
        expect.anything()
      );
    } else expect(f.table('video_project_revisions').get('project')).toMatchObject({ revision: 1 });
  }
);

it.each(['media', 'video-project'] as const)(
  'admits a generation-zero graveyard for an unclaimed %s target',
  async (kind) => {
    const f = await setup(kind);
    const input = {
      ...f.input,
      rootId: 'absent',
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
    };
    expect(await applyCatalogDeletionNative(input)).toEqual({ status: 'applied', generation: 1 });
    expect(io.cleanup).not.toHaveBeenCalled();
  }
);

it.each(['media', 'video-project'] as const)(
  'rolls back a refused %s deletion and permits exact retry',
  async (kind) => {
    const f = await setup(kind);
    const before = structuredClone(f.table('sync_capture'));
    const nativeBefore = structuredClone(
      f.table(kind === 'media' ? 'media_library' : 'video_projects')
    );
    f.refuseStorage(true);
    await expect(applyCatalogDeletionNative(f.input)).rejects.toThrow('No space');
    expect(f.table('sync_capture')).toEqual(before);
    expect(f.table(kind === 'media' ? 'media_library' : 'video_projects')).toEqual(nativeBefore);
    expect(io.cleanup).not.toHaveBeenCalled();
    f.refuseStorage(false);
    expect(await applyCatalogDeletionNative(f.input)).toEqual({ status: 'applied', generation: 2 });
  }
);

it('refuses a competing deletion after the first commit', async () => {
  const f = await setup();
  await applyCatalogDeletionNative(f.input);
  const before = structuredClone(f.table('sync_capture'));
  await expect(
    applyCatalogDeletionNative({ ...f.input, operationId: 'competing' })
  ).rejects.toThrow('Incoming deletion refused');
  expect(f.table('sync_capture')).toEqual(before);
});

it.each(['media', 'video-project'] as const)(
  'refuses a delayed delete after restore or same-ID recreation of %s',
  async (kind) => {
    const f = await setup(kind);
    await applyCatalogDeletionNative(f.input);
    if (kind === 'media') {
      await applyPreparedMediaReplica({
        ...f.admission,
        rows: f.rows,
        operationId: 'restore',
        expectedLocalGeneration: 2,
        expectedBasis: ['delete'],
      });
    } else
      await applyPreparedVideoProjectRevision({
        ...f.admission,
        root: { entry: f.project, assets: [] },
        dependencies: [],
        operationId: 'restore',
        expectedLocalGeneration: 2,
        expectedBasis: ['delete'],
        expectedWorkspaceRevision: null,
      });
    const before = structuredClone(f.table(kind === 'media' ? 'media_library' : 'video_projects'));
    await expect(
      applyCatalogDeletionNative({ ...f.input, operationId: 'stale-delete' })
    ).rejects.toThrow();
    expect(f.table(kind === 'media' ? 'media_library' : 'video_projects')).toEqual(before);
    expect(await applyCatalogDeletionNative(f.input)).toEqual({
      status: 'duplicate',
      generation: 2,
    });
    expect(f.table(kind === 'media' ? 'media_library' : 'video_projects')).toEqual(before);
  }
);

it('refuses a pending source publication and active resource readers', async () => {
  const f = await setup();
  const before = structuredClone(f.table('media_library'));
  io.journals.mockResolvedValue([
    { domain: 'project-assets', payload: { entry: { id: 'source' } } },
  ]);
  await expect(applyCatalogDeletionNative(f.input)).rejects.toThrow();
  io.journals.mockResolvedValue([]);
  io.busy = true;
  await expect(applyCatalogDeletionNative(f.input)).rejects.toThrow();
  expect(f.table('media_library')).toEqual(before);
});

it('retains independent dependent roots instead of applying a media cascade', async () => {
  const f = await setup();
  const dependent = createVideoProjectEntryWithMediaClip({ id: 'independent' });
  dependent.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.input.rootId };
  f.table('video_projects').set(dependent.id, dependent);
  const before = structuredClone(f.table('video_projects'));
  await expect(applyCatalogDeletionNative(f.input)).rejects.toThrow();
  expect(f.table('video_projects')).toEqual(before);
  expect(f.table('media_library').has(f.input.rootId)).toBe(true);
});

it.each(['space', 'lifetime', 'generation', 'basis', 'workspace'] as const)(
  'refuses changed admission: %s',
  async (change) => {
    const f = await setup('video-project');
    const input = {
      ...f.input,
      ...(change === 'space' ? { spaceId: 'different' } : {}),
      ...(change === 'lifetime' ? { profileCreatedAt: 2 } : {}),
      ...(change === 'generation' ? { expectedLocalGeneration: 3 } : {}),
      ...(change === 'basis' ? { expectedBasis: ['other-branch'] } : {}),
      ...(change === 'workspace' ? { expectedWorkspaceRevision: 4 } : {}),
    };
    const before = structuredClone(f.table('video_projects'));
    await expect(applyCatalogDeletionNative(input)).rejects.toThrow();
    expect(f.table('video_projects')).toEqual(before);
  }
);

it('retains a shared physical source owner when deleting the media root', async () => {
  const f = await setup();
  const owner = {
    assetId: 'body',
    ownerKind: 'project-asset',
    ownerId: 'independent',
    role: 'body',
  };
  f.table('asset_owners').set(JSON.stringify(['project-asset', 'independent', 'body']), owner);
  await applyCatalogDeletionNative(f.input);
  expect(f.table('asset_refs').get('body')).toEqual(f.rows.ref);
  expect([...f.table('asset_owners').values()]).toEqual([owner]);
  expect(io.cleanup).not.toHaveBeenCalled();
});

it('retains independent Library sources and saved exports when deleting their consumer project', async () => {
  const f = await setup();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'consumer' });
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: f.input.rootId };
  entry.project.assets[0]!.metadata = {
    ...entry.project.assets[0]!.metadata,
    mimeType: f.rows.ref.mimeType,
    size: f.rows.ref.size,
  };
  await applyPreparedVideoProjectRevision({
    ...f.admission,
    operationId: 'consumer-op',
    root: { entry, assets: [] },
    expectedWorkspaceRevision: null,
    dependencies: [
      { entry: f.rows.media, ref: f.rows.ref, expectedGeneration: 1, expectedBasis: ['original'] },
    ],
  });
  const exported = {
    id: 'independent-export',
    projectId: 'consumer',
    assetId: 'export-body',
    createdAt: 1,
    filename: 'saved.png',
    mimeType: 'image/png',
    size: 6,
  };
  f.table('project_exports').set(exported.id, exported);
  await applyCatalogDeletionNative({
    ...f.input,
    rootKind: 'video-project',
    rootId: 'consumer',
    expectedBasis: ['consumer-op'],
    expectedWorkspaceRevision: 1,
  });
  expect(f.table('media_library').get(f.input.rootId)).toMatchObject({ id: f.input.rootId });
  expect(f.table('project_assets').get('source')).toEqual(f.rows.projectAsset);
  expect(f.table('project_exports').get(exported.id)).toEqual(exported);
  expect(io.cleanup).not.toHaveBeenCalled();
});

it('refuses cancellation while waiting for ready-publication discovery without changing native data', async () => {
  const f = await setup();
  const before = structuredClone(f.table('media_library'));
  const causalBefore = structuredClone(f.table('sync_capture'));
  let entered!: () => void;
  let release!: (journals: never[]) => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.journals.mockImplementationOnce(() => {
    entered();
    return new Promise<never[]>((resolve) => {
      release = resolve;
    });
  });
  const controller = new AbortController();
  const pending = applyCatalogDeletionNative(f.input, controller.signal);
  const refused = expect(pending).rejects.toThrow();
  await ready;
  controller.abort();
  release([]);
  await refused;
  expect(f.table('media_library')).toEqual(before);
  expect(f.table('sync_capture')).toEqual(causalBefore);
  expect(f.table('asset_operations').size).toBe(0);
  expect(io.cleanup).not.toHaveBeenCalled();
});

it.each(['absent', 'video-project:absent'])(
  'refuses generation-zero project admission with orphan authored history at %s',
  async (aggregateId) => {
    const f = await setup('video-project');
    f.table('video_workspace_history').set(JSON.stringify([aggregateId, 0]), {
      aggregateId,
      ordinal: 0,
    });
    const before = structuredClone(f.table('sync_capture'));
    await expect(
      applyCatalogDeletionNative({
        ...f.input,
        rootId: 'absent',
        expectedLocalGeneration: 0,
        expectedBasis: [],
        expectedWorkspaceRevision: null,
      })
    ).rejects.toThrow();
    expect(f.table('sync_capture')).toEqual(before);
    expect(f.table('video_workspace_history').size).toBe(1);
  }
);

it('returns the committed deletion when cancellation arrives before physical cleanup', async () => {
  const f = await setup();
  const controller = new AbortController();
  io.afterResource.mockImplementationOnce(() => controller.abort());
  expect(await applyCatalogDeletionNative(f.input, controller.signal)).toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(f.table('media_library').has(f.input.rootId)).toBe(false);
  expect(f.table('asset_operations').size).toBe(1);
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({ basis: ['delete'] });
  expect(io.cleanup).not.toHaveBeenCalled();
});

it('restores a deleted media root through native admission without replaying the old deletion', async () => {
  const f = await setup();
  await applyCatalogDeletionNative(f.input);
  const rows = structuredClone(f.rows);
  rows.ref.assetId = 'restored-body';
  rows.ref.location.objectKey = 'objects/restored-body';
  rows.projectAsset.assetId = rows.ref.assetId;
  const restored = await applyPreparedMediaReplica({
    ...f.admission,
    rows,
    operationId: 'restore-media',
    sourceDigest: 'd'.repeat(64),
    expectedLocalGeneration: 2,
    expectedBasis: ['delete'],
  });
  expect(restored).toEqual({ status: 'applied', generation: 3 });
  expect(f.table('project_assets').get('source')).toEqual(rows.projectAsset);
  expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
    generation: 3,
    basis: ['restore-media'],
    nativeDigest: digestCapturedMediaRows(rows),
  });
  expect(f.table('sync_capture').get(f.stateKey)).not.toHaveProperty('deleted');
  const source = structuredClone(f.table('media_library').get(f.input.rootId));
  expect(await applyCatalogDeletionNative(f.input)).toEqual({ status: 'duplicate', generation: 2 });
  expect(f.table('media_library').get(f.input.rootId)).toEqual(source);
});

it('keeps privacy erasure outside incoming deletion until physical cleanup finishes', async () => {
  const f = await setup();
  let erasure: Promise<void> | undefined;
  let erasureEntered = false;
  let cleanupFinished = false;
  let entered!: () => void;
  let release!: () => void;
  const cleanupEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finishCleanup = new Promise<void>((resolve) => {
    release = resolve;
  });
  io.cleanup.mockImplementationOnce(async () => {
    expect(isPersistenceMutationTransitionHeld()).toBe(true);
    const intent = structuredClone(f.table('asset_operations'));
    expect(intent.size).toBe(1);
    erasure = runWithPersistentDataErasureBarrier(async () => {
      erasureEntered = true;
      expect(cleanupFinished).toBe(true);
      expect(f.table('asset_operations')).toEqual(intent);
      expect(f.table('sync_capture').get(f.stateKey)).toMatchObject({
        deleted: true,
        basis: ['delete'],
      });
    });
    entered();
    await finishCleanup;
    cleanupFinished = true;
  });
  const deletion = applyCatalogDeletionNative(f.input);
  await cleanupEntered;
  expect(erasureEntered).toBe(false);
  expect(isPersistenceMutationTransitionHeld()).toBe(true);
  release();
  expect(await deletion).toEqual({ status: 'applied', generation: 2 });
  expect(erasure).toBeDefined();
  await erasure;
  expect(erasureEntered).toBe(true);
  expect(isPersistenceMutationTransitionHeld()).toBe(false);
});

async function setupReview() {
  const f = await setup();
  const rows = structuredClone(f.rows);
  rows.ref.assetId = 'video-body';
  rows.ref.location.objectKey = 'objects/video-body';
  rows.projectAsset.assetId = rows.ref.assetId;
  rows.ref.mimeType = 'video/webm';
  rows.projectAsset.mimeType = rows.ref.mimeType;
  rows.media.kind = 'video';
  rows.media.mimeType = rows.ref.mimeType;
  await applyPreparedMediaReplica({
    ...f.admission,
    rows,
    operationId: 'video-source',
    expectedLocalGeneration: 1,
    expectedBasis: ['original'],
  });
  const makeReview = (id: string) => ({
    ...f.admission,
    operationId: `review-${id}`,
    expectedWorkspaceRevision: null,
    root: {
      review: {
        workspace: materializeVideoWorkspaceProject(
          {
            ...structuredClone(reviewTemplate),
            aggregateId: id,
            sourceAssetId: rows.ref.assetId,
            history: [],
            cursor: 0,
            ...(id === rows.media.id ? {} : { sourceMediaId: rows.media.id }),
          },
          'Review'
        ),
        draft: null,
      },
      sourceMediaId: rows.media.id,
      assets: [],
    },
    dependencies: [
      { entry: rows.media, ref: rows.ref, expectedGeneration: 2, expectedBasis: ['video-source'] },
    ],
  });
  const value = makeReview(rows.media.id);
  const archive = makeReview('project-asset:quick-project:archive');
  await applyPreparedVideoReviewReplica(value);
  await applyPreparedVideoReviewReplica(archive);
  const current = () => {
    const workspace = parseVideoWorkspace(fixtureWorkspaceValue(f.nativeRows, rows.media.id));
    if (!workspace) throw new Error('Missing review');
    return workspace;
  };
  const reviewStateKey = JSON.stringify([
    'root-state',
    captureRootKey('space', 'video-review', rows.media.id),
  ]);
  const deletion: ApplyCatalogDeletionInput = {
    ...f.input,
    rootKind: 'video-review',
    rootId: rows.media.id,
    expectedBasis: [value.operationId],
    expectedWorkspaceRevision: current().revision,
  };
  return { ...f, value, archive, current, deletion, reviewStateKey };
}

it('deletes only the selected review and preserves its original and sibling archive', async () => {
  const f = await setupReview();
  const source = structuredClone(f.table('media_library'));
  const bytes = structuredClone(f.table('asset_refs'));
  const owners = structuredClone(f.table('asset_owners'));
  const archive = structuredClone(
    fixtureWorkspaceValue(f.nativeRows, f.archive.root.review.workspace.aggregateId)
  );
  const revision = f.current().revision;
  io.cleanup.mockClear();
  expect(await applyCatalogDeletionNative(f.deletion)).toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(f.table('video_workspaces').has(f.deletion.rootId)).toBe(false);
  expect(f.table('media_library')).toEqual(source);
  expect(f.table('asset_refs')).toEqual(bytes);
  expect(f.table('asset_owners')).toEqual(owners);
  expect(fixtureWorkspaceValue(f.nativeRows, f.archive.root.review.workspace.aggregateId)).toEqual(
    archive
  );
  expect(f.table('sync_capture').get(f.reviewStateKey)).toMatchObject({
    deleted: true,
    nativeRevision: revision,
  });
  expect(io.cleanup).not.toHaveBeenCalled();
});

it('restores a deleted review above its clock and refuses stale writers and delete replay', async () => {
  const f = await setupReview();
  const revision = f.current().revision;
  await applyCatalogDeletionNative(f.deletion);
  await applyPreparedVideoReviewReplica({
    ...f.value,
    operationId: 'review-restore',
    expectedLocalGeneration: 2,
    expectedBasis: ['delete'],
    expectedWorkspaceRevision: null,
  });
  expect(f.current().revision).toBeGreaterThan(revision);
  const before = structuredClone(f.nativeRows);
  await expect(
    commitVideoWorkspace({
      aggregateId: f.deletion.rootId,
      expectedRevision: revision,
      expectedSourceAssetId: f.value.root.review.workspace.sourceAssetId,
      operation: { id: 'stale', at: 1, target: 'annotation', before: null, after: annotation },
    })
  ).rejects.toThrow();
  await expect(
    applyCatalogDeletionNative({ ...f.deletion, operationId: 'stale-delete' })
  ).rejects.toThrow();
  expect(await applyCatalogDeletionNative(f.deletion)).toEqual({
    status: 'duplicate',
    generation: 2,
  });
  expect(f.nativeRows).toEqual(before);
});

it('rolls back a review deletion refusal and completes an exact retry', async () => {
  const f = await setupReview();
  const before = structuredClone(f.nativeRows);
  f.refuseStorage(true);
  await expect(applyCatalogDeletionNative(f.deletion)).rejects.toThrow();
  expect(f.nativeRows).toEqual(before);
  f.refuseStorage(false);
  expect(await applyCatalogDeletionNative(f.deletion)).toEqual({
    status: 'applied',
    generation: 2,
  });
});

it('refuses uncaptured review drafts and an own pending publication without blocking a sibling', async () => {
  const f = await setupReview();
  io.journals.mockResolvedValue([
    { domain: 'sync-replica', payload: { kind: 'video-review', input: f.value } },
  ]);
  await expect(applyCatalogDeletionNative(f.deletion)).rejects.toThrow();
  io.journals.mockResolvedValue([
    { domain: 'sync-replica', payload: { kind: 'video-review', input: f.archive } },
  ]);
  f.table('video_workspace_drafts').set(f.deletion.rootId, {
    aggregateId: f.deletion.rootId,
    revision: 1,
    annotation,
    before: null,
    updatedAt: 2,
  });
  await expect(applyCatalogDeletionNative(f.deletion)).rejects.toThrow();
  f.table('video_workspace_drafts').delete(f.deletion.rootId);
  expect(await applyCatalogDeletionNative(f.deletion)).toEqual({
    status: 'applied',
    generation: 2,
  });
});

it('retains a nested private review while its parent publication is pending', async () => {
  const f = await setupReview();
  const id = 'project-asset:private-review';
  const root: PreparedVideoReviewReplicaRoot = structuredClone(f.archive.root);
  const source = f.value.dependencies[0]!;
  root.review.workspace.advanced.background = updateQuickEditBackground(
    root.review.workspace.advanced.background,
    { enabled: true, type: 'image', assetId: id }
  );
  root.assets = [
    {
      entry: {
        id: 'private-review',
        assetId: source.ref.assetId,
        createdAt: 1,
        size: source.ref.size,
        mimeType: source.ref.mimeType,
      },
      ref: source.ref,
      filename: 'private.webm',
      videoReview: {
        workspace: {
          ...structuredClone(f.value.root.review.workspace),
          aggregateId: id,
        },
        draft: null,
      },
    },
  ];
  io.journals.mockResolvedValue([
    {
      domain: 'sync-replica',
      payload: {
        kind: 'video-review',
        input: { ...f.archive, root },
      },
    },
  ]);
  const deletion = {
    ...f.deletion,
    rootId: id,
    expectedLocalGeneration: 0,
    expectedBasis: [],
    expectedWorkspaceRevision: null,
  };
  const before = structuredClone(f.nativeRows);
  await expect(applyCatalogDeletionNative(deletion)).rejects.toThrow();
  expect(f.nativeRows).toEqual(before);
  io.journals.mockResolvedValue([]);
  expect(await applyCatalogDeletionNative(deletion)).toEqual({ status: 'applied', generation: 1 });
});
