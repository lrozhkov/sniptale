import { beforeEach, expect, it, vi } from 'vitest';
import {
  createReviewWorkspaceStoreFixture,
  fixtureWorkspaceValue,
} from '../review-workspaces/store.test-support';
import {
  workspace as template,
  annotation,
} from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { createMediaLibraryEntry, createProjectAssetEntry } from '../projects/index.test-support';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { saveVideoWorkspaceDraft, commitVideoWorkspace } from '../review-workspaces/store';
import { deleteVideoWorkspaceProject } from '../review-workspaces/project-commands';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import type { AssetRef } from '../assets/contracts';
import { digestCapturedMediaRows } from './freeze';
import { captureRootKey } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import {
  applyPreparedVideoReviewReplica,
  parseApplyPreparedVideoReviewReplicaInput,
  type ApplyPreparedVideoReviewReplicaInput,
} from './apply-review';

const io = vi.hoisted(() => ({
  db: vi.fn(),
  read: vi.fn(),
  cleanup: vi.fn(),
  writes: Promise.resolve<unknown>(undefined),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: (operation: (db: unknown) => Promise<unknown>) => {
    const pending = io.writes.then(async () => operation(await io.db()));
    io.writes = pending.catch(() => undefined);
    return pending;
  },
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  readAssetFile: io.read,
  listReadyJournals: async () => [],
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: io.cleanup,
}));

const spaceId = 'review-apply-space';
const mediaId = 'project-asset:original';
let fail: string | undefined;
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
function table(name: string) {
  return fixture.rows.get(name)!;
}
function stateKey(id: string) {
  return JSON.stringify(['root-state', captureRootKey(spaceId, 'video-review', id)]);
}
function current(id = mediaId) {
  const value = parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id));
  if (!value) throw new Error('Missing native review');
  return value;
}
function input(id = mediaId): ApplyPreparedVideoReviewReplicaInput {
  const source = createProjectAssetEntry({
    id: 'original',
    assetId: 'original-bytes',
    mimeType: 'video/webm',
    size: 6,
  });
  const ref: AssetRef = {
    assetId: source.assetId,
    size: source.size,
    mimeType: source.mimeType,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: `objects/${source.assetId}` },
  };
  const media = createMediaLibraryEntry({
    id: mediaId,
    kind: 'video',
    mimeType: source.mimeType,
    size: source.size,
    source: { kind: 'project-asset', projectAssetId: source.id },
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
  });
  const rootKey = captureRootKey(spaceId, 'media', mediaId);
  table('media_library').set(mediaId, media);
  table('project_assets').set(source.id, source);
  table('asset_refs').set(ref.assetId, ref);
  table('asset_owners').set(JSON.stringify(['project-asset', source.id, 'body']), {
    assetId: ref.assetId,
    ownerKind: 'project-asset',
    ownerId: source.id,
    role: 'body',
  });
  table('sync_capture').set(JSON.stringify(['root-state', rootKey]), {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey]),
    createdAt: 1,
    spaceId,
    rootKind: 'media',
    rootId: mediaId,
    rootKey,
    generation: 1,
    basis: ['source-operation'],
    nativeDigest: digestCapturedMediaRows({ media, projectAsset: source, ref }),
  });
  return {
    root: {
      review: {
        workspace: materializeVideoWorkspaceProject(
          {
            ...structuredClone(template),
            aggregateId: id,
            ...(id === mediaId ? {} : { sourceMediaId: mediaId }),
            sourceAssetId: ref.assetId,
            history: [],
            cursor: 0,
          },
          'Transferred review'
        ),
        draft: null,
      },
      sourceMediaId: mediaId,
      assets: [],
    },
    operationId: `incoming-${id}`,
    sourceDigest: 'a'.repeat(64),
    spaceId,
    profileCreatedAt: 1,
    connectionGeneration: 1,
    expectedLocalGeneration: 0,
    expectedBasis: [],
    expectedWorkspaceRevision: null,
    dependencies: [
      { entry: media, ref, expectedGeneration: 1, expectedBasis: ['source-operation'] },
    ],
  };
}
function replacement(
  previous: ApplyPreparedVideoReviewReplicaInput
): ApplyPreparedVideoReviewReplicaInput {
  return {
    ...structuredClone(previous),
    operationId: `replace-${previous.operationId}`,
    expectedWorkspaceRevision: current(previous.root.review.workspace.aggregateId).revision,
    expectedLocalGeneration: 1,
    expectedBasis: [previous.operationId],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.writes = Promise.resolve();
  io.cleanup.mockResolvedValue(undefined);
  fail = undefined;
  fixture = createReviewWorkspaceStoreFixture((name) => name === fail);
  io.db.mockResolvedValue(fixture.database);
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    spaceId,
    createdAt: 1,
    connectionGeneration: 1,
  });
});

it('applies default and archived reviews through native consumers without fake Library rows', async () => {
  const first = input();
  const sourceBefore = structuredClone(table('media_library'));
  expect(await applyPreparedVideoReviewReplica(first)).toEqual({
    status: 'applied',
    generation: 1,
  });
  const archiveId = 'project-asset:quick-project:archive';
  const archive = input(archiveId);
  await applyPreparedVideoReviewReplica(archive);
  expect(current(archiveId).sourceMediaId).toBe(mediaId);
  expect(table('media_library')).toEqual(sourceBefore);
  expect(current().project?.name).toBe('Transferred review');
  expect(current(archiveId).revision).toBeGreaterThan(archive.root.review.workspace.revision);
});
it('rebases workspace and draft clocks and refuses a stale local writer', async () => {
  const value = input();
  value.root.review.draft = {
    aggregateId: mediaId,
    revision: 40,
    annotation,
    before: null,
    updatedAt: 1,
  };
  await applyPreparedVideoReviewReplica(value);
  const beforeRevision = current().revision;
  const next = replacement(value);
  await applyPreparedVideoReviewReplica(next);
  expect(current().revision).toBeGreaterThan(beforeRevision);
  expect(table('video_workspace_drafts').get(mediaId)).toMatchObject({ revision: 42 });
  await expect(
    commitVideoWorkspace({
      aggregateId: mediaId,
      expectedRevision: beforeRevision,
      expectedSourceAssetId: 'original-bytes',
      operation: { id: 'stale', at: 1, target: 'annotation', before: null, after: annotation },
    })
  ).rejects.toThrow();
});
it('detects uncaptured draft-only changes through the own native digest', async () => {
  const value = input();
  await applyPreparedVideoReviewReplica(value);
  const next = replacement(value);
  table('video_workspace_drafts').set(mediaId, {
    aggregateId: mediaId,
    revision: 1,
    annotation,
    before: null,
    updatedAt: 2,
  });
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoReviewReplica(next)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});
it('refuses pending captured local edits instead of replacing their authored recovery', async () => {
  const value = input();
  await applyPreparedVideoReviewReplica(value);
  const next = replacement(value);
  await saveVideoWorkspaceDraft({
    aggregateId: mediaId,
    expectedRevision: current().revision,
    expectedSourceAssetId: 'original-bytes',
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const state = parseSyncCaptureRecord(table('sync_capture').get(stateKey(mediaId)));
  if (!state || state.kind !== 'root-state') throw new Error('Missing captured state');
  next.expectedLocalGeneration = state.generation;
  next.expectedBasis = state.basis;
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoReviewReplica(next)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});
it('repeats dependency admission after controlled preparation interleaving', async () => {
  const value = input();
  value.root.thumbnail = {
    entry: { assetId: mediaId, createdAt: 1, updatedAt: 1, width: 1, height: 1 },
    ref: {
      assetId: 'thumbnail',
      size: 6,
      mimeType: 'image/png',
      createdAt: 1,
      sha256: null,
      location: { kind: 'opfs', objectKey: 'objects/thumbnail' },
    },
  };
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.read.mockImplementation(async () => {
    entered();
    await paused;
    return new File(['123456'], 'thumbnail', { type: 'image/png' });
  });
  const applying = applyPreparedVideoReviewReplica(value);
  await started;
  table('asset_owners').delete(JSON.stringify(['project-asset', 'original', 'body']));
  const before = structuredClone(fixture.rows);
  release();
  await expect(applying).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});
it('acknowledges receipt replay before reading unavailable thumbnail bytes', async () => {
  const value = input();
  value.root.thumbnail = {
    entry: { assetId: mediaId, createdAt: 1, updatedAt: 1, width: 1, height: 1 },
    ref: {
      assetId: 'thumbnail',
      size: 6,
      mimeType: 'image/png',
      createdAt: 1,
      sha256: null,
      location: { kind: 'opfs', objectKey: 'objects/thumbnail' },
    },
  };
  io.read.mockResolvedValue(new File(['123456'], 'thumbnail', { type: 'image/png' }));
  await applyPreparedVideoReviewReplica(value);
  io.read.mockRejectedValue(new Error('Staged bytes retired'));
  expect(await applyPreparedVideoReviewReplica(value)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(io.read).toHaveBeenCalledTimes(1);
});
it('rolls back native publication when provenance cannot be committed', async () => {
  const value = input();
  const before = structuredClone(fixture.rows);
  fail = 'sync_capture';
  await expect(applyPreparedVideoReviewReplica(value)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  fail = undefined;
  expect(await applyPreparedVideoReviewReplica(value)).toEqual({
    status: 'applied',
    generation: 1,
  });
});
it('rejects private asset identity collisions without overwriting another authored review', async () => {
  const value = input();
  const entry = createProjectAssetEntry({ id: 'private', assetId: 'private-bytes', size: 6 });
  const ref: AssetRef = {
    assetId: entry.assetId,
    size: 6,
    mimeType: entry.mimeType,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/private-bytes' },
  };
  value.root.assets = [{ entry, ref, filename: 'private.png' }];
  value.root.review.workspace.advanced.background = updateQuickEditBackground(
    value.root.review.workspace.advanced.background,
    { enabled: true, type: 'image', assetId: 'project-asset:private' }
  );
  table('project_assets').set(entry.id, entry);
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoReviewReplica(value)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});
it('restores a deleted graveyard identity above its surviving revision fence', async () => {
  const value = input();
  await applyPreparedVideoReviewReplica(value);
  const revision = current().revision;
  await deleteVideoWorkspaceProject(mediaId, revision);
  const state = parseSyncCaptureRecord(table('sync_capture').get(stateKey(mediaId)));
  if (!state || state.kind !== 'root-state') throw new Error('Missing graveyard');
  // Model delivery of the completed outgoing tombstone; causal state is retained.
  for (const [key, raw] of table('sync_capture'))
    if (raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'sync-operation')
      table('sync_capture').delete(key);
  const restore = {
    ...value,
    operationId: 'restore-graveyard',
    expectedWorkspaceRevision: null,
    expectedLocalGeneration: 2,
    expectedBasis: state.basis,
  };
  await applyPreparedVideoReviewReplica(restore);
  expect(current().revision).toBeGreaterThan(revision);
});
it('rejects unsupported and incomplete dependency declarations at the receiving boundary', () => {
  const value = input();
  expect(parseApplyPreparedVideoReviewReplicaInput({ ...value, dependencies: [] })).toBeNull();
  expect(
    parseApplyPreparedVideoReviewReplicaInput({
      ...value,
      dependencies: [...value.dependencies, value.dependencies[0]],
    })
  ).toBeNull();
  expect(
    parseApplyPreparedVideoReviewReplicaInput({
      ...value,
      dependencies: [
        {
          ...value.dependencies[0],
          entry: {
            ...value.dependencies[0]!.entry,
            source: { kind: 'recording', recordingId: 'unsupported' },
          },
        },
      ],
    })
  ).toBeNull();
});

it('admits only one of two parallel replacements against the same absent predecessor', async () => {
  const value = input();
  const result = await Promise.allSettled([
    applyPreparedVideoReviewReplica(value),
    applyPreparedVideoReviewReplica({ ...value, operationId: 'competing-command' }),
  ]);
  expect(result.map((entry) => entry.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(current().project?.name).toBe('Transferred review');
});

it('publishes private resource ownership and its nested review without a Library mirror', async () => {
  const value = input('project-asset:quick-project:private-parent');
  const entry = createProjectAssetEntry({
    id: 'private-video',
    assetId: 'private-video-bytes',
    size: 6,
    mimeType: 'video/webm',
  });
  const ref: AssetRef = {
    assetId: entry.assetId,
    size: entry.size,
    mimeType: entry.mimeType,
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/private-video-bytes' },
  };
  const nested = materializeVideoWorkspaceProject(
    {
      ...structuredClone(template),
      aggregateId: 'project-asset:private-video',
      sourceAssetId: ref.assetId,
      history: [],
      cursor: 0,
    },
    'Private child'
  );
  value.root.assets = [
    { entry, ref, filename: 'private.webm', videoReview: { workspace: nested, draft: null } },
  ];
  value.root.review.workspace.advanced.background = updateQuickEditBackground(
    value.root.review.workspace.advanced.background,
    { enabled: true, type: 'image', assetId: 'project-asset:private-video' }
  );
  await applyPreparedVideoReviewReplica(value);
  expect(current('project-asset:private-video').project?.name).toBe('Private child');
  expect(table('media_library').has('project-asset:private-video')).toBe(false);
  expect(
    table('asset_owners').get(JSON.stringify(['project-asset', entry.id, 'body']))
  ).toMatchObject({ assetId: ref.assetId });
});

it('publishes a reachable private review cycle once without creating Library mirrors', async () => {
  const value = input('project-asset:quick-project:cycle-parent');
  const resource = (id: string, linked: string) => {
    const entry = createProjectAssetEntry({
      id,
      assetId: `${id}-bytes`,
      size: 6,
      mimeType: 'video/webm',
    });
    const ref: AssetRef = {
      assetId: entry.assetId,
      size: 6,
      mimeType: entry.mimeType,
      createdAt: 1,
      sha256: null,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
    };
    const workspace = materializeVideoWorkspaceProject(
      {
        ...structuredClone(template),
        aggregateId: `project-asset:${id}`,
        sourceAssetId: ref.assetId,
        history: [],
        cursor: 0,
      },
      id
    );
    workspace.advanced.background = updateQuickEditBackground(workspace.advanced.background, {
      enabled: true,
      type: 'image',
      assetId: `project-asset:${linked}`,
    });
    return { entry, ref, filename: `${id}.webm`, videoReview: { workspace, draft: null } };
  };
  value.root.assets = [resource('cycle-b', 'cycle-c'), resource('cycle-c', 'cycle-b')];
  value.root.review.workspace.advanced.background = updateQuickEditBackground(
    value.root.review.workspace.advanced.background,
    { enabled: true, type: 'image', assetId: 'project-asset:cycle-b' }
  );
  expect(await applyPreparedVideoReviewReplica(value)).toEqual({
    status: 'applied',
    generation: 1,
  });
  expect(current('project-asset:cycle-b').advanced.background).toMatchObject({
    type: 'image',
    assetId: 'project-asset:cycle-c',
  });
  expect(current('project-asset:cycle-c').advanced.background).toMatchObject({
    type: 'image',
    assetId: 'project-asset:cycle-b',
  });
  expect(table('media_library').has('project-asset:cycle-b')).toBe(false);
  expect(table('media_library').has('project-asset:cycle-c')).toBe(false);
  expect(
    [...table('asset_owners').values()].filter(
      (raw) =>
        raw &&
        typeof raw === 'object' &&
        'ownerId' in raw &&
        (raw.ownerId === 'cycle-b' || raw.ownerId === 'cycle-c')
    )
  ).toHaveLength(2);
  const before = structuredClone(fixture.rows);
  expect(await applyPreparedVideoReviewReplica(value)).toEqual({
    status: 'duplicate',
    generation: 1,
  });
  expect(fixture.rows).toEqual(before);
});

it('preserves decoder codec metadata without changing the original byte declaration', async () => {
  const value = input();
  value.root.review.workspace.source.mimeType = 'video/webm; codecs="vp8, opus"';
  expect(await applyPreparedVideoReviewReplica(value)).toEqual({
    status: 'applied',
    generation: 1,
  });
  expect(current().source.mimeType).toBe('video/webm; codecs="vp8, opus"');
  expect(table('asset_refs').get('original-bytes')).toMatchObject({ mimeType: 'video/webm' });
  const invalid = replacement(value);
  invalid.root.review.workspace.source.mimeType = 'video/mp4; codecs="avc1"';
  const before = structuredClone(fixture.rows);
  await expect(applyPreparedVideoReviewReplica(invalid)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});
