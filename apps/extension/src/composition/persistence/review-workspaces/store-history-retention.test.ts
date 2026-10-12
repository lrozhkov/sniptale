import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createHistoryRetentionWorkspace } from './history-retention.test-support';
import { inspectVideoWorkspace } from './parser';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';

const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (load) => ({
  ...(await load<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.database,
}));
vi.mock('../assets/opfs-store', async (load) => ({
  ...(await load<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [],
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.database()),
}));
import { commitVideoWorkspace, readVideoWorkspace, saveVideoWorkspaceSnapshot } from './store';
import { applyLocalReviewChange } from '../../../workflows/video-review/local-session';

let rows: Map<string, Map<string, unknown>>;
let historyWrites: unknown[];
beforeEach(() => {
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  rows = fixture.rows;
  historyWrites = [];
  harness.database.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      const transaction = fixture.database.transaction(stores, mode);
      return {
        abort: () => transaction.abort(),
        get done() {
          return transaction.done;
        },
        objectStore(name: string) {
          const store = transaction.objectStore(name);
          return {
            ...store,
            async put(value: unknown) {
              if (name === 'video_workspace_history') historyWrites.push(structuredClone(value));
              return store.put(value);
            },
          };
        },
      };
    },
  });
});

async function saveScaledWorkspace(cursor?: number) {
  const previous = createHistoryRetentionWorkspace({
    fragments: 4,
    ...(cursor === undefined ? {} : { cursor }),
  });
  const admitted = inspectVideoWorkspace(previous);
  if (!admitted.workspace || !admitted.document)
    throw new Error(`Invalid synthetic scale fixture: ${admitted.failure?.check}`);
  expect(previous.history).toHaveLength(1190);
  replaceLegacyWorkspaceFixture(rows, previous.aggregateId, previous);
  const unchanged = structuredClone(rows);
  expect((await readVideoWorkspace(previous.aggregateId))?.workspace.history).toHaveLength(1190);
  expect(rows).toEqual(unchanged);
  const before = admitted.document.advancedContent.audio.original;
  const saved = await commitVideoWorkspace({
    aggregateId: previous.aggregateId,
    expectedRevision: previous.revision,
    expectedSourceAssetId: previous.sourceAssetId,
    operation: {
      id: 'ordinary-save',
      at: 1191,
      target: 'sourceAudio',
      before: { muted: before.muted, volume: before.volume },
      after: { muted: !before.muted, volume: before.volume },
    },
  });
  return { previous, saved, original: admitted.document };
}

it.each([undefined, 600])(
  'bounds combined history after an ordinary save from cursor %s',
  async (cursor) => {
    const { saved } = await saveScaledWorkspace(cursor);
    expect(saved.workspace.history.length).toBeLessThanOrEqual(50);
    expect(
      new TextEncoder().encode(JSON.stringify(saved.workspace.history)).byteLength
    ).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(await readVideoWorkspace(saved.workspace.aggregateId)).toEqual(saved);
  }
);

it('stores a complete baseline retaining old Cuts, Speed, notes, canvas comments and action audio', async () => {
  const { saved, original } = await saveScaledWorkspace();
  const baselineRow = [...rows.get('video_workspace_history')!.values()].find(
    (row) => isRecord(row) && row['ordinal'] === 0
  );
  const baseline = isRecord(baselineRow) ? baselineRow['baseline'] : undefined;
  expect(baseline).toMatchObject({
    edits: original.edits,
    annotations: original.annotations,
    canvasComments: original.canvasComments,
    advancedContent: { actionAudio: original.advancedContent.actionAudio },
  });
  const restored = inspectVideoWorkspace(saved.workspace);
  expect(restored.document).toMatchObject({
    edits: original.edits,
    annotations: original.annotations,
    canvasComments: original.canvasComments,
  });
});

it('keeps retained row identities and ordinals when an ordinary paused-buffer Save rolls over', async () => {
  const { saved } = await saveScaledWorkspace();
  const current = inspectVideoWorkspace(saved.workspace).document!;
  const before = current.advancedContent.audio.original;
  const local = applyLocalReviewChange(saved, {
    kind: 'commit',
    consumeDraft: false,
    operation: {
      id: 'paused-gain',
      at: 2000,
      target: 'sourceAudio',
      before: { muted: before.muted, volume: before.volume },
      after: { muted: before.muted, volume: 0.75 },
    },
  });
  const previous = new Map(rows.get('video_workspace_history')!);
  historyWrites = [];
  const updated = await saveVideoWorkspaceSnapshot({
    aggregateId: saved.workspace.aggregateId,
    expectedRevision: saved.workspace.revision,
    expectedDraftRevision: null,
    expectedSourceAssetId: saved.workspace.sourceAssetId,
    workspace: local.workspace,
    draft: null,
  });
  expect(updated.workspace.history).toHaveLength(50);
  const written = rows.get('video_workspace_history')!;
  for (const [key, row] of previous)
    if (isRecord(row) && typeof row['ordinal'] === 'number' && row['ordinal'] > 1)
      expect(written.get(key)).toStrictEqual(row);
  expect(historyWrites.filter((row) => isRecord(row) && row['ordinal'] !== 0)).toHaveLength(1);
  expect([...written.values()].some((row) => isRecord(row) && row['ordinal'] === 51)).toBe(true);
  expect(await readVideoWorkspace(updated.workspace.aggregateId)).toEqual(updated);
});
