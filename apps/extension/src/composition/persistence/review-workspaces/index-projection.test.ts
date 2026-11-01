import { expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { workspace } from './backup-restore.test-support';
import { workspaceStorageHead, workspaceStorageRows } from './storage-format';
import { createWorkspaceIndexMutation, projectWorkspaceReferenceKeys } from './index-projection';
import {
  ROW_REFERENCE_FIELD,
  UNKNOWN_HISTORY_REFERENCES,
  stripRowReferenceMetadata,
} from '../infrastructure/indexed-db/row-index-contract';

it('includes both archived aggregate and source identities in scoped workspace admission', () => {
  const value = { ...workspace, aggregateId: 'archived-copy', sourceMediaId: 'original' };
  const head = workspaceStorageHead(value, ['forged-summary']);
  expect(projectWorkspaceReferenceKeys(head, workspaceStorageRows(value))).toEqual([
    'media:archived-copy',
    'media:original',
  ]);
  expect(projectWorkspaceReferenceKeys(head, [])).toEqual([UNKNOWN_HISTORY_REFERENCES]);
});

function fixtureRowKey(value: unknown): string {
  if (!isRecord(value) || typeof value['aggregateId'] !== 'string')
    throw new Error('Invalid fixture');
  return 'ordinal' in value
    ? JSON.stringify([value['aggregateId'], value['ordinal']])
    : value['aggregateId'];
}

interface FixtureCursor {
  readonly value: unknown;
  update(value: unknown): Promise<unknown>;
  continue(): Promise<FixtureCursor | null>;
}

function workspaceFixture() {
  const tables = new Map<string, Map<string, unknown>>();
  const rows = (name: string) => {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  };
  const readHistory = vi.fn(async (name: string, id: IDBValidKey) =>
    [...rows(name).values()].filter((row) => isRecord(row) && row['aggregateId'] === id)
  );
  const put = vi.fn(async (name: string, value: unknown) => {
    const key = fixtureRowKey(value);
    rows(name).set(key, value);
    return key;
  });
  const add = async (name: string, value: unknown) => {
    if (rows(name).has(fixtureRowKey(value))) throw new Error('ConstraintError');
    return put(name, value);
  };
  const cursor = (name: string, keys: string[], offset: number): FixtureCursor | null => {
    const key = keys[offset];
    if (key === undefined) return null;
    return {
      value: rows(name).get(key),
      update: async (value: unknown) => rows(name).set(key, value),
      continue: async () => cursor(name, keys, offset + 1),
    };
  };
  const objectStore = (name: string) => ({
    get: async (key: IDBValidKey) => rows(name).get(String(key)),
    put: async (value: unknown) => put(name, value),
    add: async (value: unknown) => add(name, value),
    delete: async (key: IDBValidKey | IDBKeyRange) => {
      rows(name).delete(typeof key === 'string' ? key : JSON.stringify(key));
    },
    clear: async () => rows(name).clear(),
    index: (_index: string) => ({ getAll: async (id: IDBValidKey) => readHistory(name, id) }),
    openCursor: async () => cursor(name, [...rows(name).keys()], 0),
  });
  return {
    rows,
    readHistory,
    put,
    tx: { objectStore },
    mutation: createWorkspaceIndexMutation({ objectStore }),
  };
}

const review = { ...workspace, aggregateId: 'review', sourceMediaId: 'original' };
const history = workspaceStorageRows(review);
const head = workspaceStorageHead(review, ['forged-summary']);

async function admitWorkspace(fixture: ReturnType<typeof workspaceFixture>) {
  for (const row of history) await fixture.mutation.put('video_workspace_history', row, 'put');
  await fixture.mutation.put('video_workspaces', head, 'put');
}

function expectHistoryMarkers(fixture: ReturnType<typeof workspaceFixture>, markers: string[]) {
  expect([...fixture.rows('video_workspace_history').values()]).toEqual(
    history.map((row) => ({ ...row, [ROW_REFERENCE_FIELD]: markers }))
  );
}

it('blocks orphan and late history claims until the parent snapshot is admitted', async () => {
  const fixture = workspaceFixture();
  for (const row of history) await fixture.mutation.put('video_workspace_history', row, 'put');
  expectHistoryMarkers(fixture, [UNKNOWN_HISTORY_REFERENCES]);
  await fixture.mutation.put('video_workspaces', head, 'put');
  expectHistoryMarkers(fixture, []);
  await fixture.mutation.put('video_workspace_history', history[0], 'put');
  expect([...fixture.rows('video_workspace_history').values()]).toContainEqual({
    ...history[0],
    [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES],
  });
  await fixture.mutation.put('video_workspaces', head, 'put');
  await fixture.mutation.delete('video_workspaces', 'review');
  expectHistoryMarkers(fixture, [UNKNOWN_HISTORY_REFERENCES]);
  expect(
    [...fixture.rows('video_workspace_history').values()].map(stripRowReferenceMetadata)
  ).toEqual(history);
});

it('keeps malformed, incomplete, and cross-aggregate history conservative despite imported summaries', () => {
  expect(projectWorkspaceReferenceKeys(null, history)).toEqual([UNKNOWN_HISTORY_REFERENCES]);
  expect(
    projectWorkspaceReferenceKeys(head, [{ ...history[0], aggregateId: 'other' }, history[1]])
  ).toEqual([UNKNOWN_HISTORY_REFERENCES]);
  expect(projectWorkspaceReferenceKeys({ ...head, historyLength: 0 }, history)).toEqual([
    UNKNOWN_HISTORY_REFERENCES,
  ]);
  const decoratedHead = { ...head, [ROW_REFERENCE_FIELD]: ['media:forged'] };
  const decoratedRows = history.map((row) => ({ ...row, [ROW_REFERENCE_FIELD]: ['media:forged'] }));
  expect(projectWorkspaceReferenceKeys(decoratedHead, decoratedRows)).toEqual([
    'media:review',
    'media:original',
  ]);
});

it('invalidates the retained head before deleting history and admits a replacement only when complete', async () => {
  const fixture = workspaceFixture();
  await admitWorkspace(fixture);
  await fixture.mutation.delete('video_workspace_history', ['review', 0]);
  expect(fixture.rows('video_workspaces').get('review')).toEqual({
    ...head,
    [ROW_REFERENCE_FIELD]: [UNKNOWN_HISTORY_REFERENCES],
  });
  await fixture.mutation.put('video_workspaces', head, 'put');
  expect(fixture.rows('video_workspaces').get('review')).toHaveProperty(ROW_REFERENCE_FIELD, [
    UNKNOWN_HISTORY_REFERENCES,
  ]);
  await fixture.mutation.put('video_workspace_history', history[0], 'put');
  await fixture.mutation.put('video_workspaces', head, 'put');
  expect(fixture.rows('video_workspaces').get('review')).toHaveProperty(ROW_REFERENCE_FIELD, [
    'media:review',
    'media:original',
  ]);
});

it.each(['video_workspaces', 'video_workspace_history'])(
  'marks retained evidence unknown when clearing %s',
  async (store) => {
    const fixture = workspaceFixture();
    await admitWorkspace(fixture);
    await fixture.mutation.clear(store);
    expect(fixture.rows(store).size).toBe(0);
    const retained = store === 'video_workspaces' ? 'video_workspace_history' : 'video_workspaces';
    for (const row of fixture.rows(retained).values()) {
      expect(row).toHaveProperty(ROW_REFERENCE_FIELD, [UNKNOWN_HISTORY_REFERENCES]);
    }
  }
);

it('preserves native add uniqueness for history and heads', async () => {
  const fixture = workspaceFixture();
  for (const row of history) await fixture.mutation.put('video_workspace_history', row, 'add');
  await fixture.mutation.put('video_workspaces', head, 'add');
  await expect(fixture.mutation.put('video_workspaces', head, 'add')).rejects.toThrow(
    'ConstraintError'
  );
  await expect(fixture.mutation.put('video_workspace_history', history[0], 'add')).rejects.toThrow(
    'ConstraintError'
  );
  expectHistoryMarkers(fixture, []);
});

it('does not publish a head when scoped history cannot be read and permits a fresh retry', async () => {
  const fixture = workspaceFixture();
  for (const row of history) await fixture.mutation.put('video_workspace_history', row, 'put');
  fixture.readHistory.mockRejectedValueOnce(new Error('ReadError'));
  await expect(fixture.mutation.put('video_workspaces', head, 'put')).rejects.toThrow('ReadError');
  expect(fixture.rows('video_workspaces').size).toBe(0);
  expectHistoryMarkers(fixture, [UNKNOWN_HISTORY_REFERENCES]);
  await fixture.mutation.put('video_workspaces', head, 'put');
  expectHistoryMarkers(fixture, []);
});

it('refuses ambiguous deletion keys before removing retained evidence', async () => {
  const fixture = workspaceFixture();
  await admitWorkspace(fixture);
  await expect(fixture.mutation.delete('video_workspace_history', 'review')).rejects.toThrow(
    'aggregate identity'
  );
  await expect(fixture.mutation.delete('video_workspaces', ['review', 0])).rejects.toThrow(
    'aggregate identity'
  );
  expect(fixture.rows('video_workspaces').size).toBe(1);
  expectHistoryMarkers(fixture, []);
});

it('clears admitted history markers after recovery in a later transaction', async () => {
  const fixture = workspaceFixture();
  for (const row of history) await fixture.mutation.put('video_workspace_history', row, 'put');
  expectHistoryMarkers(fixture, [UNKNOWN_HISTORY_REFERENCES]);
  const recovered = createWorkspaceIndexMutation(fixture.tx);
  await recovered.put('video_workspaces', head, 'put');
  expectHistoryMarkers(fixture, []);
  fixture.put.mockClear();
  await createWorkspaceIndexMutation(fixture.tx).put('video_workspaces', head, 'put');
  expect(fixture.put.mock.calls.map(([store]) => store)).toEqual(['video_workspaces']);
});
