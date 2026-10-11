import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  SCENARIO_PROJECTS_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { ScenarioProjectEntry } from './contracts';
import { parseScenarioProjectEntry } from './read-guards';
import {
  materializeScenarioStorage,
  scenarioStorageHead,
  scenarioStorageRows,
} from './storage-format';

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
  const [head, rows] = await Promise.all([
    tx.objectStore(SCENARIO_PROJECTS_STORE).get(id),
    tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE).index('projectId').getAll(id),
  ]);
  const logical = materializeScenarioStorage(head, rows);
  return { head, rows, logical };
}

/** Complete enumeration retains opaque orphan evidence for conservative graph consumers. */
export async function readAllScenarioStorage(tx: {
  objectStore(name: string): { getAll(): Promise<unknown[]> };
}): Promise<unknown[]> {
  const [heads, rows] = await Promise.all([
    tx.objectStore(SCENARIO_PROJECTS_STORE).getAll(),
    tx.objectStore(SCENARIO_PROJECT_HISTORY_STORE).getAll(),
  ]);
  const grouped = new Map<string, unknown[]>();
  const invalid: unknown[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row['projectId'] !== 'string') invalid.push(row);
    else {
      const own = grouped.get(row['projectId']) ?? [];
      own.push(row);
      grouped.set(row['projectId'], own);
    }
  }
  const logical = heads.map((head) => {
    const id = isRecord(head) ? head['id'] : undefined;
    const own = typeof id === 'string' ? (grouped.get(id) ?? []) : [];
    if (typeof id === 'string') grouped.delete(id);
    return materializeScenarioStorage(head, own);
  });
  for (const [id, evidence] of grouped) logical.push({ id, ...opaqueOrphan(evidence) });
  if (invalid.length) logical.push(opaqueOrphan(invalid));
  return logical;
}

function opaqueOrphan(historyEvidence: unknown[]) {
  return { project: { version: 0 }, historyEvidence };
}

function sameStoredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameStoredValue(value, right[index]))
    );
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameStoredValue(left[key], right[key]))
  );
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
  const next = scenarioStorageRows(entry);
  const retained = new Set(next.map((row) => row.revision));
  for (const revision of current.keys())
    if (!retained.has(revision)) await store.delete([entry.id, revision]);
  for (const row of next)
    if (!sameStoredValue(current.get(row.revision), row)) await store.put(row);
  await tx.objectStore(SCENARIO_PROJECTS_STORE).put(scenarioStorageHead(entry));
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
  const tx = db.transaction([SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE], 'readonly');
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
  const tx = db.transaction([SCENARIO_PROJECTS_STORE, SCENARIO_PROJECT_HISTORY_STORE], 'readonly');
  const logical = await readAllScenarioStorage(tx);
  await tx.done;
  return logical;
}
