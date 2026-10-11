import { beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { maintainProjectUsageIndex } from './usage-index-maintenance';
import { USAGE_INDEX_MARKER } from './usage-index-keys';
const mocks = vi.hoisted(() => ({ initDB: vi.fn(), mutate: vi.fn(), ready: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));
vi.mock('./usage-index', () => ({ isProjectUsageIndexReady: mocks.ready }));
let current: object | undefined;
const put = vi.fn(async () => undefined);
const abort = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  current = createVideoProjectEntryWithMediaClip();
  mocks.ready.mockResolvedValue(false);
  const keys = vi.fn().mockResolvedValueOnce(['one']).mockResolvedValue([]);
  mocks.initDB.mockResolvedValue({ getAllKeys: keys });
  vi.stubGlobal('IDBKeyRange', { lowerBound: (key: unknown) => key });
  mocks.mutate.mockImplementation(async (write) =>
    write({
      transaction: () => ({
        objectStore: () => ({ get: async () => current, put }),
        done: Promise.resolve(),
        abort,
      }),
    })
  );
});
it('indexes a current row in its own mutation rather than publishing an earlier scan snapshot', async () => {
  const controller = new AbortController();
  const work = maintainProjectUsageIndex(controller.signal);
  current = { ...createVideoProjectEntryWithMediaClip({ name: 'Concurrent edit' }) };
  expect(await work).toBe(true);
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ name: 'Concurrent edit' }),
      usageReferenceKeys: expect.arrayContaining([USAGE_INDEX_MARKER]),
    })
  );
});
it('does not resurrect a row deleted after discovery', async () => {
  const work = maintainProjectUsageIndex(new AbortController().signal);
  current = undefined;
  expect(await work).toBe(false);
  expect(put).not.toHaveBeenCalled();
});
it('does not rewrite already indexed rows', async () => {
  current = { ...current, usageReferenceKeys: [USAGE_INDEX_MARKER] };
  expect(await maintainProjectUsageIndex(new AbortController().signal)).toBe(false);
  expect(put).not.toHaveBeenCalled();
});
it('cancels before mutation and avoids any scan when coverage is complete', async () => {
  const controller = new AbortController();
  const work = maintainProjectUsageIndex(controller.signal);
  controller.abort();
  expect(await work).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
  mocks.ready.mockResolvedValue(true);
  expect(await maintainProjectUsageIndex(new AbortController().signal)).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('aborts a failed transaction and propagates the failure to the advisory maintenance owner', async () => {
  put.mockRejectedValueOnce(new Error('Quota exceeded'));
  await expect(maintainProjectUsageIndex(new AbortController().signal)).rejects.toThrow(
    'Quota exceeded'
  );
  expect(abort).toHaveBeenCalledOnce();
});

it('indexes an admitted physical head without rewriting its baseline or retained redo', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const { workspaceStorageHead, workspaceStorageRows } =
    await import('../review-workspaces/storage-format');
  const { parseVideoWorkspace } = await import('../review-workspaces/parser');
  const workspace = parseVideoWorkspace({
    aggregateId: 'physical-review',
    formatVersion: 1,
    sourceAssetId: 'bytes',
    source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 },
    revision: 1,
    cursor: 0,
    createdAt: 1,
    updatedAt: 1,
    advanced: createQuickEditAdvancedState(),
    history: [
      {
        id: 'retained',
        at: 1,
        target: 'sourceAudio',
        before: { muted: false, volume: 1 },
        after: { muted: false, volume: 0.4 },
      },
    ],
  });
  if (!workspace) throw new Error('Invalid physical maintenance fixture');
  const head = workspaceStorageHead(workspace, []);
  const history = workspaceStorageRows(workspace);
  const before = structuredClone(history);
  const writes = vi.fn();
  mocks.initDB.mockResolvedValue({
    getAllKeys: vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace.aggregateId])
      .mockResolvedValue([]),
  });
  mocks.mutate.mockImplementation(async (write) =>
    write({
      transaction: (names: string[]) => {
        expect(names).toEqual(['video_workspaces', 'video_workspace_history']);
        return {
          objectStore: (name: string) =>
            name === 'video_workspaces'
              ? { get: async () => head, put: writes }
              : {
                  index: () => ({ getAll: async () => history }),
                  put: () => {
                    throw new Error('History rewrite forbidden');
                  },
                },
          done: Promise.resolve(),
          abort,
        };
      },
    })
  );
  expect(await maintainProjectUsageIndex(new AbortController().signal)).toBe(true);
  expect(writes).toHaveBeenCalledExactlyOnceWith({
    ...head,
    usageReferenceKeys: [USAGE_INDEX_MARKER],
  });
  expect(history).toEqual(before);
});
