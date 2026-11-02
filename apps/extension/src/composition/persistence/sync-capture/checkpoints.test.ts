import { beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { parseSyncCaptureRecord } from './guards';
import type { SyncCaptureProfile } from './contracts';
import {
  captureCheckpointReceiptInTransaction,
  consumeCheckpointInTransaction,
  deferCheckpointInTransaction,
  readCheckpointInTransaction,
} from './checkpoints';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
let failure = false;
let fixture: ReturnType<typeof createReviewWorkspaceStoreFixture>;
const profile: SyncCaptureProfile = {
  version: 1,
  kind: 'profile',
  key: 'profile',
  enabled: true,
  createdAt: 1,
  connectionGeneration: 1,
  spaceId: 'space',
};
const scope = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
const root = { rootKind: 'video-project' as const, rootId: 'project' };

type Tx = Parameters<typeof deferCheckpointInTransaction>[0];
async function transaction<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(['sync_capture', 'video_projects'], 'readwrite');
    try {
      const result = await action(tx);
      await tx.done;
      return result;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

beforeEach(() => {
  failure = false;
  fixture = createReviewWorkspaceStoreFixture((name) => failure && name === 'sync_capture');
  io.database.mockResolvedValue(fixture.database);
  fixture.rows.get('sync_capture')!.set('profile', profile);
});

it('keeps one pending root and the first deadline across ten native saves', async () => {
  const revisions: string[] = [];
  for (let i = 0; i < 10; i++) {
    await transaction(async (tx) => {
      await tx.objectStore('video_projects').put({ id: root.rootId, savedValue: i });
      const pending = await deferCheckpointInTransaction(tx, root, 1000 + i * 1000);
      if (!pending) throw new Error('Expected pending checkpoint.');
      revisions.push(pending.revision);
      expect(pending.createdAt).toBe(1000);
      expect(pending.dueAt).toBe(301000);
    });
  }
  expect(new Set(revisions).size).toBe(10);
  expect(fixture.rows.get('sync_capture')!.size).toBe(2);
  expect(fixture.rows.get('video_projects')!.get(root.rootId)).toEqual({
    id: root.rootId,
    savedValue: 9,
  });
  const pending = await transaction((tx) => readCheckpointInTransaction(tx, scope, root));
  expect(pending?.revision).toBe(revisions[9]);
  expect(parseSyncCaptureRecord(pending)).toEqual(pending);
  expect(JSON.stringify(pending).length).toBeLessThan(1024);
});

it('consumes only the exact pending revision and preserves a newer save', async () => {
  const previous = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  const current = await transaction((tx) => deferCheckpointInTransaction(tx, root, 2000));
  if (!previous || !current) throw new Error('Expected pending checkpoints.');
  expect(await transaction((tx) => consumeCheckpointInTransaction(tx, previous))).toBe(false);
  expect(await transaction((tx) => readCheckpointInTransaction(tx, scope, root))).toEqual(current);
  expect(await transaction((tx) => consumeCheckpointInTransaction(tx, current))).toBe(true);
  expect(await transaction((tx) => readCheckpointInTransaction(tx, scope, root))).toBeNull();
});

it('refuses pending state from another enrollment lifetime', async () => {
  await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  fixture.rows.get('sync_capture')!.set('profile', { ...profile, createdAt: 2 });
  await expect(transaction((tx) => deferCheckpointInTransaction(tx, root, 2000))).rejects.toThrow(
    'checkpoint'
  );
  await expect(
    transaction((tx) => readCheckpointInTransaction(tx, { ...scope, profileCreatedAt: 2 }, root))
  ).rejects.toThrow('checkpoint');
});

it('rolls back native and pending writes together on failure', async () => {
  failure = true;
  await expect(
    transaction(async (tx) => {
      await tx.objectStore('video_projects').put({ id: root.rootId, savedValue: 'unsaved' });
      await deferCheckpointInTransaction(tx, root, 1000);
    })
  ).rejects.toThrow();
  expect(fixture.rows.get('video_projects')!.has(root.rootId)).toBe(false);
  expect(fixture.rows.get('sync_capture')!.size).toBe(1);
  failure = false;
  expect(await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000))).not.toBeNull();
});

it('does not recreate a consumed or deleted pending revision on retry', async () => {
  const previous = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  if (!previous) throw new Error('Expected pending checkpoint.');
  expect(await transaction((tx) => consumeCheckpointInTransaction(tx, previous))).toBe(true);
  expect(await transaction((tx) => consumeCheckpointInTransaction(tx, previous))).toBe(false);
  const replacement = await transaction((tx) => deferCheckpointInTransaction(tx, root, 2000));
  expect(replacement?.createdAt).toBe(2000);
  expect(replacement?.revision).not.toBe(previous.revision);
  expect(await transaction((tx) => consumeCheckpointInTransaction(tx, previous))).toBe(false);
  expect(await transaction((tx) => readCheckpointInTransaction(tx, scope, root))).toEqual(
    replacement
  );
});

it('does not mark pending work when capture is disabled', async () => {
  fixture.rows.get('sync_capture')!.set('profile', { ...profile, enabled: false });
  expect(await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000))).toBeNull();
  expect(fixture.rows.get('sync_capture')!.size).toBe(1);
});

it.each([0, 60000, 300000, 900000, 1800000, 3600000])(
  'uses the admitted device interval %s without changing the first deadline',
  async (checkpointIntervalMs) => {
    const stored = parseSyncCaptureRecord({ ...profile, checkpointIntervalMs });
    if (!stored || stored.kind !== 'profile') throw new Error('Expected admitted profile.');
    fixture.rows.get('sync_capture')!.set('profile', stored);
    const first = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
    const next = await transaction((tx) => deferCheckpointInTransaction(tx, root, 2000));
    expect(first?.dueAt).toBe(1000 + checkpointIntervalMs);
    expect(next?.dueAt).toBe(first?.dueAt);
  }
);

it.each([-1, 1, 120000, Number.NaN, '300000', null])(
  'refuses unsupported persisted checkpoint interval %s',
  (checkpointIntervalMs) => {
    expect(parseSyncCaptureRecord({ ...profile, checkpointIntervalMs })).toBeNull();
  }
);

it('refuses malformed pending authority without changing native or pending data', async () => {
  const pending = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  if (!pending) throw new Error('Expected pending checkpoint.');
  fixture.rows.get('sync_capture')!.set(pending.key, { ...pending, revision: 'invalid' });
  const before = structuredClone(fixture.rows);
  await expect(transaction((tx) => deferCheckpointInTransaction(tx, root, 2000))).rejects.toThrow();
  expect(fixture.rows).toEqual(before);
});

it('issues a receipt only for a pending revision minted by this capture transaction', async () => {
  const first = await transaction((tx) =>
    captureCheckpointReceiptInTransaction(tx, root, () =>
      deferCheckpointInTransaction(tx, root, 1000)
    )
  );
  const row = await transaction((tx) => readCheckpointInTransaction(tx, scope, root));
  expect(first).toEqual({ ...root, revision: row?.revision });
  expect(
    await transaction((tx) =>
      captureCheckpointReceiptInTransaction(tx, root, async () => undefined)
    )
  ).toBeNull();
  const second = await transaction((tx) =>
    captureCheckpointReceiptInTransaction(tx, root, () =>
      deferCheckpointInTransaction(tx, root, 2000)
    )
  );
  expect(second).not.toEqual(first);
  expect(second?.rootId).toBe(root.rootId);
});
it('does not issue a receipt for an immutable capture that consumes pending work', async () => {
  const row = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  if (!row) throw new Error('Pending checkpoint missing');
  expect(
    await transaction((tx) =>
      captureCheckpointReceiptInTransaction(tx, root, () => consumeCheckpointInTransaction(tx, row))
    )
  ).toBeNull();
});
it('does not issue an accepted receipt when the capture transaction aborts', async () => {
  const before = structuredClone(fixture.rows);
  await expect(
    transaction((tx) =>
      captureCheckpointReceiptInTransaction(tx, root, async () => {
        await deferCheckpointInTransaction(tx, root, 1000);
        throw new Error('Capture failed');
      })
    )
  ).rejects.toThrow('Capture failed');
  expect(fixture.rows).toEqual(before);
});
it('runs an unconfigured local capture without issuing a sync receipt', async () => {
  fixture.rows.get('sync_capture')!.clear();
  const operation = vi.fn(async () => undefined);
  expect(
    await transaction((tx) => captureCheckpointReceiptInTransaction(tx, root, operation))
  ).toBeNull();
  expect(operation).toHaveBeenCalledOnce();
});

it('defaults a legacy profile to five minutes without changing persisted bytes', async () => {
  const raw = structuredClone(fixture.rows.get('sync_capture')!.get('profile'));
  expect(parseSyncCaptureRecord(raw)).toEqual({ ...profile, checkpointIntervalMs: 300000 });
  expect(fixture.rows.get('sync_capture')!.get('profile')).toEqual(raw);
  const pending = await transaction((tx) => deferCheckpointInTransaction(tx, root, 1000));
  expect(pending?.dueAt).toBe(301000);
  expect(fixture.rows.get('sync_capture')!.get('profile')).toEqual(raw);
});
