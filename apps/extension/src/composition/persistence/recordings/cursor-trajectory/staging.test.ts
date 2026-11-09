import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import {
  DB_VERSION,
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
} from '../../infrastructure/indexed-db/core.stores';
import { createRecordingCursorTrajectoryStore } from './store';
import { cursorTrajectoryStagingIdentity, retireJournalCursorTrajectoryStages } from './staging';

let database: IDBPDatabase;
let databaseName: string;
vi.mock('../../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../../infrastructure/indexed-db/core')>()),
  initDB: async () => database,
}));
const source = { recordingId: 'source', trajectoryId: 'a'.repeat(32) };
const geometry = { width: 1280, height: 720 };
beforeEach(async () => {
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  databaseName = `cursor-stage-${crypto.randomUUID()}`;
  database = await openDB(databaseName, DB_VERSION, { upgrade: handleDatabaseUpgrade });
});
afterEach(async () => {
  database.close();
  await deleteDB(databaseName);
  installPersistenceLockManagerForTests(null);
});

it('refuses invalid journal and source identities without creating staged history', async () => {
  expect(() =>
    cursorTrajectoryStagingIdentity('journal', { ...source, recordingId: '../source' })
  ).toThrow();
  expect(() => cursorTrajectoryStagingIdentity('../journal', source)).toThrow();
  await expect(retireJournalCursorTrajectoryStages('../journal')).rejects.toMatchObject({
    code: 'invalid',
  });
  expect(await database.count(HEADS)).toBe(0);
});

it('requires the stored journal owner even when another stage has the same name prefix', async () => {
  const store = createRecordingCursorTrajectoryStore({
    database: async () => database,
    mintGeneration: () => crypto.randomUUID(),
  });
  const ownedIdentity = cursorTrajectoryStagingIdentity('journal', source);
  const unownedIdentity = { ...ownedIdentity, trajectoryId: 'b'.repeat(32) };
  const owned = await store.begin(ownedIdentity, geometry, source.recordingId, 'journal');
  const unowned = await store.begin(unownedIdentity, geometry, source.recordingId, 'other-journal');
  await retireJournalCursorTrajectoryStages('journal');
  expect(await store.getHead(owned)).toBeNull();
  expect(await database.get(HEADS, [owned.recordingId, owned.trajectoryId])).toMatchObject({
    retired: true,
  });
  expect(await store.getHead(unowned)).toMatchObject({
    retired: false,
    writerGeneration: unowned.writerGeneration,
  });
  await retireJournalCursorTrajectoryStages('journal');
  expect(await store.getHead(unowned)).toMatchObject({ retired: false });
});

it('aborts all journal cleanup on a malformed head and retries after the head is repaired', async () => {
  const store = createRecordingCursorTrajectoryStore({
    database: async () => database,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = cursorTrajectoryStagingIdentity('journal', source);
  const first = await store.begin(identity, geometry, source.recordingId, 'journal');
  const second = await store.begin(
    { ...identity, trajectoryId: 'b'.repeat(32) },
    geometry,
    source.recordingId,
    'journal'
  );
  const head = await store.getHead(second);
  await database.put(HEADS, { ...head, width: -1 });
  await expect(retireJournalCursorTrajectoryStages('journal')).rejects.toMatchObject({
    code: 'integrity',
  });
  expect(await store.getHead(first)).toMatchObject({ retired: false });
  await database.put(HEADS, head);
  await retireJournalCursorTrajectoryStages('journal');
  expect(await store.getHead(first)).toBeNull();
  expect(await database.get(HEADS, [first.recordingId, first.trajectoryId])).toMatchObject({
    retired: true,
  });
  expect(await store.getHead(second)).toBeNull();
  expect(await database.get(HEADS, [second.recordingId, second.trajectoryId])).toMatchObject({
    retired: true,
  });
});
