import { DB_VERSION } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { betaV21Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v21';
import { betaV23Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v23';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  CURRENT_SCHEMA_CONTRACTS,
  parseStoredSchemaContracts,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts';

const name = 'pcm-speech-admission-fixture';
const contracts = 'schema_contracts';

async function snapshot(db: IDBPDatabase) {
  const stores = Array.from(db.objectStoreNames);
  const tx = db.transaction(stores, 'readonly');
  const rows = await Promise.all(
    stores.map(async (store) => [store, await tx.objectStore(store).getAll()] as const)
  );
  await tx.done;
  return Object.fromEntries(rows);
}

/** Uses an isolated native database and immutable fixture objects, never the user's library. */
export async function probe(sourceVersion: 21 | 23 = 21) {
  const released = sourceVersion === 23 ? betaV23Fixture : betaV21Fixture;
  const root = await navigator.storage.getDirectory();
  const objects = await root.getDirectoryHandle(name, { create: true });
  const originalPut = IDBObjectStore.prototype.put;
  let current: IDBPDatabase | undefined;
  try {
    current = await openDB(name, sourceVersion, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
      },
    });
    const seed = current.transaction(Array.from(current.objectStoreNames), 'readwrite');
    for (const [store, rows] of Object.entries(released.records))
      for (const row of rows) await seed.objectStore(store).put(row);
    for (const [domainId, schemaVersion] of Object.entries(released.domainVersions))
      await seed.objectStore(contracts).put({ domainId, schemaVersion });
    await seed.done;
    for (const object of released.opfsObjects) {
      const stream = await (
        await objects.getFileHandle(object.assetId, { create: true })
      ).createWritable();
      await stream.write(object.text);
      await stream.close();
    }
    const before = await snapshot(current);
    current.close();
    current = undefined;
    let publications = 0;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request =
        key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      if (this.name === contracts && ++publications === 3) {
        const tx = this.transaction;
        request.addEventListener('success', () => tx.abort(), { once: true });
      }
      return request;
    };
    let interruption = '';
    try {
      current = await openDB(name, DB_VERSION, {
        upgrade(db, old, next, tx) {
          handleDatabaseUpgrade(db, old, next, tx);
        },
      });
    } catch (cause) {
      interruption = cause instanceof DOMException ? cause.name : 'unexpected';
    }
    IDBObjectStore.prototype.put = originalPut;
    current?.close();
    current = await openDB(name, sourceVersion);
    const rolledBack =
      current.version === sourceVersion &&
      JSON.stringify(await snapshot(current)) === JSON.stringify(before);
    current.close();
    current = await openDB(name, DB_VERSION, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
      },
    });
    const after = await snapshot(current);
    const retainedRows = Object.entries(before)
      .filter(([store]) => store !== contracts)
      .every(([store, rows]) => JSON.stringify(after[store]) === JSON.stringify(rows));
    const retainedObjects = (
      await Promise.all(
        released.opfsObjects.map(async (object) =>
          (await (await objects.getFileHandle(object.assetId)).getFile()).text()
        )
      )
    ).every((text, index) => text === released.opfsObjects[index]?.text);
    const admitted = parseStoredSchemaContracts(after[contracts]) !== null;
    const expectedContracts = CURRENT_SCHEMA_CONTRACTS.every((expected) =>
      after[contracts]?.some(
        (row: unknown) =>
          row !== null &&
          typeof row === 'object' &&
          'domainId' in row &&
          'schemaVersion' in row &&
          row.domainId === expected.domainId &&
          row.schemaVersion === expected.schemaVersion
      )
    );
    current.close();
    current = undefined;
    let oldWriter = '';
    for (let version = sourceVersion; version < DB_VERSION; version++) {
      try {
        current = await openDB(name, version);
        current.close();
        throw new Error(`Old writer ${version} unexpectedly opened the new schema.`);
      } catch (cause) {
        oldWriter = cause instanceof DOMException ? cause.name : 'unexpected';
        if (oldWriter !== 'VersionError') throw cause;
      }
    }
    current?.close();
    current = await openDB(name, DB_VERSION);
    const reopenedUnchanged = JSON.stringify(await snapshot(current)) === JSON.stringify(after);
    return {
      interruption,
      rolledBack,
      retainedRows,
      retainedObjects,
      admitted,
      expectedContracts,
      oldWriter,
      reopenedUnchanged,
    };
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    current?.close();
    await deleteDB(name);
    await root.removeEntry(name, { recursive: true });
  }
}
