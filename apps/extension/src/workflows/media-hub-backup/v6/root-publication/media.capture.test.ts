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

const mocks = vi.hoisted(() => ({ checkpoint: vi.fn(), runMutation: vi.fn() }));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';

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
    .filter((row) => row?.kind === 'captured-change');
  expect(captures).toHaveLength(1);
  const captured = captures[0];
  if (captured?.change.kind !== 'media') throw new Error('Restored media capture is missing.');
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
      .filter((row) => row?.kind === 'captured-change')
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
      .filter((row) => row?.kind === 'captured-change')
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
      .filter((row) => row?.kind === 'captured-change')
  ).toEqual([]);
});
