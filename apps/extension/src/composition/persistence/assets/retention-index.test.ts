import { expect, it, vi } from 'vitest';
import {
  collectTargetAssetSnapshot,
  collectTargetAssetSnapshotInTransaction,
} from './retention-index';
import { createTargetAssetDatabaseFixture } from './retention-authority.test-support';
import { createMediaLibraryEntry, createVideoProjectEntry } from '../projects/index.test-support';

const source = { id: 'private', assetId: 'target', createdAt: 1, mimeType: 'image/png', size: 3 };
const ref = {
  assetId: 'target',
  createdAt: 1,
  mimeType: 'image/png',
  size: 3,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/target' },
};
const owner = { ownerKind: 'project-asset', ownerId: 'private', role: 'body', assetId: 'target' };

it.each([false, true])(
  'includes native Montage inverse claims in targeted GC: corrupt=%s',
  async (corrupt) => {
    const entry = {
      ...createVideoProjectEntry(),
      history: {
        version: corrupt ? 99 : 1,
        epoch: 'epoch',
        past: [{ assetId: 'target' }],
        future: [{ assetId: 'target' }],
        sources: [],
      },
    };
    const expected = {
      ownerKind: 'video-project-history',
      ownerId: entry.id,
      role: 'history:change:target',
      assetId: 'target',
    };
    const db = createTargetAssetDatabaseFixture(async (name) =>
      name === 'video_projects'
        ? [entry]
        : name === 'asset_owners'
          ? [expected]
          : name === 'asset_refs'
            ? [{ ...ref, mimeType: 'application/json' }]
            : []
    );
    const snapshot = await collectTargetAssetSnapshot(db, ['target']);
    expect(snapshot.authorityValid).toBe(!corrupt);
    if (!corrupt) {
      expect(snapshot.expectedOwners).toEqual([expected]);
      expect(snapshot.owners).toEqual([expected]);
    }
  }
);

it('returns no retirement authority after cancellation during evidence collection', async () => {
  const controller = new AbortController();
  const fixture = createTargetAssetDatabaseFixture(async (name) => {
    if (name === 'asset_refs') controller.abort(new Error('maintenance cancelled'));
    return [];
  });
  const transaction = vi.spyOn(fixture, 'transaction');
  await expect(collectTargetAssetSnapshot(fixture, ['target'], controller.signal)).rejects.toThrow(
    'maintenance cancelled'
  );
  expect(transaction.mock.results[0]?.value.abort).toHaveBeenCalledOnce();
});

it('refuses malformed selected reference evidence rather than reporting an unclaimed asset', async () => {
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'asset_refs' ? [{ ...ref, size: -1 }] : []
  );
  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot.authorityValid).toBe(false);
  expect(snapshot.refs).toEqual([]);
});

it('reads only target claims while preserving projected owners and immutable bindings', async () => {
  const unrelated = Array.from({ length: 1000 }, (_, index) => ({
    ...source,
    id: `unrelated-${index}`,
    assetId: `other-${index}`,
  }));
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets'
      ? [source, ...unrelated]
      : name === 'asset_refs'
        ? [ref]
        : name === 'asset_owners'
          ? [owner]
          : []
  );
  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot).toMatchObject({
    authorityValid: true,
    refs: [ref],
    owners: [owner],
    expectedOwners: [owner],
  });
  expect(snapshot.expectedOwnerAssets.get('project-asset\u0000private\u0000body')).toBe('target');
  expect(db.requests.mock.calls.every(([, , key]) => key !== undefined)).toBe(true);
});

it('retains bytes when an unrelated source has unknown physical reference evidence', async () => {
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets' ? [{ id: 'corrupt', assetId: null }] : []
  );
  expect((await collectTargetAssetSnapshot(db, ['target'])).authorityValid).toBe(false);
});

it('keeps conflicting projected owner bindings visible for private-source refusal', async () => {
  const replacement = { ...owner, assetId: 'replacement' };
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'project_assets'
      ? [source]
      : name === 'asset_owners'
        ? [replacement]
        : name === 'asset_refs'
          ? [ref]
          : []
  );
  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot.expectedOwners).toEqual([owner]);
  expect(snapshot.owners).toEqual([replacement]);
  expect(snapshot.refs).toEqual([ref]);
});

const cursorHead = {
  recordingId: 'recording-one',
  trajectoryId: 'a'.repeat(32),
  sourceRecordingId: 'canonical',
  writerGeneration: 'generation-one',
  revision: 1,
  width: 160,
  height: 90,
  retired: false,
  finalized: true,
  state: 'complete',
  totalBlocks: 1,
  totalRecords: 3,
  totalSamples: 1,
  totalBytes: 512,
  streamSha256: 'b'.repeat(64),
  activeSegment: null,
  lastObservationSeq: 0,
  lastSegmentId: 0,
  lastTimeUs: 2000,
  snapshotAssetId: 'target',
};
const eventHead = {
  recordingId: 'event-recording',
  eventStreamId: 'b'.repeat(32),
  sourceRecordingId: 'canonical',
  writerGeneration: 'source-generation',
  kind: 'head',
  entryId: 0,
  revision: 1,
  retired: false,
  finalized: true,
  state: 'incomplete',
  totalBlocks: 1,
  totalRecords: 3,
  totalBytes: 512,
  streamSha256: 'd'.repeat(64),
  activeSegment: null,
  lastSegmentId: 0,
  hasGap: true,
  activeInputs: 0,
  snapshotAssetId: 'target',
};

it.each([
  ['recording_cursor_trajectories', cursorHead, 'cursor-trajectory'],
  ['recording_events', eventHead, 'recording-events'],
] as const)(
  'retains %s snapshot ownership through a target-only native lookup',
  async (store, head, role) => {
    const db = createTargetAssetDatabaseFixture(async (name) => (name === store ? [head] : []));
    const snapshot = await collectTargetAssetSnapshot(db, ['target']);
    expect(snapshot.authorityValid).toBe(true);
    expect(snapshot.expectedOwners).toEqual([
      { ownerKind: 'recording', ownerId: head.recordingId, role, assetId: 'target' },
    ]);
    expect(db.requests).toHaveBeenCalledWith(store, 'snapshotAssetId', 'target');
  }
);

it.each([
  ['recording_cursor_trajectories', cursorHead],
  ['recording_events', eventHead],
] as const)(
  'ignores retired %s heads and refuses malformed selected head evidence',
  async (store, head) => {
    const row = { ...head, retired: true };
    const db = createTargetAssetDatabaseFixture(async (name) => (name === store ? [row] : []));
    expect((await collectTargetAssetSnapshot(db, ['target'])).expectedOwners).toEqual([]);
    row.retired = false;
    row.revision = -1;
    expect((await collectTargetAssetSnapshot(db, ['target'])).authorityValid).toBe(false);
  }
);

it('does not request evidence when the selected asset set is empty', async () => {
  const db = createTargetAssetDatabaseFixture(async () => []);
  const transaction = vi.spyOn(db, 'transaction');
  await expect(collectTargetAssetSnapshot(db, [])).resolves.toMatchObject({
    authorityValid: true,
    refs: [],
  });
  expect(transaction).not.toHaveBeenCalled();
  await expect(
    collectTargetAssetSnapshotInTransaction(
      {
        objectStore: vi.fn(() => {
          throw new Error('Empty asset set must not open a store.');
        }),
      },
      []
    )
  ).resolves.toMatchObject({ authorityValid: true, owners: [] });
});

it('recognizes an original that publishes a selected asset through project metadata', async () => {
  const original = createMediaLibraryEntry({
    id: 'original',
    kind: 'image',
    source: { kind: 'project-asset', projectAssetId: source.id },
  });
  const db = createTargetAssetDatabaseFixture(async (name) =>
    name === 'media_library' ? [original] : name === 'project_assets' ? [source] : []
  );

  const snapshot = await collectTargetAssetSnapshot(db, ['target']);
  expect(snapshot.authorityValid).toBe(true);
  expect(snapshot.expectedOwners).toEqual([owner]);
  expect(snapshot.publishedProjectAssetIds).toEqual(new Set([source.id]));
});
