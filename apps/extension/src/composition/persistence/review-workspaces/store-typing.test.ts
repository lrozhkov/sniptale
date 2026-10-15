import { beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import {
  createReviewWorkspaceStoreFixture,
  replaceLegacyWorkspaceFixture,
} from './store.test-support';
import { inspectVideoWorkspace } from './parser';
import type { VideoWorkspaceSnapshot } from './contracts';

const harness = vi.hoisted(() => ({ database: vi.fn(), failHead: false }));
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
import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  readVideoWorkspace,
  saveVideoWorkspaceTyping,
} from './store';

const aggregateId = 'recording:beta-v1-recording';
const actionId = '00000000-0000-4000-8000-000000000001';
let initial: VideoWorkspaceSnapshot;
let rows: Map<string, Map<string, unknown>>;
let writes: unknown[];
beforeEach(() => {
  harness.failHead = false;
  writes = [];
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => harness.failHead && name === 'video_workspaces'
  );
  rows = fixture.rows;
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
              if (name === 'video_workspace_history') writes.push(structuredClone(value));
              return store.put(value);
            },
          };
        },
      };
    },
  });
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'phrase',
        start: 0,
        end: 3,
        text: '',
        originalText: '',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        timeDomain: 'result',
        showInVideo: false,
      },
    ],
  };
  const admitted = inspectVideoWorkspace({
    aggregateId,
    formatVersion: 1,
    sourceAssetId: 'beta-v1-recording-asset',
    source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    advanced,
    cursor: 1,
    history: [
      {
        id: 'note',
        at: 1,
        target: 'annotation',
        before: null,
        after: { id: 'note', text: 'Keep this note', anchor: { kind: 'point', time: 2 } },
      },
    ],
  });
  if (!admitted.workspace) throw new Error('Invalid initial store fixture');
  initial = { workspace: admitted.workspace, draft: null };
  replaceLegacyWorkspaceFixture(rows, aggregateId, admitted.workspace);
});

function request(snapshot: VideoWorkspaceSnapshot, text: string, continuation: boolean) {
  const document = inspectVideoWorkspace(snapshot.workspace).document;
  if (!document?.advancedContent.text) throw new Error('Missing admitted text');
  const edited = editReviewTextFragment(document.advancedContent.text, 'phrase', { text });
  if (!edited.ok) throw new Error('Invalid text edit');
  return {
    aggregateId,
    expectedSourceAssetId: snapshot.workspace.sourceAssetId,
    expectedRevision: snapshot.workspace.revision,
    change: {
      actionId,
      target: { kind: 'text', fragmentId: 'phrase', field: 'text' },
      writeId: crypto.randomUUID(),
      continuation,
      at: Date.now(),
      before: document.advancedContent,
      after: { ...document.advancedContent, text: edited.document },
    },
  };
}

it('publishes two field captures under fresh CAS while replacing only their active tail row', async () => {
  const first = await saveVideoWorkspaceTyping(request(initial, 'First', false));
  const before = structuredClone(rows.get('video_workspace_history'));
  writes = [];
  const nextRequest = request(first, 'Final', true);
  const final = await saveVideoWorkspaceTyping(nextRequest);
  expect(final.workspace.history).toHaveLength(2);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ ordinal: 2, operation: { id: actionId } });
  expect(rows.get('video_workspace_history')!.get(JSON.stringify([aggregateId, 1]))).toEqual(
    before!.get(JSON.stringify([aggregateId, 1]))
  );
  expect(rows.get('video_workspace_history')!.get(JSON.stringify([aggregateId, 0]))).toEqual(
    before!.get(JSON.stringify([aggregateId, 0]))
  );
  expect(await readVideoWorkspace(aggregateId)).toEqual(final);
  await expect(saveVideoWorkspaceTyping(nextRequest)).rejects.toMatchObject({ code: 'conflict' });
  const undone = await moveVideoWorkspaceHistory({
    aggregateId,
    expectedRevision: final.workspace.revision,
    expectedSourceAssetId: final.workspace.sourceAssetId,
    direction: 'undo',
  });
  expect(
    inspectVideoWorkspace(undone.workspace).document?.advancedContent.text?.fragments[0]?.text
  ).toBe('');
  expect(inspectVideoWorkspace(undone.workspace).document?.annotations[0]?.text).toBe(
    'Keep this note'
  );
});

it('closes typing on an ordinary accepted operation instead of allowing an old field to absorb it', async () => {
  const first = await saveVideoWorkspaceTyping(request(initial, 'First', false));
  const next = await commitVideoWorkspace({
    aggregateId,
    expectedRevision: first.workspace.revision,
    expectedSourceAssetId: first.workspace.sourceAssetId,
    operation: {
      id: 'ordinary',
      at: 3,
      target: 'annotation',
      before: null,
      after: { id: 'another-note', text: 'Separate command', anchor: { kind: 'point', time: 3 } },
    },
  });
  expect(next.workspace).not.toHaveProperty('typing');
  const old = structuredClone(rows);
  await expect(saveVideoWorkspaceTyping(request(next, 'Final', true))).rejects.toMatchObject({
    code: 'conflict',
  });
  expect(rows).toEqual(old);
});

it('aborts a tail put when the final head put fails, leaving the complete old graph', async () => {
  const first = await saveVideoWorkspaceTyping(request(initial, 'First', false));
  const old = structuredClone(rows);
  harness.failHead = true;
  await expect(saveVideoWorkspaceTyping(request(first, 'Final', true))).rejects.toThrow();
  expect(writes.some((row) => isRecord(row) && row['ordinal'] === 2)).toBe(true);
  expect(rows).toEqual(old);
  harness.failHead = false;
  expect(await readVideoWorkspace(aggregateId)).toEqual(first);
});
