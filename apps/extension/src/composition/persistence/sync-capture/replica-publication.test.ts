import { workspace as reviewTemplate } from '../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../review-workspaces/project-metadata';
import { updateQuickEditBackground } from '../../../features/video/review/advanced/background';
import { captureRootKey } from './contracts';
import { digestCapturedMediaRows } from './freeze';
import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createVideoProjectEntryWithMediaClip,
} from '../projects/index.test-support';
import { recoverStandaloneAssetPublications } from '../assets/recovery';
import { publishReadyJournalWithRetry } from '../assets/publication';
import type { AssetReadyJournal } from '../assets/contracts';
import {
  createPreparedReplicaJournal,
  publishPreparedReplicaJournal,
  syncReplicaPublicationAdapter,
  type PreparedReplicaPayload,
} from './replica-publication';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  write: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  release: vi.fn(),
  warn: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  writeReadyJournal: io.write,
  listReadyJournals: io.list,
  deleteReadyJournal: io.remove,
  releaseAssetPublicationTransitions: io.release,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: io.warn, debug: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  cancelAssetPublication: io.cancel,
}));

beforeEach(() => {
  vi.clearAllMocks();
  io.write.mockResolvedValue(undefined);
  io.remove.mockResolvedValue(undefined);
  io.release.mockResolvedValue(undefined);
  io.cancel.mockResolvedValue(undefined);
});

function setup() {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
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
    assetId: 'local-body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/local-body' },
    mimeType: 'image/png',
    sha256: 'b'.repeat(64),
    size: 6,
  };
  const payload: PreparedReplicaPayload = {
    kind: 'media',
    input: {
      operationId: 'remote-op',
      sourceDigest: 'a'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      rows: {
        ref,
        media: createMediaLibraryEntry({
          id: 'project-asset:source',
          source: { kind: 'project-asset', projectAssetId: 'source' },
          mimeType: ref.mimeType,
          size: ref.size,
          lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
        }),
        projectAsset: {
          id: 'source',
          assetId: ref.assetId,
          mimeType: ref.mimeType,
          size: ref.size,
          createdAt: 1,
        },
      },
    },
  };
  return { ...fixture, table, payload, ref };
}

it('publishes a prepared media journal through the native command and retains its operation identity', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  expect(journal.operationId).toBeUndefined();
  expect(journal.payload.input.operationId).toBe('remote-op');
  expect(journal.assetRefs).toEqual([f.ref]);
  expect(io.write).toHaveBeenCalledWith(journal);
  await publishReadyJournalWithRetry(journal, publishPreparedReplicaJournal);
  expect(f.table('media_library').has('project-asset:source')).toBe(true);
  expect(f.table('asset_refs').get(f.ref.assetId)).toEqual(f.ref);
  expect(io.remove).toHaveBeenCalledWith(journal.journalId);
  expect(
    [...f.table('sync_capture').values()].filter(
      (row) => isRecord(row) && row['kind'] === 'sync-operation'
    )
  ).toEqual([]);
});

it('refuses malformed payloads and mismatched journal refs before publication', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  const invalid: AssetReadyJournal[] = [
    { ...journal, payload: { kind: 'media', input: null } },
    { ...journal, assetRefs: [{ ...f.ref, size: 100 }] },
    { ...journal, assetRefs: [] },
    { ...journal, assetRefs: [f.ref, f.ref] },
    { ...journal, operationId: 'backup-op' },
    { ...journal, domain: 'recording-assets' },
    {
      ...journal,
      payload: { ...f.payload, input: { ...f.payload.input, connectionGeneration: -1 } },
    },
  ];
  for (const candidate of invalid)
    await expect(publishPreparedReplicaJournal(candidate)).rejects.toThrow();
  expect(f.table('media_library').has('project-asset:source')).toBe(false);
  expect(io.remove).not.toHaveBeenCalled();
});

it('defers one failed replica without blocking another recovery item', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  const invalid = {
    ...journal,
    journalId: 'invalid',
    payload: { kind: 'media', input: { secret: 'https://secret/file.png' } },
  };
  io.list.mockResolvedValue([invalid, journal]);
  await expect(recoverStandaloneAssetPublications([syncReplicaPublicationAdapter])).resolves.toBe(
    1
  );
  expect(io.remove.mock.calls).toEqual([[journal.journalId]]);
  expect(f.table('media_library').has('project-asset:source')).toBe(true);
  expect(io.warn.mock.calls).toEqual([
    ['Prepared replica publication was deferred; its durable journal remains.'],
  ]);
});

it('replays a committed replica receipt without another native publication', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  await publishPreparedReplicaJournal(journal);
  const before = structuredClone([...f.table('sync_capture')]);
  io.list.mockResolvedValue([journal]);
  await expect(recoverStandaloneAssetPublications([syncReplicaPublicationAdapter])).resolves.toBe(
    1
  );
  expect([...f.table('sync_capture')]).toEqual(before);
  expect(f.table('asset_owners').size).toBe(1);
  expect(io.remove).toHaveBeenCalledWith(journal.journalId);
});

it('retains a refused connection journal and propagates direct failure', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  const profile = f.table('sync_capture').get('profile');
  if (!isRecord(profile)) throw new Error('Invalid profile fixture.');
  f.table('sync_capture').set('profile', {
    ...profile,
    connectionGeneration: 4,
  });
  await expect(publishPreparedReplicaJournal(journal)).rejects.toThrow();
  io.list.mockResolvedValue([journal]);
  await expect(recoverStandaloneAssetPublications([syncReplicaPublicationAdapter])).resolves.toBe(
    0
  );
  expect(io.remove).not.toHaveBeenCalled();
  expect(f.table('media_library').has('project-asset:source')).toBe(false);
});

it('publishes a bounded manual project journal and refuses unsupported sidecars', async () => {
  const f = setup();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'replica-project' });
  entry.project.assets = [];
  entry.project.clips = [];
  const payload: PreparedReplicaPayload = {
    kind: 'video-project',
    input: {
      operationId: 'project-op',
      sourceDigest: 'c'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      root: { entry, assets: [] },
      dependencies: [],
    },
  };
  const journal = await createPreparedReplicaJournal(payload);
  expect(journal.assetRefs).toEqual([]);
  await publishPreparedReplicaJournal(journal);
  expect(f.table('video_projects').has(entry.id)).toBe(true);
  const unsupported = {
    ...journal,
    payload: {
      ...payload,
      input: {
        ...payload.input,
        root: { ...payload.input.root, thumbnail: { blob: new Blob(['private']) } },
      },
    },
  };
  await expect(publishPreparedReplicaJournal(unsupported)).rejects.toThrow();
});

it('rejects conflicting protection claims before journal creation', async () => {
  const f = setup();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'project' });
  const dependency = {
    entry: f.payload.kind === 'media' ? f.payload.input.rows.media : createMediaLibraryEntry(),
    ref: f.ref,
    expectedGeneration: 1,
    expectedBasis: ['source-op'],
  };
  const payload: PreparedReplicaPayload = {
    kind: 'video-project',
    input: {
      operationId: 'project-op',
      sourceDigest: 'c'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      root: { entry, assets: [] },
      dependencies: [dependency, { ...dependency, ref: { ...f.ref, sha256: 'd'.repeat(64) } }],
    },
  };
  await expect(createPreparedReplicaJournal(payload)).rejects.toThrow(
    'Conflicting replica asset references'
  );
  expect(io.write).not.toHaveBeenCalled();
});

it('deduplicates equal working-set claims without replacing existing Library ownership', async () => {
  const f = setup();
  if (f.payload.kind !== 'media') throw new Error('Invalid media fixture.');
  await publishPreparedReplicaJournal(await createPreparedReplicaJournal(f.payload));
  const owners = structuredClone([...f.table('asset_owners')]);
  const entry = createVideoProjectEntryWithMediaClip({ id: 'shared-project' });
  entry.project.assets[0]!.source = { kind: 'project-asset', projectAssetId: 'source' };
  entry.project.assets[0]!.metadata.mimeType = f.ref.mimeType;
  entry.project.assets[0]!.metadata.size = f.ref.size;
  const payload: PreparedReplicaPayload = {
    kind: 'video-project',
    input: {
      operationId: 'shared-project-op',
      sourceDigest: 'c'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      root: {
        entry,
        assets: [
          {
            entry: f.payload.input.rows.projectAsset,
            ref: f.ref,
            filename: 'shared.png',
            reusePublished: true,
            publishToLibrary: true,
          },
        ],
      },
      dependencies: [
        {
          entry: f.payload.input.rows.media,
          ref: f.ref,
          expectedGeneration: 1,
          expectedBasis: ['remote-op'],
        },
      ],
    },
  };
  const journal = await createPreparedReplicaJournal(payload);
  expect(journal.assetRefs).toEqual([f.ref]);
  await publishPreparedReplicaJournal(journal);
  expect([...f.table('asset_owners')]).toEqual(owners);
  expect(f.table('video_projects').has(entry.id)).toBe(true);
});

it('refuses binary, cyclic and excessive journal metadata before creating durable intent', async () => {
  const f = setup();
  const cyclic: Record<string, unknown> = {};
  cyclic['cycle'] = cyclic;
  for (const extra of [new Blob(['private']), cyclic, 'x'.repeat(1024 * 1024 + 1)]) {
    const journal: AssetReadyJournal = {
      domain: 'sync-replica',
      journalId: 'invalid',
      createdAt: 1,
      assetRefs: [f.ref],
      payload: { ...f.payload, extra },
    };
    await expect(publishPreparedReplicaJournal(journal)).rejects.toThrow();
  }
  expect(f.table('media_library').has('project-asset:source')).toBe(false);
  expect(io.write).not.toHaveBeenCalled();
});

it('freezes the prepared project before asynchronous journal persistence', async () => {
  const f = setup();
  const entry = createVideoProjectEntryWithMediaClip({ id: 'frozen-project' });
  entry.project.assets = [];
  entry.project.clips = [];
  entry.project.name = 'Prepared revision';
  const payload: PreparedReplicaPayload = {
    kind: 'video-project',
    input: {
      operationId: 'frozen-project-op',
      sourceDigest: 'c'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      root: { entry, assets: [] },
      dependencies: [],
    },
  };
  const entered = Promise.withResolvers<void>();
  const persist = Promise.withResolvers<void>();
  io.write.mockImplementationOnce(async () => {
    entered.resolve();
    await persist.promise;
  });
  const creation = createPreparedReplicaJournal(payload);
  await entered.promise;
  entry.project.name = 'Changed after preparation';
  persist.resolve();
  const journal = await creation;
  if (journal.payload.kind !== 'video-project') throw new Error('Invalid project fixture.');
  expect(journal.payload.input.root.entry.project.name).toBe('Prepared revision');
  await publishPreparedReplicaJournal(journal);
  expect(f.table('video_projects').get(entry.id)).toMatchObject({
    project: { name: 'Prepared revision' },
  });
});

it.each(['spaceId', 'profileCreatedAt', 'expectedBasis'])(
  'refuses a journal without its exact admission fence: %s',
  async (field) => {
    const f = setup();
    const journal = await createPreparedReplicaJournal(f.payload);
    const input: Record<string, unknown> = { ...f.payload.input };
    delete input[field];
    const before = structuredClone(f.rows);
    await expect(
      publishPreparedReplicaJournal({ ...journal, payload: { kind: 'media', input } })
    ).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);

it('retains the original journal after enrollment recreation instead of admitting its source', async () => {
  const f = setup();
  const journal = await createPreparedReplicaJournal(f.payload);
  const profile = f.table('sync_capture').get('profile');
  if (!isRecord(profile)) throw new Error('Missing profile');
  f.table('sync_capture').set('profile', { ...profile, createdAt: 2 });
  io.list.mockResolvedValue([journal]);
  await expect(recoverStandaloneAssetPublications([syncReplicaPublicationAdapter])).resolves.toBe(
    0
  );
  expect(io.remove).not.toHaveBeenCalled();
  expect(f.table('media_library').has('project-asset:source')).toBe(false);
});

function reviewJournalFixture() {
  const f = setup();
  if (f.payload.kind !== 'media') throw new Error('Expected original source fixture.');
  const rows = structuredClone(f.payload.input.rows);
  rows.ref.mimeType = rows.projectAsset.mimeType = rows.media.mimeType = 'video/webm';
  rows.media.kind = 'video';
  f.table('media_library').set(rows.media.id, rows.media);
  f.table('project_assets').set(rows.projectAsset.id, rows.projectAsset);
  f.table('asset_refs').set(rows.ref.assetId, rows.ref);
  f.table('asset_owners').set(JSON.stringify(['project-asset', rows.projectAsset.id, 'body']), {
    assetId: rows.ref.assetId,
    ownerKind: 'project-asset',
    ownerId: rows.projectAsset.id,
    role: 'body',
  });
  const rootKey = captureRootKey('space', 'media', rows.media.id);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  f.table('sync_capture').set(stateKey, {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: rows.media.id,
    rootKey,
    generation: 1,
    basis: ['original-operation'],
    nativeDigest: digestCapturedMediaRows(rows),
  });
  const asset = createProjectAssetEntry({
    id: 'private-background',
    assetId: 'background-file',
    mimeType: 'image/png',
    size: 3,
  });
  const ref = {
    ...rows.ref,
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    size: asset.size,
    location: { kind: 'opfs' as const, objectKey: 'objects/background-file' },
  };
  const aggregateId = 'project-asset:quick-project:journal';
  const workspace = materializeVideoWorkspaceProject(
    {
      ...structuredClone(reviewTemplate),
      aggregateId,
      sourceMediaId: rows.media.id,
      sourceAssetId: rows.ref.assetId,
    },
    'Journal review'
  );
  workspace.advanced.background = updateQuickEditBackground(workspace.advanced.background, {
    enabled: true,
    type: 'image',
    assetId: `project-asset:${asset.id}`,
  });
  const payload: Extract<PreparedReplicaPayload, { kind: 'video-review' }> = {
    kind: 'video-review',
    input: {
      operationId: 'review-operation',
      sourceDigest: 'c'.repeat(64),
      connectionGeneration: 3,
      spaceId: 'space',
      profileCreatedAt: 1,
      expectedBasis: [],
      expectedLocalGeneration: 0,
      expectedWorkspaceRevision: null,
      dependencies: [
        {
          entry: rows.media,
          ref: rows.ref,
          expectedGeneration: 1,
          expectedBasis: ['original-operation'],
        },
      ],
      root: {
        review: { workspace, draft: null },
        sourceMediaId: rows.media.id,
        assets: [{ entry: asset, ref, filename: 'background.png' }],
      },
    },
  };
  return { ...f, payload, rows, ref, asset, aggregateId };
}

it('protects review originals and resources until native commit and replays the same journal', async () => {
  const f = reviewJournalFixture();
  const journal = await createPreparedReplicaJournal(f.payload);
  expect(new Set(journal.assetRefs.map((ref) => ref.assetId))).toEqual(
    new Set([f.rows.ref.assetId, f.ref.assetId])
  );
  io.cancel.mockImplementation(async () => {
    expect(f.table('video_workspaces').has(f.aggregateId)).toBe(true);
    expect(f.table('project_assets').get(f.asset.id)).toEqual(f.asset);
  });
  await publishPreparedReplicaJournal(journal);
  const committed = structuredClone(f.rows);
  expect(f.table('media_library').has(f.aggregateId)).toBe(false);
  expect(f.table('project_assets').get(f.rows.projectAsset.id)).toEqual(committed.projectAsset);
  await publishPreparedReplicaJournal(journal);
  expect(io.cancel).toHaveBeenCalledTimes(2);
  expect(
    [...f.table('sync_capture').values()].filter(
      (row) => isRecord(row) && row['kind'] === 'applied-operation'
    )
  ).toHaveLength(1);
});

it('keeps a refused review journal and all its exact claims available for recovery', async () => {
  const f = reviewJournalFixture();
  const journal = await createPreparedReplicaJournal(f.payload);
  const profile = f.table('sync_capture').get('profile');
  if (!isRecord(profile)) throw new Error('Missing profile.');
  f.table('sync_capture').set('profile', { ...profile, connectionGeneration: 4 });
  io.list.mockResolvedValue([journal]);
  expect(await recoverStandaloneAssetPublications([syncReplicaPublicationAdapter])).toBe(0);
  expect(io.cancel).not.toHaveBeenCalled();
  expect(io.remove).not.toHaveBeenCalled();
  expect(f.table('video_workspaces').has(f.aggregateId)).toBe(false);
  expect(journal.assetRefs).toHaveLength(2);
});

it('refuses missing original protection before publishing any review state', async () => {
  const f = reviewJournalFixture();
  const journal = await createPreparedReplicaJournal(f.payload);
  await expect(publishPreparedReplicaJournal({ ...journal, assetRefs: [f.ref] })).rejects.toThrow(
    'claims'
  );
  expect(f.table('video_workspaces').has(f.aggregateId)).toBe(false);
  expect(io.cancel).not.toHaveBeenCalled();
});
