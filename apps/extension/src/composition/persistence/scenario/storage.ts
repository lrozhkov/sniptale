import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { ScenarioProjectEntry } from './contracts';
import { parseScenarioProjectEntry } from './read-guards';
import {
  encodeScenarioUnitStorage,
  materializeScenarioUnitStorage,
  sameScenarioStoredValue,
} from './storage-units';

interface ScenarioStorageReadTransaction {
  objectStore(name: string): {
    get(key: IDBValidKey): Promise<unknown>;
    getAll(): Promise<unknown[]>;
    index(name: string): { getAll(key: IDBValidKey): Promise<unknown[]> };
  };
}

interface ScenarioStorageWriteTransaction extends ScenarioStorageReadTransaction {
  objectStore(name: string): Omit<
    ReturnType<ScenarioStorageReadTransaction['objectStore']>,
    'index'
  > & {
    put(value: unknown): Promise<unknown>;
    delete(key: IDBValidKey): Promise<unknown>;
    index(name: string): {
      getAll(key: IDBValidKey): Promise<unknown[]>;
      getAllKeys(key: IDBValidKey): Promise<IDBValidKey[]>;
    };
  };
}

/** Physical evidence and logical projection come from the caller's one native snapshot. */
export async function readScenarioStorage(tx: ScenarioStorageReadTransaction, id: string) {
  const [head, rows, units] = await Promise.all([
    tx.objectStore(SCENARIO_PROJECTS_STORE).get(id),
    tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE).index('projectId').getAll(id),
    tx.objectStore(SCENARIO_PROJECT_UNITS_STORE).index('projectId').getAll(id),
  ]);
  const logical = materializeScenarioUnitStorage(head, rows, units);
  return { head, rows, units, logical };
}

/** Complete enumeration retains opaque orphan evidence for conservative graph consumers. */
export async function readAllScenarioStorage(tx: {
  objectStore(name: string): { getAll(): Promise<unknown[]> };
}): Promise<unknown[]> {
  const [heads, rows, units] = await Promise.all([
    tx.objectStore(SCENARIO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE).getAll(),
    tx.objectStore(SCENARIO_PROJECT_UNITS_STORE).getAll(),
  ]);
  const grouped = new Map<string, unknown[]>();
  const groupedUnits = new Map<string, unknown[]>();
  const invalid: unknown[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row['projectId'] !== 'string') invalid.push(row);
    else {
      const own = grouped.get(row['projectId']) ?? [];
      own.push(row);
      grouped.set(row['projectId'], own);
    }
  }
  for (const row of units) {
    if (!isRecord(row) || typeof row['projectId'] !== 'string') invalid.push(row);
    else {
      const own = groupedUnits.get(row['projectId']) ?? [];
      own.push(row);
      groupedUnits.set(row['projectId'], own);
    }
  }
  const logical = heads.map((head) => {
    const id = isRecord(head) ? head['id'] : undefined;
    const own = typeof id === 'string' ? (grouped.get(id) ?? []) : [];
    const ownUnits = typeof id === 'string' ? (groupedUnits.get(id) ?? []) : [];
    if (typeof id === 'string') grouped.delete(id);
    if (typeof id === 'string') groupedUnits.delete(id);
    return materializeScenarioUnitStorage(head, own, ownUnits);
  });
  for (const id of new Set([...grouped.keys(), ...groupedUnits.keys()]))
    logical.push({
      id,
      ...opaqueOrphan(grouped.get(id) ?? []),
      unitEvidence: groupedUnits.get(id) ?? [],
    });
  if (invalid.length) logical.push(opaqueOrphan(invalid));
  return logical;
}

function opaqueOrphan(historyEvidence: unknown[]) {
  return { project: { version: 0 }, historyEvidence };
}

/** Only changed/new historical rows are written; caller owns admission, abort and tx.done. */
export async function writeScenarioStorage(
  tx: ScenarioStorageWriteTransaction,
  args: {
    entry: ScenarioProjectEntry;
    storage: Awaited<ReturnType<typeof readScenarioStorage>>;
    existing: ScenarioProjectEntry | undefined;
  }
): Promise<void> {
  const { entry, storage, existing } = args;
  if (storage.logical !== undefined && (!existing || existing.id !== entry.id))
    throw new Error('Scenario project content is unavailable.');
  const store = tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE);
  const current = new Map<number, unknown>();
  for (const row of storage.rows)
    if (isRecord(row) && typeof row['revision'] === 'number') current.set(row['revision'], row);
  const encoded = encodeScenarioUnitStorage(entry, storage.units);
  const next = encoded.rows;
  const retained = new Set(next.map((row) => row.revision));
  for (const revision of current.keys())
    if (!retained.has(revision)) await store.delete([entry.id, revision]);
  for (const row of next)
    if (!sameScenarioStoredValue(current.get(row.revision), row)) await store.put(row);
  const unitStore = tx.objectStore(SCENARIO_PROJECT_UNITS_STORE);
  const desired = new Map(
    encoded.units.map((row) => [JSON.stringify([row.unitId, row.revision]), row])
  );
  for (const raw of storage.units) {
    if (!isRecord(raw)) throw new Error('Scenario unit content is unavailable.');
    const key = JSON.stringify([raw['unitId'], raw['revision']]);
    const retained = desired.get(key);
    if (!retained)
      await unitStore.delete([entry.id, String(raw['unitId']), Number(raw['revision'])]);
    else if (sameScenarioStoredValue(raw, retained)) desired.delete(key);
  }
  for (const row of desired.values()) await unitStore.put(row);
  await tx.objectStore(SCENARIO_PROJECTS_STORE).put(encoded.head);
}

/** Concrete logical participant for lifecycle, deletion and portable archive owners. */
export function createScenarioProjectStore(tx: ScenarioStorageWriteTransaction) {
  return {
    async get(key: IDBValidKey): Promise<unknown> {
      if (typeof key !== 'string') throw new Error('Invalid scenario project key.');
      return (await readScenarioStorage(tx, key)).logical;
    },
    getAll: () => readAllScenarioStorage(tx),
    async put(value: unknown): Promise<void> {
      const entry = parseScenarioProjectEntry(value);
      if (!entry || !isRecord(value)) throw new Error('Invalid scenario project replacement.');
      const stored = await readScenarioStorage(tx, entry.id);
      const existing = parseScenarioProjectEntry(stored.logical) ?? undefined;
      await writeScenarioStorage(tx, { entry: { ...value, ...entry }, storage: stored, existing });
    },
    async delete(key: IDBValidKey): Promise<void> {
      if (typeof key !== 'string') throw new Error('Invalid scenario project key.');
      const stored = await readScenarioStorage(tx, key);
      if (stored.logical !== undefined && !parseScenarioProjectEntry(stored.logical))
        throw new Error('Unavailable scenario project cannot be deleted.');
      const store = tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE);
      for (const rowKey of await store.index('projectId').getAllKeys(key))
        await store.delete(rowKey);
      const units = tx.objectStore(SCENARIO_PROJECT_UNITS_STORE);
      for (const rowKey of await units.index('projectId').getAllKeys(key))
        await units.delete(rowKey);
      await tx.objectStore(SCENARIO_PROJECTS_STORE).delete(key);
    },
  };
}

/** Standalone reads hold head/history in the same readonly transaction, with no repair. */
export async function getScenarioStoredProject(
  db: {
    transaction(
      stores: string[],
      mode: 'readonly'
    ): ScenarioStorageReadTransaction & { done: Promise<void> };
  },
  id: string
): Promise<unknown> {
  const tx = db.transaction(
    [SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE, SCENARIO_PROJECT_UNITS_STORE],
    'readonly'
  );
  const { logical } = await readScenarioStorage(tx, id);
  await tx.done;
  return logical;
}

/** Full graph readers retain both physical stores in one readonly snapshot. */
export async function getAllScenarioStoredProjects(db: {
  transaction(
    stores: string[],
    mode: 'readonly'
  ): {
    objectStore(name: string): { getAll(): Promise<unknown[]> };
    done: Promise<void>;
  };
}): Promise<unknown[]> {
  const tx = db.transaction(
    [SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE, SCENARIO_PROJECT_UNITS_STORE],
    'readonly'
  );
  const logical = await readAllScenarioStorage(tx);
  await tx.done;
  return logical;
}
