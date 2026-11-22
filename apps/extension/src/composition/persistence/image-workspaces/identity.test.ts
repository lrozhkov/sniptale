import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { IMAGE_WORKSPACE_IDENTITIES_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  createImageWorkspaceIdentity,
  readImageWorkspaceIdentity,
  restoreImageWorkspaceIdentity,
  retireImageWorkspaceIdentity,
} from './identity';

let db: IDBPDatabase;
let name: string;
beforeEach(async () => {
  name = `image-identity-${crypto.randomUUID()}`;
  db = await openDB(name, 1, {
    upgrade(database) {
      database.createObjectStore(IMAGE_WORKSPACE_IDENTITIES_STORE, { keyPath: 'aggregateId' });
    },
  });
});
afterEach(async () => {
  db.close();
  await deleteDB(name);
});

it('keeps legacy absence read-only and persists one live generation with its native transaction', async () => {
  const read = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
  expect(await readImageWorkspaceIdentity(read, 'image')).toBeNull();
  await read.done;
  expect(await db.count(IMAGE_WORKSPACE_IDENTITIES_STORE)).toBe(0);
  const write = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  const generation = await createImageWorkspaceIdentity(write, 'image');
  await write.done;
  const tx = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
  expect(await readImageWorkspaceIdentity(tx, 'image')).toEqual({
    version: 1,
    aggregateId: 'image',
    generation,
    retired: false,
  });
  await tx.done;
});

it('fences retirement before the first editor save and admits only explicit restoration of that identity', async () => {
  const retire = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  await retireImageWorkspaceIdentity(retire, 'image');
  await retire.done;
  const snapshot = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
  const previous = await readImageWorkspaceIdentity(snapshot, 'image');
  await snapshot.done;
  const refused = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  await expect(createImageWorkspaceIdentity(refused, 'image')).rejects.toThrow('already exists');
  await refused.done;
  expect(await db.get(IMAGE_WORKSPACE_IDENTITIES_STORE, 'image')).toEqual(previous);
  const restore = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  const generation = await restoreImageWorkspaceIdentity(restore, 'image');
  await restore.done;
  const tx = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
  const current = await readImageWorkspaceIdentity(tx, 'image');
  await tx.done;
  expect(current).toMatchObject({ generation, retired: false });
  expect(current?.generation).not.toBe(previous?.generation);
});

it('retains the same tombstone on repeated deletion and rolls back an aborted lifetime change', async () => {
  const tx = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  await createImageWorkspaceIdentity(tx, 'image');
  await retireImageWorkspaceIdentity(tx, 'image');
  const before = await readImageWorkspaceIdentity(tx, 'image');
  await retireImageWorkspaceIdentity(tx, 'image');
  expect(await readImageWorkspaceIdentity(tx, 'image')).toEqual(before);
  await tx.done;
  const aborted = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readwrite');
  await restoreImageWorkspaceIdentity(aborted, 'image');
  const failure = expect(aborted.done).rejects.toThrow();
  aborted.abort();
  await failure;
  const read = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
  expect(await readImageWorkspaceIdentity(read, 'image')).toEqual(before);
  await read.done;
});

it.each([{}, { version: 2 }, { generation: '' }, { retired: 'yes' }, { extra: true }])(
  'refuses malformed native lifetime evidence without repair: %j',
  async (patch) => {
    const value = {
      version: 1,
      aggregateId: 'image',
      generation: 'generation',
      retired: false,
      ...patch,
    };
    const invalid = Object.keys(patch).length ? value : { aggregateId: 'image' };
    await db.put(IMAGE_WORKSPACE_IDENTITIES_STORE, invalid);
    const read = db.transaction(IMAGE_WORKSPACE_IDENTITIES_STORE, 'readonly');
    await expect(readImageWorkspaceIdentity(read, 'image')).rejects.toThrow('evidence is invalid');
    await read.done;
  }
);
