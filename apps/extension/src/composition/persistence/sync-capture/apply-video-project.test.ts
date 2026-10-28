import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { hashCaptureText } from './guards';
import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { beforeEach, expect, it, vi } from 'vitest';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createVideoProjectEntryWithMediaClip,
  createMediaLibraryEntry,
  createProjectExportEntry,
} from '../projects/index.test-support';
import type { AssetRef } from '../assets';
import { captureRootKey, type SyncCaptureRootState } from './contracts';
import {
  applyPreparedVideoProjectRevision,
  type ApplyPreparedVideoProjectRevisionInput,
} from './apply-video-project';

const io = vi.hoisted(() => ({ database: vi.fn(), cleanup: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: io.cleanup,
}));

beforeEach(() => {
  vi.clearAllMocks();
  io.cleanup.mockResolvedValue(undefined);
});

const spaceId = 'admitted-space';
const sourceId = 'source-media';
const projectId = 'admitted-project';
const digest = 'a'.repeat(64);

function mediaState(generation = 7, basis = ['accepted-source']): SyncCaptureRootState {
  const rootKey = captureRootKey(spaceId, 'media', sourceId);
  return {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId,
    rootKind: 'media',
    rootId: sourceId,
    rootKey,
    generation,
    basis,
  };
}

function setup(trashed = false) {
  let failReceipt = false;
  let captureWrites = 0;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture') return false;
    captureWrites++;
    return failReceipt && captureWrites === 2;
  });
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId,
    connectionGeneration: 3,
  });
  const state = mediaState();
  table('sync_capture').set(state.key, state);
  const ref: AssetRef = {
    assetId: 'source-bytes',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/source-bytes' },
    mimeType: 'video/webm',
    sha256: 'b'.repeat(64),
    size: 1024,
  };
  const media = createMediaLibraryEntry({
    id: sourceId,
    source: { kind: 'stored-asset', assetId: ref.assetId },
    mimeType: ref.mimeType,
    size: ref.size,
    lifecycle: { ...createLibraryLifecycle('library', 1), ...(trashed ? { trashedAt: 2 } : {}) },
  });
  table('media_library').set(media.id, media);
  table('asset_refs').set(ref.assetId, ref);
  const entry = createVideoProjectEntryWithMediaClip({ id: projectId });
  if (trashed && media.lifecycle) entry.lifecycle = media.lifecycle;
  entry.project.assets[0]!.source = { kind: 'library-asset', mediaId: sourceId };
  const input: ApplyPreparedVideoProjectRevisionInput = {
    root: { entry, assets: [] },
    operationId: 'accepted-project-operation',
    sourceDigest: digest,
    connectionGeneration: 3,
    spaceId: spaceId,
    profileCreatedAt: 1,
    expectedBasis: [],
    expectedLocalGeneration: 0,
    expectedWorkspaceRevision: null,
    dependencies: [
      { entry: media, ref, expectedGeneration: 7, expectedBasis: ['accepted-source'] },
    ],
  };
  return {
    ...fixture,
    table,
    input,
    ref,
    media,
    failReceipt() {
      failReceipt = true;
      captureWrites = 0;
    },
    allowWrites() {
      failReceipt = false;
      captureWrites = 0;
    },
  };
}

it.each([false, true])('preserves sources and exports: Trash=%s', async (trashed) => {
  const fixture = setup(trashed);
  const independent = createProjectExportEntry({ projectId });
  fixture.table('project_exports').set(independent.id, independent);
  const beforeExports = structuredClone(fixture.table('project_exports'));
  const beforeMedia = structuredClone(fixture.table('media_library'));
  const project = structuredClone(fixture.input.root.entry.project);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'applied',
    generation: 1,
  });
  expect(fixture.table('video_projects').get(projectId)).toMatchObject({
    project,
    workspaceRevision: 1,
  });
  expect(fixture.table('project_exports')).toEqual(beforeExports);
  expect(fixture.table('media_library')).toEqual(beforeMedia);
  expect(fixture.input.root.entry.project).toEqual(project);
  expect(fixture.table('sync_capture').size).toBe(4);
});

it('refuses a changed retained Trash dependency after preparation', async () => {
  const fixture = setup(true);
  fixture.table('asset_refs').set(fixture.ref.assetId, {
    ...fixture.ref,
    location: { kind: 'opfs', objectKey: 'objects/replaced-source' },
  });
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
    code: 'dependency-changed',
  });
  expect(fixture.rows).toEqual(before);
  expect(io.cleanup).not.toHaveBeenCalled();
});

it('refuses deleted and recreated dependency generations even when bytes match', async () => {
  for (const state of [
    undefined,
    mediaState(8, ['delete']),
    mediaState(9, ['recreated']),
    mediaState(7, ['later-operation']),
    { ...mediaState(), deleted: true },
  ]) {
    const fixture = setup();
    if (state) fixture.table('sync_capture').set(state.key, state);
    else {
      fixture.table('media_library').delete(sourceId);
      fixture.table('sync_capture').delete(mediaState().key);
    }
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
      code: 'dependency-changed',
    });
    expect(fixture.rows).toEqual(before);
  }
});

it('refuses a local pending edit and a stale native project revision', async () => {
  const stale = setup();
  stale.table('video_projects').set(projectId, { ...stale.input.root.entry, workspaceRevision: 4 });
  const beforeStale = structuredClone(stale.rows);
  await expect(applyPreparedVideoProjectRevision(stale.input)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(stale.rows).toEqual(beforeStale);
  const pending = setup();
  const rootKey = captureRootKey(spaceId, 'video-project', projectId);
  pending.table('sync_capture').set(
    'pending',
    createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: 'pending',
      createdAt: 1,
      spaceId,
      connectionGeneration: 3,
      rootKind: 'video-project',
      rootId: projectId,
      rootKey,
      generation: 1,
      operationId: 'local-deletion',
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    })
  );
  const beforePending = structuredClone(pending.rows);
  await expect(applyPreparedVideoProjectRevision(pending.input)).rejects.toMatchObject({
    code: 'pending-local-change',
  });
  expect(pending.rows).toEqual(beforePending);
});

it('returns a duplicate before rechecking later dependency changes', async () => {
  const fixture = setup();
  await applyPreparedVideoProjectRevision(fixture.input);
  fixture.table('media_library').delete(sourceId);
  fixture.table('sync_capture').set(mediaState().key, mediaState(9, ['replacement']));
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).resolves.toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(fixture.rows).toEqual(before);
  await expect(
    applyPreparedVideoProjectRevision({ ...fixture.input, sourceDigest: 'c'.repeat(64) })
  ).rejects.toThrow('durable receipt');
  expect(fixture.rows).toEqual(before);
});

it('preserves the candidate after refusal and accepts an explicitly prepared independent copy', async () => {
  const fixture = setup();
  fixture.table('media_library').delete(sourceId);
  const candidate = structuredClone(fixture.input);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
    code: 'dependency-changed',
  });
  expect(fixture.input).toEqual(candidate);
  const root = structuredClone(candidate.root);
  root.entry.project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'independent-copy',
  };
  root.assets = [
    {
      entry: {
        id: 'independent-copy',
        assetId: 'copy-body',
        createdAt: 1,
        mimeType: fixture.ref.mimeType,
        size: fixture.ref.size,
      },
      filename: 'copy.webm',
      publishToLibrary: false,
      ref: {
        ...fixture.ref,
        assetId: 'copy-body',
        location: { kind: 'opfs', objectKey: 'objects/copy-body' },
      },
    },
  ];
  await expect(
    applyPreparedVideoProjectRevision({
      ...candidate,
      root,
      dependencies: [],
      operationId: 'explicit-copy',
    })
  ).resolves.toEqual({ status: 'applied', generation: 1 });
  expect(fixture.table('video_projects').get(projectId)).toMatchObject({
    project: root.entry.project,
  });
  expect(fixture.table('project_assets').get('independent-copy')).toEqual(root.assets[0]!.entry);
  expect(fixture.table('media_library').has('project-asset:independent-copy')).toBe(false);
  expect(fixture.input).toEqual(candidate);
});

it('refuses a second writer prepared against the same native and capture predecessor', async () => {
  const fixture = setup();
  const second = structuredClone({ ...fixture.input, operationId: 'second-writer' });
  await applyPreparedVideoProjectRevision(fixture.input);
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(second)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(fixture.rows).toEqual(before);
});

it.each(['missing', 'disabled', 'rotated'] as const)(
  'refuses an unavailable profile: %s',
  async (state) => {
    const fixture = setup();
    if (state === 'missing') fixture.table('sync_capture').delete('profile');
    else
      fixture.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: 1,
        enabled: state !== 'disabled',
        spaceId,
        connectionGeneration: state === 'rotated' ? 4 : 3,
      });
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
      code: 'profile-changed',
    });
    expect(fixture.rows).toEqual(before);
  }
);

it('refuses unsupported or incomplete dependency closure before mutation', async () => {
  const fixture = setup();
  for (const input of [
    { ...fixture.input, dependencies: [] },
    {
      ...fixture.input,
      dependencies: [...fixture.input.dependencies, ...fixture.input.dependencies],
    },
    {
      ...fixture.input,
      root: {
        ...fixture.input.root,
        entry: {
          ...fixture.input.root.entry,
          project: { ...fixture.input.root.entry.project, baseRecordingId: 'recording' },
        },
      },
    },
  ]) {
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(input)).rejects.toMatchObject({
      code: 'unsupported-project',
    });
    expect(fixture.rows).toEqual(before);
  }
});

it('clears stale project sidecars without deleting unrelated sidecars', async () => {
  const fixture = setup();
  fixture.table('thumbnails').set(`video-project:${projectId}`, { stale: true });
  fixture.table('thumbnails').set('unrelated', { retained: true });
  const presentationKey = JSON.stringify(['video-project', projectId]);
  fixture.table('aggregate_presentations').set(presentationKey, { stale: true });
  fixture.table('aggregate_presentations').set('unrelated', { retained: true });
  await applyPreparedVideoProjectRevision(fixture.input);
  expect(fixture.table('thumbnails').has(`video-project:${projectId}`)).toBe(false);
  expect(fixture.table('aggregate_presentations').has(presentationKey)).toBe(false);
  expect(fixture.table('thumbnails').get('unrelated')).toEqual({ retained: true });
  expect(fixture.table('aggregate_presentations').get('unrelated')).toEqual({ retained: true });
});

it('refuses a temporary dependency without changing its independent lifecycle', async () => {
  const fixture = setup();
  const temporary = {
    ...fixture.media,
    lifecycle: { storageClass: 'temporary' as const, savedAt: null, updatedAt: 1 },
  };
  fixture.table('media_library').set(sourceId, temporary);
  fixture.input.dependencies = [{ ...fixture.input.dependencies[0]!, entry: temporary }];
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
    code: 'unsupported-project',
  });
  expect(fixture.rows).toEqual(before);
});

it('refuses a changed capture generation even when the native predecessor still matches', async () => {
  const fixture = setup();
  const rootKey = captureRootKey(spaceId, 'video-project', projectId);
  fixture.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    ...mediaState(),
    key: JSON.stringify(['root-state', rootKey]),
    rootKey,
    rootKind: 'video-project',
    rootId: projectId,
    generation: 4,
    basis: ['previous-apply'],
  });
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoProjectRevision(fixture.input)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(fixture.rows).toEqual(before);
});

it('releases only detached private assets after publication and retains the native revision fence', async () => {
  const fixture = setup();
  const current = createVideoProjectEntryWithMediaClip({ id: projectId });
  current.workspaceRevision = 2;
  fixture.table('video_projects').set(projectId, current);
  fixture.table('video_project_revisions').set(projectId, { version: 1, projectId, revision: 10 });
  fixture.input.expectedWorkspaceRevision = 2;
  fixture.input.expectedLocalGeneration = 1;
  fixture.input.expectedBasis = ['previous-project'];
  const rootKey = captureRootKey(spaceId, 'video-project', projectId);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  fixture.table('sync_capture').set(stateKey, {
    ...mediaState(1, [...fixture.input.expectedBasis]),
    key: stateKey,
    rootKey,
    rootKind: 'video-project',
    rootId: projectId,
  });
  const entry = {
    id: 'project-asset-1',
    assetId: 'detached-body',
    createdAt: 1,
    mimeType: 'video/webm',
    size: 1024,
  };
  fixture.table('project_assets').set(entry.id, entry);
  fixture.table('asset_refs').set(entry.assetId, {
    ...fixture.ref,
    assetId: entry.assetId,
    location: { kind: 'opfs', objectKey: 'objects/detached-body' },
  });
  fixture.table('asset_owners').set(JSON.stringify(['project-asset', entry.id, 'body']), {
    assetId: entry.assetId,
    ownerKind: 'project-asset',
    ownerId: entry.id,
    role: 'body',
  });
  io.cleanup.mockImplementation(async () => {
    expect(fixture.table('video_projects').get(projectId)).toMatchObject({ workspaceRevision: 11 });
    expect(fixture.table('project_assets').has(entry.id)).toBe(false);
    expect(fixture.table('sync_capture').size).toBe(4);
  });
  await applyPreparedVideoProjectRevision(fixture.input);
  expect(fixture.table('project_assets').has(entry.id)).toBe(false);
  expect(fixture.table('asset_refs').has(entry.assetId)).toBe(false);
  expect(fixture.table('asset_refs').get(fixture.ref.assetId)).toEqual(fixture.ref);
  expect(io.cleanup).toHaveBeenCalledOnce();
  expect(io.cleanup).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: [entry.assetId] }),
    undefined
  );
});

function privateCopy(
  input: ApplyPreparedVideoProjectRevisionInput
): ApplyPreparedVideoProjectRevisionInput {
  const candidate = structuredClone(input);
  const ref = candidate.dependencies[0]!.ref;
  candidate.root.entry.project.assets[0]!.source = {
    kind: 'project-asset',
    projectAssetId: 'private-copy',
  };
  candidate.root.assets = [
    {
      entry: {
        id: 'private-copy',
        assetId: 'private-body',
        createdAt: 1,
        mimeType: ref.mimeType,
        size: ref.size,
      },
      filename: 'private.webm',
      publishToLibrary: false,
      ref: {
        ...ref,
        assetId: 'private-body',
        location: { kind: 'opfs', objectKey: 'objects/private-body' },
      },
    },
  ];
  candidate.dependencies = [];
  return candidate;
}

it('applies a second incoming revision with the exact private native binding', async () => {
  const fixture = setup();
  const first = privateCopy(fixture.input);
  await applyPreparedVideoProjectRevision(first);
  const second = structuredClone(first);
  second.operationId = 'second-private-revision';
  second.expectedLocalGeneration = 1;
  second.expectedBasis = [first.operationId];
  second.expectedWorkspaceRevision = 1;
  second.root.entry.project.name = 'Accepted later edit';
  await expect(applyPreparedVideoProjectRevision(second)).resolves.toEqual({
    status: 'applied',
    generation: 2,
  });
  expect(fixture.table('video_projects').get(projectId)).toMatchObject({
    workspaceRevision: 2,
    project: second.root.entry.project,
  });
  expect(fixture.table('project_assets').get('private-copy')).toEqual(first.root.assets[0]!.entry);
  expect(fixture.table('asset_refs').get('private-body')).toEqual(first.root.assets[0]!.ref);
  expect(fixture.table('media_library').has('project-asset:private-copy')).toBe(false);
});

it.each(['entry', 'physical-ref', 'other-project'] as const)(
  'refuses a changed or colliding private binding: %s',
  async (change) => {
    const fixture = setup();
    const first = privateCopy(fixture.input);
    await applyPreparedVideoProjectRevision(first);
    const second = structuredClone(first);
    second.operationId = 'changed-private-revision';
    second.expectedLocalGeneration = 1;
    second.expectedBasis = [first.operationId];
    second.expectedWorkspaceRevision = 1;
    if (change === 'entry') second.root.assets[0]!.entry.createdAt = 2;
    if (change === 'physical-ref') second.root.assets[0]!.ref.sha256 = 'c'.repeat(64);
    if (change === 'other-project') {
      second.root.entry.id = 'another-project';
      second.root.entry.project.id = 'another-project';
      second.expectedLocalGeneration = 0;
      second.expectedBasis = [];
      second.expectedWorkspaceRevision = null;
    }
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(second)).rejects.toMatchObject({
      code: 'project-changed',
    });
    expect(fixture.rows).toEqual(before);
  }
);

it('refuses malformed prepared assets', async () => {
  const fixture = setup();
  const invalidRef = privateCopy(fixture.input);
  invalidRef.root.assets[0]!.ref.location = { kind: 'opfs', objectKey: 'objects/mismatched-id' };
  for (const input of [invalidRef]) {
    const before = structuredClone(fixture.rows);
    await expect(applyPreparedVideoProjectRevision(input)).rejects.toMatchObject({
      code: 'unsupported-project',
    });
    expect(fixture.rows).toEqual(before);
  }
});

it('forwards the active lifecycle permit to detached cleanup after commit', async () => {
  const fixture = setup();
  await applyPreparedVideoProjectRevision(privateCopy(fixture.input));
  const replacement = structuredClone(fixture.input);
  replacement.operationId = 'replacement-with-held-lifecycle';
  replacement.expectedLocalGeneration = 1;
  replacement.expectedBasis = [fixture.input.operationId];
  replacement.expectedWorkspaceRevision = 1;
  await runWithDurableAssetLifecycleLock(async (permit) => {
    await applyPreparedVideoProjectRevision(replacement, permit);
    expect(io.cleanup).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ['private-body'] }),
      permit
    );
    expect(fixture.table('video_projects').get(projectId)).toMatchObject({ workspaceRevision: 2 });
    expect(fixture.table('project_assets').has('private-copy')).toBe(false);
  });
});

it.each(['native', 'prepared', 'published'] as const)(
  'treats only unpublished local deletion as pending before incoming restore: %s',
  async (phase) => {
    const f = setup();
    const rootKey = captureRootKey(spaceId, 'video-project', projectId);
    const native = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: 'local-deletion',
      createdAt: 1,
      spaceId,
      connectionGeneration: 3,
      rootKind: 'video-project',
      rootId: projectId,
      rootKey,
      generation: 1,
      operationId: 'local-deletion',
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    });
    const { change: _change, phase: _phase, ...header } = native;
    const prepared = {
      ...header,
      phase: 'prepared',
      prepared: { recordText: '{}', recordSha256: hashCaptureText('{}'), objects: [] },
    };
    const published = {
      ...header,
      phase: 'published',
      publication: {
        kind: 'verified',
        acceptedAt: 2,
        preparedSha256: hashCaptureText('{}'),
        attemptId: '11111111-1111-4111-8111-111111111111',
        recordKey: 'records/deletion.json',
        recordSha256: 'a'.repeat(64),
      },
      objects: [],
    };
    f.table('sync_capture').set(
      native.key,
      phase === 'native' ? native : phase === 'prepared' ? prepared : published
    );
    f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
      version: 1,
      kind: 'root-state',
      key: JSON.stringify(['root-state', rootKey]),
      createdAt: 1,
      spaceId,
      rootKind: 'video-project',
      rootId: projectId,
      rootKey,
      generation: 1,
      basis: [native.operationId],
      deleted: true,
    });
    f.input.expectedLocalGeneration = 1;
    f.input.expectedBasis = [native.operationId];
    if (phase === 'published')
      await expect(applyPreparedVideoProjectRevision(f.input)).resolves.toMatchObject({
        status: 'applied',
        generation: 2,
      });
    else {
      const before = structuredClone(f.rows);
      await expect(applyPreparedVideoProjectRevision(f.input)).rejects.toMatchObject({
        code: 'pending-local-change',
      });
      expect(f.rows).toEqual(before);
    }
  }
);

it('refuses a remote revision outside the admitted local basis', async () => {
  const f = setup();
  await applyPreparedVideoProjectRevision(f.input);
  const next = structuredClone(f.input);
  next.operationId = 'incoming-other-branch';
  next.expectedLocalGeneration = 1;
  next.expectedWorkspaceRevision = 1;
  next.expectedBasis = ['stale-catalog-head'];
  const before = structuredClone(f.rows);
  await expect(applyPreparedVideoProjectRevision(next)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(f.rows).toEqual(before);
});

it('refuses a prepared project after enrollment recreation with the same connection counter', async () => {
  const f = setup();
  f.input.profileCreatedAt = 2;
  const before = structuredClone(f.rows);
  await expect(applyPreparedVideoProjectRevision(f.input)).rejects.toMatchObject({
    code: 'profile-changed',
  });
  expect(f.rows).toEqual(before);
});

it('refuses a stale catalog basis after a local branch has been published', async () => {
  const f = setup();
  await applyPreparedVideoProjectRevision(f.input);
  const rootKey = captureRootKey(spaceId, 'video-project', projectId);
  const local = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: 'published-local-branch',
    createdAt: 2,
    spaceId,
    connectionGeneration: 3,
    rootKind: 'video-project',
    rootId: projectId,
    rootKey,
    generation: 2,
    operationId: 'published-local-branch',
    basis: [f.input.operationId],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'tombstone' },
  });
  const { change: _change, phase: _phase, ...header } = local;
  f.table('sync_capture').set(local.key, {
    ...header,
    phase: 'published',
    publication: {
      kind: 'verified',
      acceptedAt: 3,
      preparedSha256: hashCaptureText('{}'),
      attemptId: '11111111-1111-4111-8111-111111111111',
      recordKey: 'records/local-branch.json',
      recordSha256: 'a'.repeat(64),
    },
    objects: [],
  });
  f.table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 2,
    spaceId,
    rootKind: 'video-project',
    rootId: projectId,
    rootKey,
    generation: 2,
    basis: [local.operationId],
  });
  const incoming = {
    ...f.input,
    operationId: 'stale-incoming-successor',
    expectedLocalGeneration: 2,
    expectedBasis: [f.input.operationId],
    expectedWorkspaceRevision: null,
  };
  f.table('video_projects').delete(projectId);
  const before = structuredClone(f.rows);
  await expect(applyPreparedVideoProjectRevision(incoming)).rejects.toMatchObject({
    code: 'project-changed',
  });
  expect(f.rows).toEqual(before);
});

it.each(['live', 'legacy'] as const)(
  'refuses an absent nonzero project predecessor with %s state instead of restoring it',
  async (kind) => {
    const f = setup();
    await applyPreparedVideoProjectRevision(f.input);
    const rootKey = captureRootKey(spaceId, 'video-project', projectId);
    const stateKey = JSON.stringify(['root-state', rootKey]);
    f.table('video_projects').delete(projectId);
    const next = {
      ...f.input,
      operationId: 'unproven-restore',
      expectedLocalGeneration: 1,
      expectedBasis: [f.input.operationId],
      expectedWorkspaceRevision: null,
    };
    if (kind === 'legacy')
      f.table('sync_capture').set(stateKey, {
        version: 1,
        kind: 'root-state',
        key: stateKey,
        createdAt: 1,
        spaceId,
        rootKind: 'video-project',
        rootId: projectId,
        rootKey,
        generation: 1,
        basis: [f.input.operationId],
      });
    const before = structuredClone(f.rows);
    await expect(applyPreparedVideoProjectRevision(next)).rejects.toMatchObject({
      code: 'project-changed',
    });
    expect(f.rows).toEqual(before);
  }
);

it('checks authorization before mutation and replays committed results after pause', async () => {
  const f = setup();
  const authorization = { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 };
  f.input.authorization = authorization;
  const connection = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'alice',
      spaceId: spaceId,
      profileCreatedAt: 1,
      connectionGeneration: 3,
    },
    identity: authorization,
    phase: 'active',
    updateNonce: null,
    credentialId: '10000000-0000-4000-8000-000000000002',
  };
  const before = structuredClone(f.rows);
  await expect(applyPreparedVideoProjectRevision(f.input)).rejects.toThrow('admission refused');
  expect(f.rows).toEqual(before);
  f.table('sync_connection').set('connection', connection);
  await expect(applyPreparedVideoProjectRevision(f.input)).resolves.toMatchObject({
    status: 'applied',
  });
  f.table('sync_connection').set('connection', {
    ...connection,
    identity: { ...authorization, revision: 2 },
    phase: 'paused',
  });
  const committed = structuredClone(f.rows);
  await expect(applyPreparedVideoProjectRevision(f.input)).resolves.toMatchObject({
    status: 'duplicate',
  });
  expect(f.rows).toEqual(committed);
});
