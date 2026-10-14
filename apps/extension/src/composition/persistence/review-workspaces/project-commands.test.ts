import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture, fixtureWorkspaceValue } from './store.test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { parseVideoWorkspace } from './parser';
import { acquireAssetResourceSession } from '../assets/resource-sessions';
import { workspaceStorageHead, workspaceStorageRows } from './storage-format';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import { renameVideoWorkspaceProject, deleteVideoWorkspaceProject } from './project-commands';
import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
  runWithStoredItemLifecycle,
} from '../library-lifecycle/trash';

const mocks = vi.hoisted(() => ({ db: vi.fn(), complete: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await mocks.db()),
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  runWithDurableAssetLifecycleLock: async (operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  completePhysicalDeleteOperation: mocks.complete,
}));
afterEach(() => vi.unstubAllGlobals());
const id = 'recording:beta-v1-recording';
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
let fail = false;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  fail = false;
  fixture = createReviewWorkspaceStoreFixture(() => fail);
  const workspace = parseVideoWorkspace({
    aggregateId: id,
    formatVersion: 3,
    revision: 1,
    cursor: 1,
    sourceAssetId: 'beta-v1-recording-asset',
    source: { duration: 2, width: 640, height: 360, size: 15, mimeType: 'video/webm' },
    history: [
      {
        id: 'op',
        at: 1,
        target: 'annotation',
        before: null,
        after: { id: 'a', text: 'Saved', anchor: { kind: 'point', time: 1 } },
      },
    ],
    advanced: createQuickEditAdvancedState(),
    createdAt: 1,
    updatedAt: 1,
    project: { name: 'Edit', lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 } },
  });
  if (!workspace) throw new Error('Invalid project fixture');
  fixture.rows
    .get('video_workspaces')!
    .set(
      id,
      workspaceStorageHead(workspace, withReviewWorkspaceUsage(workspace).usageReferenceKeys)
    );
  for (const row of workspaceStorageRows(workspace))
    fixture.rows.get('video_workspace_history')!.set(JSON.stringify([id, row.ordinal]), row);
  fixture.rows.get('video_workspace_drafts')!.set(id, {
    aggregateId: id,
    revision: 7,
    annotation: { id: 'draft', text: 'Recovery', anchor: { kind: 'point', time: 1 } },
    before: null,
    updatedAt: 1,
  });
  mocks.db.mockResolvedValue(fixture.database);
  mocks.complete.mockResolvedValue(undefined);
});
it('renames with CAS without changing source metadata, history, or recovery', async () => {
  const before = structuredClone(fixture.rows);
  await renameVideoWorkspaceProject(id, 1, ' Renamed ');
  expect(parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id))).toMatchObject({
    revision: 2,
    project: { name: 'Renamed' },
  });
  for (const store of [
    'media_library',
    'recordings',
    'video_workspace_history',
    'video_workspace_drafts',
  ])
    expect(fixture.rows.get(store)).toEqual(before.get(store));
  await expect(renameVideoWorkspaceProject(id, 1, 'Stale')).rejects.toMatchObject({
    code: 'conflict',
  });
});
it('moves only the project to Trash and restores it with unchanged history and source', async () => {
  const before = structuredClone(fixture.rows);
  await moveStoredItemsToTrash([{ kind: 'quick-edit-project', id, expectedRevision: 1 }], 100);
  expect(parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id))).toMatchObject({
    revision: 2,
    project: { lifecycle: { trashedAt: 100 } },
  });
  await expect(renameVideoWorkspaceProject(id, 2, 'Trashed')).rejects.toMatchObject({
    code: 'conflict',
  });
  await restoreStoredItemsFromTrash([{ kind: 'quick-edit-project', id, expectedRevision: 2 }], 200);
  const restored = parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id));
  expect(restored?.revision).toBe(3);
  expect(restored?.project?.lifecycle).not.toHaveProperty('trashedAt');
  for (const store of [
    'media_library',
    'recordings',
    'video_workspace_history',
    'video_workspace_drafts',
    'asset_owners',
    'asset_refs',
  ])
    expect(fixture.rows.get(store)).toEqual(before.get(store));
});
it('purges only project head, history and recovery while preserving the source', async () => {
  const before = structuredClone(fixture.rows);
  await deleteVideoWorkspaceProject(id, 1);
  for (const store of ['video_workspaces', 'video_workspace_history', 'video_workspace_drafts'])
    expect(fixture.rows.get(store)?.size).toBe(0);
  for (const store of ['media_library', 'recordings', 'asset_owners', 'asset_refs'])
    expect(fixture.rows.get(store)).toEqual(before.get(store));
  await expect(deleteVideoWorkspaceProject(id, 1)).rejects.toMatchObject({ code: 'invalid' });
  expect(mocks.complete).not.toHaveBeenCalled();
});
it('rejects a stale purge and rolls back metadata failure without consuming recovery', async () => {
  const before = structuredClone(fixture.rows);
  await expect(deleteVideoWorkspaceProject(id, 0)).rejects.toMatchObject({ code: 'conflict' });
  fail = true;
  await expect(renameVideoWorkspaceProject(id, 1, 'Failure')).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});

it.each(['committed', 'journal-failure', 'physical-failure'] as const)(
  'journals causal private resources before purge (%s)',
  async (mode) => {
    const workspace = parseVideoWorkspace(fixtureWorkspaceValue(fixture.rows, id));
    if (!workspace) throw new Error('Missing fixture');
    const candidate = parseVideoWorkspace({
      ...workspace,
      advanced: {
        ...workspace.advanced,
        background: {
          enabled: true,
          type: 'image',
          imageFit: 'cover',
          assetId: 'project-asset:private',
          layout: { padding: 8, cornerRadius: 12 },
        },
      },
    });
    if (!candidate) throw new Error('Invalid resource fixture');
    fixture.rows
      .get('video_workspaces')!
      .set(
        id,
        workspaceStorageHead(candidate, withReviewWorkspaceUsage(candidate).usageReferenceKeys)
      );
    for (const row of workspaceStorageRows(candidate))
      fixture.rows.get('video_workspace_history')!.set(JSON.stringify([id, row.ordinal]), row);
    fixture.rows.get('project_assets')!.set('private', {
      id: 'private',
      assetId: 'bytes',
      createdAt: 1,
      size: 3,
      mimeType: 'image/png',
    });
    const before = structuredClone(fixture.rows);
    if (mode === 'journal-failure') fail = true;
    if (mode === 'physical-failure') mocks.complete.mockRejectedValueOnce(new Error('IO'));
    if (mode === 'journal-failure') {
      await expect(deleteVideoWorkspaceProject(id, 1)).rejects.toThrow();
      expect(fixture.rows).toEqual(before);
      expect(mocks.complete).not.toHaveBeenCalled();
      return;
    }
    await deleteVideoWorkspaceProject(id, 1);
    expect(fixture.rows.get('video_workspaces')!.has(id)).toBe(false);
    expect([...fixture.rows.get('asset_operations')!.values()]).toEqual([
      expect.objectContaining({
        privateSources: [{ projectAssetId: 'private', expectedAssetId: 'bytes' }],
      }),
    ]);
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(fixture.rows.get('project_assets')).toEqual(before.get('project_assets'));
    expect(fixture.rows.get('media_library')).toEqual(before.get('media_library'));
  }
);

it('rejects stale confirmation after restore and rolls back a mixed move before any partial commit', async () => {
  const before = structuredClone(fixture.rows);
  await expect(
    moveStoredItemsToTrash(
      [
        { kind: 'media', id },
        { kind: 'quick-edit-project', id, expectedRevision: 0 },
      ],
      100
    )
  ).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
  await moveStoredItemsToTrash([{ kind: 'quick-edit-project', id, expectedRevision: 1 }], 100);
  await restoreStoredItemsFromTrash([{ kind: 'quick-edit-project', id, expectedRevision: 2 }], 200);
  const operation = vi.fn(async () => undefined);
  await expect(
    runWithStoredItemLifecycle(
      { kind: 'quick-edit-project', id, expectedRevision: 2 },
      { updatedAt: 1, trashedAt: 100 },
      operation
    )
  ).rejects.toThrow();
  expect(operation).not.toHaveBeenCalled();
  expect(fixture.rows.get('media_library')).toEqual(before.get('media_library'));
});

it('refuses purge while an old editor can write and permits retry only after its session drains', async () => {
  let readers = 0;
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        options: { mode: string },
        action: (lock: object | null) => Promise<unknown>
      ) => {
        if (options.mode === 'exclusive') return action(readers ? null : {});
        readers++;
        try {
          return await action({});
        } finally {
          readers--;
        }
      },
    },
  });
  const editor = await acquireAssetResourceSession();
  const before = structuredClone(fixture.rows);
  try {
    await expect(deleteVideoWorkspaceProject(id, 1)).rejects.toMatchObject({ code: 'conflict' });
    expect(fixture.rows).toEqual(before);
    expect(mocks.complete).not.toHaveBeenCalled();
  } finally {
    await editor.release();
  }
  await deleteVideoWorkspaceProject(id, 1);
  expect(fixture.rows.get('video_workspaces')!.has(id)).toBe(false);
  expect(fixture.rows.get('media_library')).toEqual(before.get('media_library'));
});

it('refuses project purge without native session coordination in the extension', async () => {
  vi.stubGlobal('chrome', {});
  const before = structuredClone(fixture.rows);
  await expect(deleteVideoWorkspaceProject(id, 1)).rejects.toMatchObject({ code: 'conflict' });
  expect(fixture.rows).toEqual(before);
});
