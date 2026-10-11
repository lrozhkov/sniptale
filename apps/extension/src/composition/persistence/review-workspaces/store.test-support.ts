import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';
import { materializeWorkspaceStorage } from './storage-format';

/** Intentional legacy/corrupt fixture replacement clears only that fixture's physical rows. */
export function replaceLegacyWorkspaceFixture(
  rows: Map<string, Map<string, unknown>>,
  aggregateId: string,
  value: unknown
): void {
  for (const [key, row] of rows.get('video_workspace_history') ?? []) {
    if (isRecord(row) && row['aggregateId'] === aggregateId)
      rows.get('video_workspace_history')!.delete(key);
  }
  rows.get('video_workspaces')!.set(aggregateId, value);
}

/** Observe complete logical content and head index keys while retaining physical row assertions. */
export function fixtureWorkspaceValue(
  rows: Map<string, Map<string, unknown>>,
  aggregateId: string
): unknown {
  return materializeWorkspaceStorage(
    rows.get('video_workspaces')!.get(aggregateId),
    [...(rows.get('video_workspace_history')?.values() ?? [])].filter(
      (row) => isRecord(row) && row['aggregateId'] === aggregateId
    )
  );
}

/** Shared transactional fixture retains commit/abort and quota behavior. */
export function createReviewWorkspaceStoreFixture(failure: () => boolean) {
  const id = 'recording:beta-v1-recording';
  const rows: Map<string, Map<string, unknown>> = new Map([
    ['media_library', new Map([[id, betaV1Fixture.records.media_library[0]]])],
    ['recordings', new Map([['beta-v1-recording', betaV1Fixture.records.recordings[0]]])],
    ['project_assets', new Map()],
    ['project_exports', new Map()],
    ['video_workspaces', new Map()],
    ['video_workspace_history', new Map()],
    ['video_workspace_drafts', new Map()],
  ]);
  const database = {
    transaction: (stores: string[], mode: string) => {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          if (!stores.includes(name)) throw new Error('Store outside transaction scope');
          const store = pending.get(name)!;
          const keyOf = (key: IDBValidKey) => (typeof key === 'string' ? key : JSON.stringify(key));
          const ownRows = (key: IDBValidKey) =>
            [...store].filter(([, value]) => isRecord(value) && value['aggregateId'] === key);
          return {
            get: async (key: IDBValidKey) => structuredClone(store.get(keyOf(key))),
            getAll: async () => structuredClone([...store.values()]),
            index: (indexName: string) => {
              if (indexName !== 'aggregateId') throw new Error('Unexpected test index');
              return {
                getAll: async (key: IDBValidKey) =>
                  structuredClone(ownRows(key).map(([, value]) => value)),
                getAllKeys: async (key: IDBValidKey) =>
                  ownRows(key).map(([encoded]) => {
                    const parsed: unknown = JSON.parse(encoded);
                    if (
                      !Array.isArray(parsed) ||
                      typeof parsed[0] !== 'string' ||
                      typeof parsed[1] !== 'number'
                    )
                      throw new Error('Invalid fixture compound key');
                    return [parsed[0], parsed[1]];
                  }),
              };
            },
            put: async (value: unknown) => {
              if (failure()) throw new DOMException('No space', 'QuotaExceededError');
              if (!isRecord(value)) throw new Error('Invalid fixture row');
              const key =
                name === 'video_workspace_history'
                  ? JSON.stringify([value['aggregateId'], value['ordinal']])
                  : (value['aggregateId'] ?? value['id']);
              if (typeof key !== 'string' || !key) throw new Error('Missing test row identity');
              store.set(key, structuredClone(value));
            },
            delete: async (key: IDBValidKey) => {
              store.delete(keyOf(key));
            },
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') {
            rows.clear();
            for (const [name, values] of pending) rows.set(name, values);
          }
          return Promise.resolve();
        },
      };
    },
  };
  return { rows, database };
}
