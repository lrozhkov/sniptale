import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from './store.test-support';
import {
  reviewAdvancedContentBaseline,
  replayReviewHistory,
} from '../../../features/video/review/document';
import type { ReviewOperation } from '../../../features/video/review/types';
import type { VideoWorkspace } from './contracts';

const observed = vi.hoisted(() => ({
  database: vi.fn(),
  writes: [] as { store: string; value: unknown; bytes: number }[],
}));
vi.mock('../infrastructure/indexed-db/core', async (load) => ({
  ...(await load<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: observed.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await observed.database()),
}));
vi.mock('../assets/opfs-store', async (load) => ({
  ...(await load<typeof import('../assets/opfs-store')>()),
  listReadyJournals: vi.fn(async () => []),
}));
import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
} from './store';
const id = 'recording:beta-v1-recording';
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
let rows: Map<string, Map<string, unknown>>;
beforeEach(() => {
  observed.writes = [];
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  rows = fixture.rows;
  observed.database.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            put(value: Parameters<typeof store.put>[0]) {
              observed.writes.push({
                store: name,
                value: structuredClone(value),
                bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
              });
              return store.put(value);
            },
          };
        },
      };
    },
  });
});
function identity(workspace: VideoWorkspace) {
  return {
    aggregateId: id,
    expectedRevision: workspace.revision,
    expectedSourceAssetId: workspace.sourceAssetId,
  };
}
function mute(workspace: VideoWorkspace, operationId: string): ReviewOperation {
  const before = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  ).advancedContent.audio.original;
  return {
    id: operationId,
    at: workspace.revision + 1,
    target: 'sourceAudio',
    before: { muted: before.muted, volume: before.volume },
    after: { muted: !before.muted, volume: before.volume },
  };
}
async function retainedWorkspace() {
  let { workspace } = await openVideoWorkspace(id, source);
  for (let i = 0; i < 40; i++) {
    const operation: ReviewOperation = {
      id: `annotation-${i}`,
      at: i + 1,
      target: 'annotation',
      before: null,
      after: {
        id: `text-${i}`,
        text: 'Synthetic retained annotation. '.repeat(30),
        anchor: { kind: 'point', time: 2 },
      },
    };
    ({ workspace } = await commitVideoWorkspace({ ...identity(workspace), operation }));
  }
  observed.writes = [];
  return workspace;
}
it('appends one small operation without rewriting retained history or baseline', async () => {
  const previous = await retainedWorkspace();
  const previousRows = structuredClone(rows.get('video_workspace_history'));
  const next = await commitVideoWorkspace({
    ...identity(previous),
    operation: mute(previous, 'next'),
  });
  const heads = observed.writes.filter((write) => write.store === 'video_workspaces');
  const history = observed.writes.filter((write) => write.store === 'video_workspace_history');
  expect(heads).toHaveLength(1);
  expect(heads[0]?.bytes).toBeLessThan(1500);
  expect(heads[0]?.value).not.toHaveProperty('history');
  expect(history).toHaveLength(1);
  expect(history[0]?.bytes).toBeLessThan(400);
  for (const [key, value] of previousRows ?? [])
    expect(rows.get('video_workspace_history')?.get(key)).toEqual(value);
  expect(next.workspace.history).toHaveLength(41);
  expect((await readVideoWorkspace(id))?.workspace).toEqual(next.workspace);
});
it('undo updates only the compact head and retains every operation and baseline', async () => {
  const previous = await retainedWorkspace();
  const original = structuredClone(rows.get('video_workspace_history'));
  const next = await moveVideoWorkspaceHistory({ ...identity(previous), direction: 'undo' });
  expect(observed.writes.filter((write) => write.store === 'video_workspaces')).toHaveLength(1);
  expect(observed.writes.filter((write) => write.store === 'video_workspace_history')).toHaveLength(
    0
  );
  expect(observed.writes.find((write) => write.store === 'video_workspaces')?.bytes).toBeLessThan(
    1500
  );
  expect(rows.get('video_workspace_history')).toEqual(original);
  expect(next.workspace.cursor).toBe(39);
  expect(next.workspace.history).toHaveLength(40);
  expect((await readVideoWorkspace(id))?.workspace).toEqual(next.workspace);
});
