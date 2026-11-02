import { initDB } from '../infrastructure/indexed-db/core';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { captureRootCheckpointInTransaction } from '../sync-capture/capture';
import { updateMediaLibraryEntry } from '../media-library/index.library';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createReviewWorkspaceStoreFixture,
  fixtureWorkspaceValue,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';
import { createMediaLibraryEntry, createProjectAssetEntry } from '../projects/index.test-support';
import { parseVideoWorkspace } from './parser';
import {
  openVideoWorkspace,
  readVideoWorkspace,
  commitVideoWorkspace,
  createVideoWorkspaceProject,
  saveVideoWorkspaceDraft,
  moveVideoWorkspaceHistory,
} from './store';
import { deleteVideoWorkspaceProject, renameVideoWorkspaceProject } from './project-commands';
import { moveStoredItemsToTrash, restoreStoredItemsFromTrash } from '../library-lifecycle/trash';
import type { VideoWorkspaceSnapshot } from './contracts';

const mocks = vi.hoisted(() => ({ db: vi.fn(), writes: Promise.resolve<unknown>(undefined) }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: (operation: (db: unknown) => Promise<unknown>) => {
    const pending = mocks.writes.then(async () => operation(await mocks.db()));
    mocks.writes = pending.catch(() => undefined);
    return pending;
  },
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  runWithDurableAssetLifecycleLock: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [],
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: async () => undefined,
}));

let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
let failStore: string | undefined;
let successfulCaptureWrites: number | undefined;
const id = 'project-asset:review-source';
const source = { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' };
const annotation = { id: 'note', text: 'Saved', anchor: { kind: 'point' as const, time: 1 } };

function table(name: string) {
  const rows = fixture.rows.get(name);
  if (!rows) throw new Error('Missing test store');
  return rows;
}
function captures(rootId?: string) {
  return [...table('sync_capture').values()]
    .filter(isRecord)
    .filter(
      (row) =>
        row['kind'] === 'sync-operation' &&
        row['rootKind'] === 'video-review' &&
        (rootId === undefined || row['rootId'] === rootId)
    );
}
function pendingRecords() {
  return [...table('sync_capture').values()]
    .map(parseSyncCaptureRecord)
    .filter((row) => row?.kind === 'pending-checkpoint');
}
function pending(rootId = id) {
  const selected = pendingRecords().find(
    (row) => row?.rootKind === 'video-review' && row.rootId === rootId
  );
  if (!selected || selected.kind !== 'pending-checkpoint')
    throw new Error('Missing pending Review root.');
  return selected;
}
async function checkpoint(rootId = id) {
  const selected = pending(rootId);
  const db = await initDB();
  const tx = db.transaction([...fixture.rows.keys()], 'readwrite');
  try {
    const captured = await captureRootCheckpointInTransaction(tx, selected, {
      now: selected.dueAt,
    });
    await tx.done;
    if (!captured) throw new Error('Expected due native Review checkpoint.');
    return captured;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A failed transaction can already be inactive. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
function current(rootId = id) {
  const workspace = parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, rootId));
  if (!workspace) throw new Error('Missing native review');
  return workspace;
}
function commit(snapshot: VideoWorkspaceSnapshot, text = 'Saved') {
  return commitVideoWorkspace({
    aggregateId: snapshot.workspace.aggregateId,
    expectedRevision: snapshot.workspace.revision,
    expectedSourceAssetId: snapshot.workspace.sourceAssetId,
    operation: {
      id: `note-${text}`,
      at: 1,
      target: 'annotation',
      before: null,
      after: { ...annotation, text },
    },
  });
}
function create(snapshot: VideoWorkspaceSnapshot, archiveId: string) {
  return createVideoWorkspaceProject({
    aggregateId: snapshot.workspace.aggregateId,
    expectedRevision: snapshot.workspace.revision,
    expectedSourceAssetId: snapshot.workspace.sourceAssetId,
    archiveId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  mocks.writes = Promise.resolve();
  failStore = undefined;
  successfulCaptureWrites = undefined;
  fixture = createReviewWorkspaceStoreFixture((store) => {
    if (store === 'sync_capture' && successfulCaptureWrites !== undefined) {
      if (successfulCaptureWrites === 0) return true;
      successfulCaptureWrites--;
    }
    return store === failStore;
  });
  mocks.db.mockResolvedValue(fixture.database);
  table('project_assets').set(
    'review-source',
    createProjectAssetEntry({
      id: 'review-source',
      assetId: 'review-original',
      mimeType: source.mimeType,
      size: source.size,
    })
  );
  table('asset_refs').set('review-original', {
    assetId: 'review-original',
    createdAt: 1,
    mimeType: source.mimeType,
    size: source.size,
    sha256: null,
    location: { kind: 'opfs', objectKey: 'objects/review-original' },
  });
  table('asset_owners').set(JSON.stringify(['project-asset', 'review-source', 'body']), {
    assetId: 'review-original',
    ownerKind: 'project-asset',
    ownerId: 'review-source',
    role: 'body',
  });
  table('media_library').set(
    id,
    createMediaLibraryEntry({
      id,
      kind: 'video',
      mimeType: source.mimeType,
      size: source.size,
      source: { kind: 'project-asset', projectAssetId: 'review-source' },
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    })
  );
  table('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 100,
    enabled: true,
    spaceId: 'review-writer-proof',
    connectionGeneration: 1,
  });
});
afterEach(() => vi.unstubAllGlobals());

it('coalesces accepted opening, content, draft and Undo into one due native checkpoint', async () => {
  const opened = await openVideoWorkspace(id, source, 'review-original');
  const first = pending();
  expect(first.dueAt).toBe(first.createdAt + 300000);
  expect(captures(id)).toHaveLength(0);
  await openVideoWorkspace(id, source, 'review-original');
  expect(pending().dueAt).toBe(first.dueAt);
  const saved = await commit(opened);
  const content = pending();
  const drafted = await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: saved.workspace.revision,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    expectedDraftRevision: null,
    annotation: { ...annotation, id: 'draft', text: 'Recovery' },
    before: null,
  });
  expect(drafted.workspace.revision).toBe(saved.workspace.revision);
  expect(pending().revision).not.toBe(content.revision);
  expect(pending().dueAt).toBe(first.dueAt);
  const undone = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: drafted.workspace.revision,
    expectedSourceAssetId: drafted.workspace.sourceAssetId,
    direction: 'undo',
  });
  expect(undone.workspace.cursor).toBe(0);
  const boundary = await moveVideoWorkspaceHistory({
    aggregateId: id,
    expectedRevision: undone.workspace.revision,
    expectedSourceAssetId: undone.workspace.sourceAssetId,
    direction: 'undo',
  });
  expect(boundary.workspace.revision).toBe(undone.workspace.revision);
  expect(captures(id)).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(1);
  await checkpoint();
  expect(captures(id)).toHaveLength(1);
  expect(captures(id)[0]).toMatchObject({
    change: {
      kind: 'video-review',
      rows: { review: { workspace: { cursor: 0 }, draft: { annotation: { text: 'Recovery' } } } },
    },
  });
  expect(pendingRecords()).toHaveLength(0);
});

it('serializes parallel native writers and checkpoints only the admitted workspace CAS', async () => {
  const opened = await openVideoWorkspace(id, source);
  const first = pending();
  const result = await Promise.allSettled([commit(opened, 'First'), commit(opened, 'Second')]);
  expect(result.map((entry) => entry.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(current().history).toHaveLength(1);
  expect(captures(id)).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(1);
  expect(pending().revision).not.toBe(first.revision);
  expect(pending().dueAt).toBe(first.dueAt);
  await checkpoint();
  expect(captures(id)).toHaveLength(1);
  expect(captures(id)[0]).toMatchObject({
    change: { rows: { review: { workspace: { history: [{ after: { text: 'First' } }] } } } },
  });
});

it('marks New archive and default atomically and replays without changing native or pending state', async () => {
  const saved = await commit(await openVideoWorkspace(id, source));
  const archiveId = 'project-asset:quick-project:first';
  const next = await create(saved, archiveId);
  expect(current(archiveId).sourceMediaId).toBe(id);
  expect(current(archiveId).history).toEqual(saved.workspace.history);
  expect(next.workspace.history).toEqual([]);
  expect(table('media_library').has(archiveId)).toBe(false);
  expect(captures()).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(2);
  const beforeReplay = structuredClone(fixture.rows);
  const replay = await create(saved, archiveId);
  expect(replay.workspace).toEqual(next.workspace);
  expect(replay).not.toHaveProperty('archiveCheckpointReceipt');
  expect(replay).not.toHaveProperty('checkpointReceipt');
  expect(fixture.rows).toEqual(beforeReplay);
  await checkpoint(archiveId);
  await checkpoint(id);
  expect(captures(archiveId)).toHaveLength(1);
  expect(captures(id)).toHaveLength(1);
});

it('rolls back New native rows and both pending roots after capture failure and retries the command', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = structuredClone(fixture.rows);
  successfulCaptureWrites = 2;
  const archiveId = 'project-asset:quick-project:retry';
  await expect(create(opened, archiveId)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  successfulCaptureWrites = undefined;
  const created = await create(opened, archiveId);
  expect(created.archiveCheckpointReceipt?.revision).toBe(pending(archiveId).revision);
  expect(pendingRecords()).toHaveLength(2);
  expect(captures()).toHaveLength(0);
  await checkpoint(archiveId);
  expect(captures(archiveId)).toHaveLength(1);
});

it('defers rename and captures Trash transitions only for the selected independent archive root', async () => {
  const opened = await openVideoWorkspace(id, source);
  const firstId = 'project-asset:quick-project:first';
  const secondId = 'project-asset:quick-project:second';
  const next = await create(opened, firstId);
  await create(next, secondId);
  const untouched = structuredClone(current(secondId));
  const sourceBefore = structuredClone(table('media_library').get(id));
  const first = current(firstId);
  await renameVideoWorkspaceProject(firstId, first.revision, 'Independent name');
  expect(captures(firstId)).toHaveLength(0);
  expect(pending(firstId).rootId).toBe(firstId);
  const otherPending = structuredClone(pending(secondId));
  await moveStoredItemsToTrash(
    [{ kind: 'quick-edit-project', id: firstId, expectedRevision: current(firstId).revision }],
    100
  );
  await restoreStoredItemsFromTrash(
    [{ kind: 'quick-edit-project', id: firstId, expectedRevision: current(firstId).revision }],
    200
  );
  expect(current(firstId).project?.name).toBe('Independent name');
  expect(current(firstId).project?.lifecycle.trashedAt).toBeUndefined();
  expect(current(secondId)).toEqual(untouched);
  expect(table('media_library').get(id)).toEqual(sourceBefore);
  expect(captures(firstId)).toHaveLength(2);
  expect(captures(secondId)).toHaveLength(0);
  expect(pending(secondId)).toEqual(otherPending);
  await checkpoint(secondId);
  expect(captures(secondId)).toHaveLength(1);
});

it('fences a delayed writer after purge and reopening the same default identity', async () => {
  const old = await openVideoWorkspace(id, source);
  const oldPending = pending();
  await deleteVideoWorkspaceProject(id, old.workspace.revision);
  expect(pendingRecords()).toHaveLength(0);
  expect(await readVideoWorkspace(id)).toBeNull();
  const reopened = await openVideoWorkspace(id, source);
  expect(reopened.workspace.revision).toBeGreaterThan(old.workspace.revision);
  const before = structuredClone(fixture.rows);
  await expect(commit(old, 'Delayed')).rejects.toMatchObject({ code: 'conflict' });
  expect(fixture.rows).toEqual(before);
  expect(captures(id)).toHaveLength(1);
  expect(captures(id)[0]).toMatchObject({ change: { kind: 'tombstone' } });
  expect(pending().revision).not.toBe(oldPending.revision);
});

it('refuses a New command retry after its archive was purged without resetting the newer default', async () => {
  const opened = await openVideoWorkspace(id, source);
  const archiveId = 'project-asset:quick-project:purged';
  const next = await create(opened, archiveId);
  await deleteVideoWorkspaceProject(archiveId, current(archiveId).revision);
  const before = structuredClone(fixture.rows);
  await expect(create(next, archiveId)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  expect(current().revision).toBe(next.workspace.revision);
});

it('rolls back draft and metadata publication when their capture intent cannot commit', async () => {
  const opened = await openVideoWorkspace(id, source);
  const before = structuredClone(fixture.rows);
  failStore = 'sync_capture';
  await expect(
    saveVideoWorkspaceDraft({
      aggregateId: id,
      expectedRevision: opened.workspace.revision,
      expectedSourceAssetId: opened.workspace.sourceAssetId,
      expectedDraftRevision: null,
      annotation,
      before: null,
    })
  ).rejects.toThrow();
  await expect(
    renameVideoWorkspaceProject(id, opened.workspace.revision, 'Refused')
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});

it('refuses unsupported enrolled recording opening atomically and preserves disabled behavior', async () => {
  const before = structuredClone(fixture.rows);
  await expect(
    openVideoWorkspace('recording:beta-v1-recording', { ...source, size: 15 })
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  table('sync_capture').delete('profile');
  const opened = await openVideoWorkspace('recording:beta-v1-recording', { ...source, size: 15 });
  expect(opened.workspace.aggregateId).toBe('recording:beta-v1-recording');
  expect(captures()).toEqual([]);
});

it('defers legacy materialization and rolls back initial opening pending failure', async () => {
  failStore = 'sync_capture';
  const before = structuredClone(fixture.rows);
  await expect(openVideoWorkspace(id, source)).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  failStore = undefined;
  const opened = await openVideoWorkspace(id, source);
  const { project: _project, ...legacy } = opened.workspace;
  replaceLegacyWorkspaceFixture(fixture.rows, id, { ...legacy, formatVersion: 1 });
  const materialized = await openVideoWorkspace(id, source);
  expect(materialized.workspace.project).toBeDefined();
  expect(materialized.workspace.revision).toBeGreaterThan(opened.workspace.revision);
  expect(captures(id)).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(1);
  await checkpoint();
  expect(captures(id)).toHaveLength(1);
});

it('admits only one parallel draft-only writer without advancing the document revision', async () => {
  const opened = await openVideoWorkspace(id, source);
  const request = {
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: opened.workspace.sourceAssetId,
    expectedDraftRevision: null,
    annotation,
    before: null,
  };
  const result = await Promise.allSettled([
    saveVideoWorkspaceDraft(request),
    saveVideoWorkspaceDraft({
      ...request,
      annotation: { ...annotation, text: 'Competing recovery' },
    }),
  ]);
  expect(result.map((entry) => entry.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(current().revision).toBe(opened.workspace.revision);
  expect(captures(id)).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(1);
  expect((await readVideoWorkspace(id))?.draft?.annotation.text).toBe('Saved');
  await checkpoint();
  expect(captures(id)).toHaveLength(1);
  expect(captures(id)[0]).toMatchObject({
    change: { rows: { review: { draft: { annotation: { text: 'Saved' } } } } },
  });
});

it('keeps archived editor and reset default independent across New and explicit checkpoints', async () => {
  const saved = await commit(await openVideoWorkspace(id, source));
  const firstId = 'project-asset:quick-project:from-default';
  await create(saved, firstId);
  const first = await readVideoWorkspace(firstId);
  if (!first) throw new Error('Missing archived review');
  const firstBefore = structuredClone(first);
  const secondId = 'project-asset:quick-project:from-archive';
  await create(first, secondId);
  expect(await readVideoWorkspace(firstId)).toEqual(firstBefore);
  expect(current(secondId).sourceMediaId).toBe(id);
  expect(current().history).toEqual([]);
  expect(captures(firstId)).toHaveLength(0);
  expect(captures(secondId)).toHaveLength(0);
  expect(pendingRecords()).toHaveLength(3);
  await checkpoint(firstId);
  await checkpoint(secondId);
  expect(captures(firstId)).toHaveLength(1);
  expect(captures(secondId)).toHaveLength(1);
  expect(captures(id)).toHaveLength(0);
  expect(pending(id).rootId).toBe(id);
});

it('captures original Library metadata without changing its independent review or draft', async () => {
  const opened = await openVideoWorkspace(id, source, 'review-original');
  await saveVideoWorkspaceDraft({
    aggregateId: id,
    expectedRevision: opened.workspace.revision,
    expectedSourceAssetId: 'review-original',
    expectedDraftRevision: null,
    annotation,
    before: null,
  });
  const reviewBefore = structuredClone(fixtureWorkspaceValue(fixture.rows, id));
  const draftBefore = structuredClone(table('video_workspace_drafts').get(id));
  const reviewCapturesBefore = structuredClone(captures());
  await updateMediaLibraryEntry(id, { filename: 'Renamed.webm', tags: ['work'] });
  expect(fixtureWorkspaceValue(fixture.rows, id)).toEqual(reviewBefore);
  expect(table('video_workspace_drafts').get(id)).toEqual(draftBefore);
  expect(captures()).toEqual(reviewCapturesBefore);
  expect([...table('sync_capture').values()]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rootKind: 'media',
        change: expect.objectContaining({
          kind: 'media',
          rows: expect.objectContaining({
            media: expect.objectContaining({ filename: 'Renamed.webm', tags: ['work'] }),
          }),
        }),
      }),
    ])
  );
});
