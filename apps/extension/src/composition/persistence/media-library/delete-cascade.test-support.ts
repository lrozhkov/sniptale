import { materializeWorkspaceStorage } from '../review-workspaces/storage-format';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { beforeEach, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import type { MediaLibraryEntry } from './contracts';

const harness = vi.hoisted(() => ({
  db: vi.fn(),
  complete: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: harness.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await harness.db()),
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: harness.complete,
}));
vi.mock('../scenario/resource-sessions', () => ({
  tryScenarioResourceCleanup: async (_id: string, operation: () => Promise<unknown>) => operation(),
}));

export const mediaId = 'project-asset:project-asset-1';
export const physicalId = 'physical-1';

export function mediaEntry(): MediaLibraryEntry {
  return {
    id: mediaId,
    kind: 'video',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    filename: 'clip.webm',
    originalFilename: 'clip.webm',
    createdAt: 1,
    updatedAt: 1,
    size: 5,
    mimeType: 'video/webm',
    width: 100,
    height: 100,
    duration: 2,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
}

function keyOf(store: string, value: Record<string, unknown>): string {
  if (store === 'recording_recovery_blocks') return JSON.stringify([value['id'], value['index']]);
  if (store === 'scenario_project_units')
    return JSON.stringify([value['projectId'], value['unitId'], value['revision']]);
  if (store === 'scenario_project_history')
    return JSON.stringify([value['projectId'], value['revision']]);
  if (store === 'video_workspace_history')
    return JSON.stringify([value['aggregateId'], value['ordinal']]);
  if (store === 'asset_owners')
    return JSON.stringify([value['ownerKind'], value['ownerId'], value['role']]);
  if (store === 'video_workspaces' || store === 'video_workspace_drafts')
    return String(value['aggregateId']);
  if (store === 'asset_operations') return String(value['operationId']);
  return String(value['id'] ?? value['assetId']);
}

export let rows: Map<string, Map<string, unknown>>;

/** Observe full logical history after an atomic physical detach or parent cleanup. */
export function readReviewWorkspaceFixture(aggregateId: string): unknown {
  return materializeWorkspaceStorage(
    rows.get('video_workspaces')?.get(aggregateId),
    [...(rows.get('video_workspace_history')?.values() ?? [])].filter(
      (row) => isRecord(row) && row['aggregateId'] === aggregateId
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const project = createVideoProjectEntryWithMediaClip();
  rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[mediaId, mediaEntry()]])],
    ['video_projects', new Map([[project.id, project]])],
    [
      'project_assets',
      new Map([
        [
          'project-asset-1',
          {
            id: 'project-asset-1',
            assetId: physicalId,
            mimeType: 'video/webm',
            createdAt: 1,
            size: 5,
          },
        ],
      ]),
    ],
    [
      'asset_refs',
      new Map([
        [
          physicalId,
          {
            assetId: physicalId,
            size: 5,
            mimeType: 'video/webm',
            createdAt: 1,
            storagePath: 'object',
          },
        ],
      ]),
    ],
    [
      'asset_owners',
      new Map([
        [
          JSON.stringify(['project-asset', 'project-asset-1', 'body']),
          {
            assetId: physicalId,
            ownerId: 'project-asset-1',
            ownerKind: 'project-asset',
            role: 'body',
          },
        ],
      ]),
    ],
  ]);
  harness.db.mockResolvedValue({
    transaction(_stores: string[], _mode: string, options?: { durability?: string }) {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        durability: options?.durability ?? 'default',
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const store = pending.get(name) ?? new Map<string, unknown>();
          pending.set(name, store);
          return {
            get: async (key: unknown) =>
              store.get(Array.isArray(key) ? JSON.stringify(key) : String(key)),
            getAll: async () => [...store.values()],
            put: async (value: Record<string, unknown>) => {
              store.set(keyOf(name, value), value);
            },
            delete: async (key: unknown) => {
              store.delete(Array.isArray(key) ? JSON.stringify(key) : String(key));
            },
            index: (indexName: string) => ({
              getAll: async (key: IDBValidKey) =>
                [...store.values()].filter((value) => isRecord(value) && value[indexName] === key),
              getAllKeys: async (key: IDBValidKey) =>
                [...store.values()]
                  .filter(isRecord)
                  .filter((value) => value[indexName] === key)
                  .map((value) => {
                    if (name === 'recording_recovery_blocks') return [value['id'], value['index']];
                    if (
                      typeof value['aggregateId'] !== 'string' ||
                      typeof value['ordinal'] !== 'number'
                    )
                      throw new Error('Invalid compound fixture key');
                    return [value['aggregateId'], value['ordinal']];
                  }),
              count: async (assetId: string) =>
                [...store.values()].filter(
                  (value) => (value as { assetId?: string }).assetId === assetId
                ).length,
            }),
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          rows = pending;
          return Promise.resolve();
        },
      };
    },
  });
});

export function replaceRows(next: Map<string, Map<string, unknown>>): void {
  rows = next;
}

export { harness };
