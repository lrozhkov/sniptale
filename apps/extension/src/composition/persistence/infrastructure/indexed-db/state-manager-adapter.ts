import { initDB } from './core';
import { STATE_MANAGER_STORE } from './core.stores.ts';
import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../mutation-barrier';
import type { StateDomainAdapter } from '@sniptale/platform/data/state-manager/types';

type StateManagerIndexedDb = {
  delete(storeName: string, key: [string, string]): Promise<unknown>;
  get(storeName: string, key: [string, string]): Promise<unknown>;
  getAllFromIndex(storeName: string, indexName: string, query: string): Promise<unknown>;
  put(storeName: string, value: StateManagerIndexedDbRecord): Promise<unknown>;
};

type StateManagerIndexedDbRecord = {
  domain: string;
  key: string;
  updatedAtEpochMs: number;
  value: unknown;
};

type InitDb = (permit?: PersistenceMutationPermit) => Promise<StateManagerIndexedDb>;

function createRecord(domain: string, key: string, value: unknown): StateManagerIndexedDbRecord {
  return {
    domain,
    key,
    updatedAtEpochMs: Date.now(),
    value,
  };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseIndexedDbRecord(value: unknown): StateManagerIndexedDbRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const domain = record['domain'];
  const key = record['key'];
  const updatedAtEpochMs = record['updatedAtEpochMs'];
  if (
    typeof domain !== 'string' ||
    typeof key !== 'string' ||
    typeof updatedAtEpochMs !== 'number' ||
    !Number.isFinite(updatedAtEpochMs) ||
    !hasOwn(record, 'value')
  ) {
    return null;
  }

  return {
    domain,
    key,
    updatedAtEpochMs,
    value: record['value'],
  };
}

async function readDomainRecords(
  db: StateManagerIndexedDb,
  domain: string
): Promise<StateManagerIndexedDbRecord[]> {
  const records = await db.getAllFromIndex(STATE_MANAGER_STORE, 'domain', domain);

  if (!Array.isArray(records)) {
    return [];
  }

  return records.flatMap((record) => {
    const parsed = parseIndexedDbRecord(record);
    return parsed?.domain === domain ? [parsed] : [];
  });
}

async function deleteDomainRecords(db: StateManagerIndexedDb, domain: string): Promise<void> {
  const records = await readDomainRecords(db, domain);
  await Promise.all(records.map((record) => db.delete(STATE_MANAGER_STORE, [domain, record.key])));
}

async function writeDomainRecords(
  db: StateManagerIndexedDb,
  domain: string,
  values: Readonly<Record<string, unknown>>
): Promise<void> {
  await Promise.all(
    Object.entries(values).map(([key, value]) =>
      db.put(STATE_MANAGER_STORE, createRecord(domain, key, value))
    )
  );
}

function createAdapter(domain: string, getDb: InitDb): StateDomainAdapter {
  return {
    async clear() {
      await runWithPersistenceMutationPermit(async (permit) =>
        deleteDomainRecords(await getDb(permit), domain)
      );
    },
    async hydrate() {
      const records = await readDomainRecords(await getDb(), domain);
      return Object.fromEntries(records.map((record) => [record.key, record.value]));
    },
    async read(key) {
      const record = parseIndexedDbRecord(
        await (await getDb()).get(STATE_MANAGER_STORE, [domain, key])
      );
      if (record?.domain !== domain || record.key !== key) {
        return undefined;
      }
      return record?.value;
    },
    async remove(key) {
      await runWithPersistenceMutationPermit(async (permit) =>
        (await getDb(permit)).delete(STATE_MANAGER_STORE, [domain, key])
      );
    },
    async removeMany(keys) {
      await runWithPersistenceMutationPermit(async (permit) => {
        const db = await getDb(permit);
        await Promise.all(keys.map((key) => db.delete(STATE_MANAGER_STORE, [domain, key])));
      });
    },
    async write(key, value) {
      await runWithPersistenceMutationPermit(async (permit) =>
        (await getDb(permit)).put(STATE_MANAGER_STORE, createRecord(domain, key, value))
      );
    },
    async writeMany(values) {
      await runWithPersistenceMutationPermit(async (permit) => {
        await writeDomainRecords(await getDb(permit), domain, values);
      });
    },
  };
}

export function createIndexedDbStateDomainAdapter(
  domain: string,
  initDatabase?: InitDb
): StateDomainAdapter {
  return createAdapter(domain, initDatabase ?? initDB);
}
