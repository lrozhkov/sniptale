import { projectRowReferenceKeys } from '../assets/retention-index-projection';
import { projectWorkspaceReferenceKeys } from '../review-workspaces/index-projection';
import {
  ROW_REFERENCE_INDEX,
  UNKNOWN_HISTORY_REFERENCES,
} from '../infrastructure/indexed-db/row-index-contract';
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

function fixtureReferenceKeys(
  pending: Map<string, Map<string, unknown>>,
  name: string,
  value: unknown
): string[] {
  if (name === 'video_workspaces') {
    const own = isRecord(value)
      ? [...(pending.get('video_workspace_history')?.values() ?? [])].filter(
          (row) => isRecord(row) && row['aggregateId'] === value['aggregateId']
        )
      : [];
    return projectWorkspaceReferenceKeys(value, own);
  }
  if (name === 'video_workspace_history') {
    const id = isRecord(value) ? value['aggregateId'] : undefined;
    const head = typeof id === 'string' ? pending.get('video_workspaces')?.get(id) : undefined;
    const own = [...(pending.get('video_workspace_history')?.values() ?? [])].filter(
      (row) => isRecord(row) && row['aggregateId'] === id
    );
    return projectWorkspaceReferenceKeys(head, own).includes(UNKNOWN_HISTORY_REFERENCES)
      ? [UNKNOWN_HISTORY_REFERENCES]
      : [];
  }
  return projectRowReferenceKeys(name, value);
}

function createWorkspaceFixtureRows(id: string): Map<string, Map<string, unknown>> {
  return new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[id, betaV1Fixture.records.media_library[0]]])],
    ['recordings', new Map([['beta-v1-recording', betaV1Fixture.records.recordings[0]]])],
    ['project_assets', new Map()],
    ['project_exports', new Map()],
    ...[
      'video_projects',
      'project_export_inputs',
      'recording_telemetry',
      'recording_cursor_trajectories',
      'recording_cursor_blocks',
      'recording_events',
      'native_transfer_sessions',
      'recording_recovery_sessions',
      'recording_recovery_blocks',
      'scenario_assets',
      'image_workspaces',
      'aggregate_presentations',
      'thumbnails',
      'asset_owners',
      'asset_refs',
      'asset_operations',
      'asset_residency',
      'sync_capture',
      'sync_outbox',
      'sync_connection',
      'video_project_revisions',
      'scenario_projects',
      'scenario_project_history',
      'scenario_project_units',
    ].map((name): [string, Map<string, unknown>] => [name, new Map()]),
    ['video_workspaces', new Map()],
    ['video_workspace_history', new Map()],
    ['video_workspace_drafts', new Map()],
  ]);
}

/** Shared transactional fixture retains commit/abort and quota behavior. */
export function createReviewWorkspaceStoreFixture(failure: (storeName?: string) => boolean) {
  const id = 'recording:beta-v1-recording';
  const rows = createWorkspaceFixtureRows(id);
  const database = {
    getAllFromIndex: async (name: string, index: string, query: IDBValidKey) => {
      if (index !== 'kind') throw new Error('Unsupported direct fixture index');
      const store = rows.get(name);
      if (!store) throw new Error('Unknown fixture store');
      return structuredClone(
        [...store.values()].filter((value) => isRecord(value) && value[index] === query)
      );
    },
    get: async (name: string, key: string) => structuredClone(rows.get(name)?.get(key)),
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
            [...store].filter(([, value]) =>
              indexName === ROW_REFERENCE_INDEX
                ? fixtureReferenceKeys(pending, name, value).includes(
                    typeof key === 'string' ? key : ''
                  )
                : isRecord(value) && value[indexName] === key
            );
          const write = async (value: unknown, add: boolean) => {
            if (failure(name)) throw new DOMException('No space', 'QuotaExceededError');
            if (!isRecord(value)) throw new Error('Invalid fixture row');
            const key =
              name === 'recording_events'
                ? JSON.stringify([
                    value['recordingId'],
                    value['eventStreamId'],
                    value['kind'],
                    value['entryId'],
                  ])
                : name === 'sync_capture' || name === 'sync_outbox' || name === 'sync_connection'
                  ? value['key']
                  : name === 'video_project_revisions'
                    ? value['projectId']
                    : name === 'scenario_project_history'
                      ? JSON.stringify([value['projectId'], value['revision']])
                      : name === 'scenario_project_units'
                        ? JSON.stringify([value['projectId'], value['unitId'], value['revision']])
                        : name === 'video_workspace_history'
                          ? JSON.stringify([value['aggregateId'], value['ordinal']])
                          : name === 'recording_telemetry'
                            ? value['recordingId']
                            : name === 'asset_owners'
                              ? JSON.stringify([
                                  value['ownerKind'],
                                  value['ownerId'],
                                  value['role'],
                                ])
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
            getAll: async (query?: IDBValidKey | IDBKeyRange, count?: number) =>
              structuredClone(
                query === undefined && count === undefined
                  ? [...store.values()]
                  : fixturePrimaryKeys(store, query, count).map((key) => store.get(keyOf(key)))
              ),
            getAllKeys: async (query?: IDBValidKey | IDBKeyRange, count?: number) =>
              fixturePrimaryKeys(store, query, count),
            count: async () => store.size,
            index: (indexName: string) => {
              if (
                indexName !== ROW_REFERENCE_INDEX &&
                indexName !== 'recoveryId' &&
                indexName !== 'aggregateId' &&
                indexName !== 'assetId' &&
                indexName !== 'snapshotAssetId' &&
                indexName !== 'kind' &&
                indexName !== 'rootKey' &&
                indexName !== 'projectId' &&
                indexName !== 'recordingId' &&
                indexName !== 'id'
              )
                throw new Error('Unexpected test index');
              return {
                openCursor: async (key: IDBValidKey) => {
                  const items = ownRows(key, indexName).map(([, value]) => structuredClone(value));
                  type Cursor = { value: unknown; continue(): Promise<Cursor | null> };
                  const at = (index: number): Cursor | null =>
                    index >= items.length
                      ? null
                      : { value: items[index], continue: async () => at(index + 1) };
                  return at(0);
                },
                count: async (key: IDBValidKey) => ownRows(key, indexName).length,
                getKey: async (key: IDBValidKey) => ownRows(key, indexName)[0]?.[0],
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
