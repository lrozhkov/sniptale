import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { captureImageInTransaction } from './capture';
import { parseSyncCaptureRecord } from './guards';
import { parseCapturedImageRows, digestCapturedImageRows } from './image-snapshot';
import { collectSyncCaptureClaims } from './claims';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
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
  async function capture(edited = false) {
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
        const result = await captureImageInTransaction(tx, media.id);
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
