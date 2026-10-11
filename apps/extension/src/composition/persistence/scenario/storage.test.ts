import { afterEach, expect, it, vi } from 'vitest';
import { db, getStore } from './aggregate-mutations.test-support';
import { createGuideProject } from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import { scenarioStorageHead, scenarioStorageRows } from './storage-format';
import { createScenarioProjectStore, readAllScenarioStorage, readScenarioStorage } from './storage';

const names = ['scenario_projects', 'scenario_project_history'];
afterEach(() => vi.restoreAllMocks());

function seed(id = 'guide') {
  const first = createScenarioProjectEntry({
    existing: undefined,
    project: createGuideProject('First', id, 1),
    updatedAt: 2,
  });
  const entry = createScenarioProjectEntry({
    existing: first,
    project: { ...first.project, name: 'Current' },
    updatedAt: 3,
  });
  getStore(names[0]!).set(id, scenarioStorageHead(entry));
  for (const row of scenarioStorageRows(entry))
    getStore(names[1]!).set(JSON.stringify([id, row.revision]), row);
  return entry;
}

it('reads one coherent complete graph and preserves unchanged historical rows on lifecycle writes', async () => {
  const entry = seed();
  const tx = db.transaction(names);
  const stored = await readScenarioStorage(tx, entry.id);
  expect(parseScenarioProjectEntry(stored.logical)).toEqual(entry);
  const before = [...getStore(names[1]!)];
  const puts = vi.spyOn(Map.prototype, 'set');
  await createScenarioProjectStore(tx).put({
    ...entry,
    lifecycle: { ...entry.lifecycle, updatedAt: 4 },
  });
  expect(
    puts.mock.calls.filter((_, i) => puts.mock.contexts[i] === getStore(names[1]!))
  ).toHaveLength(0);
  expect([...getStore(names[1]!)]).toEqual(before);
});

it('enumerates orphan evidence and refuses replacement or deletion without writes', async () => {
  const entry = seed();
  getStore(names[0]!).delete(entry.id);
  const tx = db.transaction(names);
  const before = structuredClone(getStore(names[1]!));
  const logical = await readAllScenarioStorage(tx);
  expect(logical).toHaveLength(1);
  expect(logical[0]).toMatchObject({ id: entry.id, historyEvidence: expect.any(Array) });
  expect(parseScenarioProjectEntry(logical[0])).toBeNull();
  const puts = vi.spyOn(Map.prototype, 'set');
  const deletes = vi.spyOn(Map.prototype, 'delete');
  const store = createScenarioProjectStore(tx);
  await expect(store.put(entry)).rejects.toThrow('unavailable');
  await expect(store.delete(entry.id)).rejects.toThrow('cannot be deleted');
  expect(
    puts.mock.contexts.filter((context) => names.some((name) => context === getStore(name)))
  ).toHaveLength(0);
  expect(
    deletes.mock.contexts.filter((context) => names.some((name) => context === getStore(name)))
  ).toHaveLength(0);
  expect(getStore(names[1]!)).toEqual(before);
});

it('deletes only the admitted aggregate and its owned historical rows', async () => {
  const own = seed();
  const other = seed('other');
  const before = getStore(names[1]!).get(JSON.stringify([other.id, 1]));
  await createScenarioProjectStore(db.transaction(names)).delete(own.id);
  expect(getStore(names[0]!).has(own.id)).toBe(false);
  expect(getStore(names[1]!).has(JSON.stringify([own.id, 1]))).toBe(false);
  expect(getStore(names[1]!).get(JSON.stringify([other.id, 1]))).toBe(before);
  expect(
    parseScenarioProjectEntry(await createScenarioProjectStore(db.transaction(names)).get(other.id))
  ).toEqual(other);
});

it('rejects malformed replacement and keys before any request', async () => {
  const entry = seed();
  const store = createScenarioProjectStore(db.transaction(names));
  const puts = vi.spyOn(Map.prototype, 'set');
  await expect(store.put({ ...entry, project: { version: 99 } })).rejects.toThrow('Invalid');
  await expect(store.get([entry.id])).rejects.toThrow('Invalid');
  await expect(store.delete([entry.id])).rejects.toThrow('Invalid');
  expect(
    puts.mock.contexts.filter((context) => names.some((name) => context === getStore(name)))
  ).toHaveLength(0);
});
