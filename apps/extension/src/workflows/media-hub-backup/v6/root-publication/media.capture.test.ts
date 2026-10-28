import { beforeEach, expect, it, vi } from 'vitest';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { createReviewWorkspaceStoreFixture } from '../../../../composition/persistence/review-workspaces/store.test-support';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { createLibraryLifecycle } from '../../../../composition/persistence/library-lifecycle/contracts';
import { parseSyncCaptureRecord } from '../../../../composition/persistence/sync-capture/guards';
import { captureVideoProjectInTransaction } from '../../../../composition/persistence/sync-capture/capture';
import type {
  ArchiveRestoreSession,
  AssetReadyJournal,
} from '../../../../composition/persistence/assets';
import { assertPortableJson } from '../codec';

const mocks = vi.hoisted(() => ({ checkpoint: vi.fn(), runMutation: vi.fn(), db: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: mocks.db,
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  readAssetFile: vi.fn(
    async (_ref, filename: string) => new File(['source'], filename, { type: 'image/png' })
  ),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';
import { projectAssetReviewMetadata, portableJson } from './media.review-assets.test-support';
import { fixtureWorkspaceValue } from '../../../../composition/persistence/review-workspaces/store.test-support';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../../../../composition/persistence/review-workspaces/project-metadata';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import { commitVideoWorkspace } from '../../../../composition/persistence/review-workspaces/store';
import { deleteVideoWorkspaceProject } from '../../../../composition/persistence/review-workspaces/project-commands';
import { captureVideoReviewInTransaction } from '../../../../composition/persistence/sync-capture/capture';

const journal = {
  assetRefs: [],
  createdAt: 1,
  domain: 'archive-restore',
  journalId: 'journal-1',
  payload: {},
} satisfies AssetReadyJournal;
const session = {
  archiveFingerprint: 'a'.repeat(64),
  childIdMap: {},
  committedRoots: [],
  conflictedRoots: [],
  createdAt: 1,
  currentRoot: 'media:library-item:media-one',
  kind: 'archive-restore-session' as const,
  operationId: 'restore-1',
  rootIdMap: {},
  skippedRoots: [],
  status: 'pending' as const,
  strategy: 'replace' as const,
  updatedAt: 1,
} satisfies ArchiveRestoreSession;

beforeEach(() => vi.clearAllMocks());

async function restoredOriginalFixture(enabled = true, failCapture = false, workspaceRevision = 0) {
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => failCapture && name === 'sync_capture'
  );
  const entry = createMediaLibraryEntry({
    id: 'project-asset:archived-original',
    source: { kind: 'project-asset', projectAssetId: 'archived-original' },
    mimeType: 'image/png',
    size: 6,
    workspaceRevision,
    lifecycle: createLibraryLifecycle('library', 1),
  });
  fixture.rows.get('media_library')!.set(entry.id, entry);
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled,
    spaceId: 'restored-original-space',
    connectionGeneration: 3,
  });
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({
      ...fixture.database,
      get: async (name: string, key: string) => fixture.rows.get(name)?.get(key),
    })
  );
  mocks.checkpoint.mockImplementation(async (store) =>
    store.put({ operationId: 'archive-receipt', type: 'test-receipt' })
  );
  const metadata: unknown = {
    entry,
    projectAsset: { id: 'archived-original', mimeType: 'image/png', size: 6, createdAt: 1 },
    originalObjectId: 'original',
  };
  assertPortableJson(metadata);
  const input = {
    session: { ...session, strategy: 'duplicate' as const },
    journal,
    envelope: {
      descriptor: {
        rootKind: 'media' as const,
        mediaSubtype: 'library-item' as const,
        rootId: entry.id,
        metadataPath: '_sniptale/metadata/original.json',
        objectCount: 1,
        totalBytes: 6,
      },
      metadata,
      objects: [],
    },
    staged: [
      {
        objectId: 'original',
        ref: {
          assetId: 'restored-bytes',
          createdAt: 1,
          location: { kind: 'opfs' as const, objectKey: 'objects/restored-bytes' },
          mimeType: 'image/png',
          size: 6,
          sha256: null,
        },
      },
    ],
  };
  return {
    fixture,
    input,
    entry,
    allowCapture: () => {
      failCapture = false;
    },
  };
}

it('captures a duplicated restored original before a project borrows its accepted causal head', async () => {
  const { fixture, input, entry } = await restoredOriginalFixture();
  await mediaLibraryRootPublisher.publish(input);
  const captures = [...fixture.rows.get('sync_capture')!.values()]
    .map(parseSyncCaptureRecord)
    .filter((row) => row?.kind === 'sync-operation');
  expect(captures).toHaveLength(1);
  const captured = captures[0];
  if (captured?.phase !== 'native' || captured.change.kind !== 'media')
    throw new Error('Restored media capture is missing.');
  expect(captured).toMatchObject({ origin: 'local-restore', generation: 1, basis: [] });
  expect(captured.rootId).not.toBe(entry.id);
  expect(captured.change.rows.ref).toEqual(input.staged[0]!.ref);
  expect(captured.change.rows.projectAsset.id).toBe(
    captured.change.rows.media.source.kind === 'project-asset'
      ? captured.change.rows.media.source.projectAssetId
      : undefined
  );
  const project = createVideoProjectEntryWithMediaClip({ id: 'restored-borrowing-project' });
  const asset = project.project.assets[0]!;
  asset.source = { kind: 'library-asset', mediaId: captured.rootId };
  asset.metadata.mimeType = 'image/png';
  asset.metadata.size = 6;
  const after = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([...fixture.rows.keys()], 'readwrite');
    await tx.objectStore('video_projects').put(project);
    const after = await captureVideoProjectInTransaction(tx, project.id);
    await tx.done;
    return after;
  });
  expect(after).toMatchObject({
    change: {
      kind: 'video-project',
      rows: {
        mediaDependencies: [
          { mediaId: captured.rootId, generation: 1, basis: [captured.operationId] },
        ],
      },
    },
  });
});

it('aborts restored native rows and archive receipt when supported capture cannot commit', async () => {
  const { fixture, input, allowCapture } = await restoredOriginalFixture(true, true);
  const before = structuredClone(fixture.rows);
  await expect(mediaLibraryRootPublisher.publish(input)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(fixture.rows).toEqual(before);
  allowCapture();
  await expect(mediaLibraryRootPublisher.publish(input)).resolves.toMatchObject({ imported: true });
  expect(
    [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation')
  ).toHaveLength(1);
  expect([...fixture.rows.get('asset_operations')!.values()]).toEqual([
    { operationId: 'archive-receipt', type: 'test-receipt' },
  ]);
});

it('keeps restored originals usable without capture when the experimental profile is disabled', async () => {
  const { fixture, input } = await restoredOriginalFixture(false);
  await expect(mediaLibraryRootPublisher.publish(input)).resolves.toMatchObject({ imported: true });
  expect(
    [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation')
  ).toEqual([]);
});

it('skips an existing original without appending a capture under the enabled profile', async () => {
  const { fixture, input } = await restoredOriginalFixture();
  const before = structuredClone(fixture.rows.get('sync_capture'));
  await expect(
    mediaLibraryRootPublisher.publish({ ...input, session: { ...input.session, strategy: 'skip' } })
  ).resolves.toMatchObject({ imported: false });
  expect(fixture.rows.get('sync_capture')).toEqual(before);
  expect(fixture.rows.get('media_library')!.size).toBe(2);
});

it('keeps broad restored media outside the original-only pilot without inventing a causal head', async () => {
  const { fixture, input } = await restoredOriginalFixture(true, false, 1);
  await expect(mediaLibraryRootPublisher.publish(input)).resolves.toMatchObject({ imported: true });
  expect(
    [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation')
  ).toEqual([]);
});

it('captures a restored screenshot with detached original bytes and a target-local revision', async () => {
  const { fixture, input, entry } = await restoredOriginalFixture();
  const restored = {
    ...entry,
    id: 'restored-image',
    kind: 'screenshot' as const,
    source: { kind: 'screenshot' as const },
    workspaceRevision: 0,
    imageContentState: 'original' as const,
  };
  input.envelope.descriptor.rootId = restored.id;
  const metadata: unknown = JSON.parse(
    JSON.stringify({ entry: restored, originalObjectId: 'original' })
  );
  assertPortableJson(metadata);
  input.envelope.metadata = metadata;
  await mediaLibraryRootPublisher.publish(input);
  const capture = [...fixture.rows.get('sync_capture')!.values()]
    .map(parseSyncCaptureRecord)
    .find((row) => row?.kind === 'sync-operation');
  expect(capture).toMatchObject({
    phase: 'native',
    origin: 'local-restore',
    change: { kind: 'image', rows: { media: { id: restored.id, workspaceRevision: 1 } } },
  });
  if (
    capture?.kind !== 'sync-operation' ||
    capture.phase !== 'native' ||
    capture.change.kind !== 'image'
  )
    throw new Error('Expected restored image capture.');
  expect(capture.change.rows.media.blob).toBeInstanceOf(Blob);
  expect(capture.change.rows.media.blob).not.toBeInstanceOf(File);
  expect(await capture.change.rows.media.blob?.text()).toBe('source');
});

async function restoredReviewFixture(enabled = true) {
  let failCapture = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => failCapture && name === 'sync_capture'
  );
  const metadata = projectAssetReviewMetadata();
  const id = metadata.entry.id;
  const table = (name: string) => fixture.rows.get(name)!;
  const workspace = materializeVideoWorkspaceProject(
    {
      aggregateId: id,
      sourceAssetId: 'old-review-bytes',
      formatVersion: 1,
      source: metadata.videoReview.workspace.source,
      revision: 20,
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 2,
    },
    'Existing review'
  );
  table('media_library').set(id, metadata.entry);
  table('project_assets').set('review-original', {
    ...metadata.projectAsset,
    assetId: 'old-review-bytes',
  });
  table('asset_refs').set('old-review-bytes', {
    assetId: 'old-review-bytes',
    size: 6,
    mimeType: 'video/webm',
    createdAt: 1,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/old-review-bytes' },
  });
  table('asset_owners').set(JSON.stringify(['project-asset', 'review-original', 'body']), {
    assetId: 'old-review-bytes',
    ownerKind: 'project-asset',
    ownerId: 'review-original',
    role: 'body',
  });
  table('video_workspaces').set(id, workspace);
  table('video_workspace_drafts').set(id, {
    ...metadata.videoReview.draft,
    aggregateId: id,
    revision: 30,
  });
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled,
    spaceId: 'review-restore-space',
    connectionGeneration: 1,
  });
  mocks.db.mockResolvedValue(fixture.database);
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({
      ...fixture.database,
      get: async (name: string, key: string) => table(name)?.get(key),
    })
  );
  mocks.checkpoint.mockImplementation(async (store) =>
    store.put({ operationId: 'review-receipt', type: 'test-receipt' })
  );
  const input = {
    session: { ...session, currentRoot: `media:library-item:${id}` },
    journal,
    envelope: {
      descriptor: {
        rootKind: 'media' as const,
        mediaSubtype: 'library-item' as const,
        rootId: id,
        metadataPath: '_sniptale/metadata/review.json',
        objectCount: 1,
        totalBytes: 6,
      },
      metadata: portableJson(metadata),
      objects: [],
    },
    staged: [
      {
        objectId: 'review-original-object',
        ref: {
          assetId: 'restored-review-bytes',
          size: 6,
          mimeType: 'video/webm',
          createdAt: 1,
          sha256: null,
          location: { kind: 'opfs' as const, objectKey: 'objects/restored-review-bytes' },
        },
      },
    ],
  };
  const current = () => {
    const value = parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id));
    if (!value) throw new Error('Missing review fixture');
    return value;
  };
  const captures = () =>
    [...table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'sync-operation');
  return {
    fixture,
    input,
    metadata,
    workspace,
    table,
    current,
    captures,
    failCapture: (value: boolean) => {
      failCapture = value;
    },
  };
}

it('rebases Replace review and recovery clocks above native and sender revisions atomically', async () => {
  const data = await restoredReviewFixture();
  // Keep the exact original binding to isolate the restored native revision fence.
  data.input.staged[0]!.ref.assetId = 'old-review-bytes';
  data.input.staged[0]!.ref.location.objectKey = 'objects/old-review-bytes';
  await mediaLibraryRootPublisher.publish(data.input);
  expect(data.current().revision).toBeGreaterThan(20);
  expect(data.table('video_workspace_drafts').get(data.metadata.entry.id)).toMatchObject({
    revision: 31,
  });
  expect(data.captures()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rootKind: 'video-review', origin: 'local-restore' }),
      expect.objectContaining({ rootKind: 'media', origin: 'local-restore' }),
    ])
  );
  const capture = data.captures().find((row) => row?.rootKind === 'video-review');
  expect(capture).toMatchObject({
    change: {
      kind: 'video-review',
      rows: {
        review: {
          workspace: { revision: data.current().revision },
          draft: { revision: 31 },
        },
      },
    },
  });
  const before = structuredClone(data.fixture.rows);
  await expect(
    commitVideoWorkspace({
      aggregateId: data.metadata.entry.id,
      expectedRevision: 20,
      expectedSourceAssetId: 'old-review-bytes',
      operation: {
        id: 'stale',
        at: 1,
        target: 'annotation',
        before: null,
        after: { id: 'note', text: 'Stale', anchor: { kind: 'point', time: 1 } },
      },
    })
  ).rejects.toThrow();
  expect(data.fixture.rows).toEqual(before);
});

it('restores the same default identity above its native purge fence', async () => {
  const data = await restoredReviewFixture();
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([...data.fixture.rows.keys()], 'readwrite');
    await captureVideoReviewInTransaction(tx, data.metadata.entry.id);
    await tx.done;
  });
  await deleteVideoWorkspaceProject(data.metadata.entry.id, 20);
  expect(data.table('video_workspaces').has(data.metadata.entry.id)).toBe(false);
  await mediaLibraryRootPublisher.publish(data.input);
  expect(data.current().revision).toBeGreaterThan(20);
  expect(data.captures().filter((row) => row?.rootKind === 'video-review')).toHaveLength(3);
});

it('rolls back restored review, draft, source and archive receipt when capture cannot commit', async () => {
  const data = await restoredReviewFixture();
  const before = structuredClone(data.fixture.rows);
  data.failCapture(true);
  await expect(mediaLibraryRootPublisher.publish(data.input)).rejects.toThrow();
  expect(data.fixture.rows).toEqual(before);
  data.failCapture(false);
  await expect(mediaLibraryRootPublisher.publish(data.input)).resolves.toMatchObject({
    imported: true,
  });
});

it('preserves imported review clocks when capture is disabled', async () => {
  const data = await restoredReviewFixture(false);
  await mediaLibraryRootPublisher.publish(data.input);
  expect(data.current().revision).toBe(data.metadata.videoReview.workspace.revision);
  expect(data.table('video_workspace_drafts').get(data.metadata.entry.id)).toMatchObject({
    revision: data.metadata.videoReview.draft?.revision,
  });
  expect(data.captures()).toEqual([]);
});

it('preserves later native edits when an already committed archive checkpoint refuses a publisher retry', async () => {
  const data = await restoredReviewFixture();
  const actual = await vi.importActual<typeof import('../../../../composition/persistence/assets')>(
    '../../../../composition/persistence/assets'
  );
  mocks.checkpoint.mockImplementation(actual.appendCommittedArchiveRootInTransaction);
  data.table('asset_operations').set(data.input.session.operationId, data.input.session);
  await mediaLibraryRootPublisher.publish(data.input);
  const saved = data.current();
  await commitVideoWorkspace({
    aggregateId: saved.aggregateId,
    expectedRevision: saved.revision,
    expectedSourceAssetId: saved.sourceAssetId,
    operation: {
      id: 'later-edit',
      at: 2,
      target: 'annotation',
      before: null,
      after: { id: 'later-note', text: 'Keep later work', anchor: { kind: 'point', time: 1 } },
    },
  });
  const before = structuredClone(data.fixture.rows);
  await expect(mediaLibraryRootPublisher.publish(data.input)).rejects.toThrow('checkpoint');
  expect(data.fixture.rows).toEqual(before);
  expect(data.current().history).toHaveLength(1);
});

it('allocates restored clocks above higher sender workspace and recovery revisions', async () => {
  const data = await restoredReviewFixture();
  data.metadata.videoReview.workspace.revision = 70;
  data.metadata.videoReview.draft.revision = 80;
  data.input.envelope.metadata = portableJson(data.metadata);
  await mediaLibraryRootPublisher.publish(data.input);
  expect(data.current().revision).toBeGreaterThan(70);
  expect(data.table('video_workspace_drafts').get(data.metadata.entry.id)).toMatchObject({
    revision: 81,
  });
});
