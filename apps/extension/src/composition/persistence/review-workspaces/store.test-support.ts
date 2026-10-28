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

function compareFixturePrimaryKey(left: string, right: IDBValidKey): number {
  if (typeof right === 'string') return left < right ? -1 : left > right ? 1 : 0;
  return typeof right === 'number' || right instanceof Date ? 1 : -1;
}

function fixturePrimaryKeys(
  store: Map<string, unknown>,
  query?: IDBValidKey | IDBKeyRange,
  count?: number
): IDBValidKey[] {
  const keys = [...store.keys()].sort();
  const selected = keys.filter((key) => {
    if (query === undefined) return true;
    if (typeof query === 'object' && query !== null && 'lower' in query) {
      const lower = query.lower;
      const upper = query.upper;
      const low = lower === undefined ? 1 : compareFixturePrimaryKey(key, lower);
      const high = upper === undefined ? -1 : compareFixturePrimaryKey(key, upper);
      return (
        (low > 0 || (low === 0 && !query.lowerOpen)) &&
        (high < 0 || (high === 0 && !query.upperOpen))
      );
    }
    return compareFixturePrimaryKey(key, query) === 0;
  });
  return structuredClone(selected.slice(0, count ?? selected.length));
}

/** Shared transactional fixture retains commit/abort and quota behavior. */
export function createReviewWorkspaceStoreFixture(failure: (storeName?: string) => boolean) {
  const id = 'recording:beta-v1-recording';
  const rows: Map<string, Map<string, unknown>> = new Map([
    ['media_library', new Map([[id, betaV1Fixture.records.media_library[0]]])],
    ['recordings', new Map([['beta-v1-recording', betaV1Fixture.records.recordings[0]]])],
    ['project_assets', new Map()],
    ['project_exports', new Map()],
    ...[
      'video_projects',
      'recording_telemetry',
      'recording_recovery_sessions',
      'recording_recovery_blocks',
      'scenario_assets',
      'image_workspaces',
      'aggregate_presentations',
      'thumbnails',
      'asset_owners',
      'asset_refs',
      'asset_operations',
      'sync_capture',
      'sync_outbox',
      'sync_connection',
      'video_project_revisions',
    ].map((name): [string, Map<string, unknown>] => [name, new Map()]),
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
          const ownRows = (key: IDBValidKey, indexName = 'aggregateId') =>
            [...store].filter(([, value]) => isRecord(value) && value[indexName] === key);
          const write = async (value: unknown, add: boolean) => {
            if (failure(name)) throw new DOMException('No space', 'QuotaExceededError');
            if (!isRecord(value)) throw new Error('Invalid fixture row');
            const key =
              name === 'sync_capture' || name === 'sync_outbox' || name === 'sync_connection'
                ? value['key']
                : name === 'video_project_revisions'
                  ? value['projectId']
                  : name === 'video_workspace_history'
                    ? JSON.stringify([value['aggregateId'], value['ordinal']])
                    : name === 'recording_telemetry'
                      ? value['recordingId']
                      : name === 'asset_owners'
                        ? JSON.stringify([value['ownerKind'], value['ownerId'], value['role']])
                        : (value['aggregateId'] ??
                          value['id'] ??
                          value['operationId'] ??
                          value['assetId']);
            if (typeof key !== 'string' || !key) throw new Error('Missing test row identity');
            if (add && store.has(key))
              throw new DOMException('Duplicate fixture row', 'ConstraintError');
            store.set(key, structuredClone(value));
          };
          return {
            get: async (key: IDBValidKey) => structuredClone(store.get(keyOf(key))),
            getAll: async () => structuredClone([...store.values()]),
            getAllKeys: async (query?: IDBValidKey | IDBKeyRange, count?: number) =>
              fixturePrimaryKeys(store, query, count),
            count: async () => store.size,
            index: (indexName: string) => {
              if (
                indexName !== 'aggregateId' &&
                indexName !== 'assetId' &&
                indexName !== 'kind' &&
                indexName !== 'rootKey' &&
                indexName !== 'projectId' &&
                indexName !== 'id'
              )
                throw new Error('Unexpected test index');
              return {
                count: async (key: IDBValidKey) => ownRows(key, indexName).length,
                getAll: async (key: IDBValidKey) =>
                  structuredClone(ownRows(key, indexName).map(([, value]) => value)),
                getAllKeys: async (key: IDBValidKey, count?: number) =>
                  ownRows(key, indexName)
                    .slice(0, count)
                    .map(([encoded]) => {
                      if (name === 'sync_capture') return encoded;
                      const parsed: unknown = JSON.parse(encoded);
                      if (
                        !Array.isArray(parsed) ||
                        !parsed.length ||
                        !parsed.every(
                          (part: unknown) =>
                            typeof part === 'string' ||
                            (typeof part === 'number' && Number.isFinite(part))
                        )
                      )
                        throw new Error('Invalid fixture compound key');
                      return parsed.filter(
                        (part: unknown): part is string | number =>
                          typeof part === 'string' || typeof part === 'number'
                      );
                    }),
              };
            },
            put: async (value: unknown) => write(value, false),
            add: async (value: unknown) => write(value, true),
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
