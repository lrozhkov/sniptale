import { withVideoProjectUsage } from './usage-index-keys';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { projectRowReferenceKeys } from '../assets/retention-index-projection';
import { projectWorkspaceReferenceKeys } from '../review-workspaces/index-projection';
import {
  ROW_REFERENCE_INDEX,
  UNKNOWN_HISTORY_REFERENCES,
} from '../infrastructure/indexed-db/row-index-contract';
import { materializeWorkspaceStorage } from '../review-workspaces/storage-format';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { beforeEach, vi } from 'vitest';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import type { MediaLibraryEntry, MediaAssetSource } from './contracts';

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
  if (store === 'recording_events')
    return JSON.stringify([
      value['recordingId'],
      value['eventStreamId'],
      value['kind'],
      value['entryId'],
    ]);
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
          const referenceKeys = (value: unknown): string[] => {
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
              const head =
                typeof id === 'string' ? pending.get('video_workspaces')?.get(id) : undefined;
              const own = [...(pending.get('video_workspace_history')?.values() ?? [])].filter(
                (row) => isRecord(row) && row['aggregateId'] === id
              );
              return projectWorkspaceReferenceKeys(head, own).includes(UNKNOWN_HISTORY_REFERENCES)
                ? [UNKNOWN_HISTORY_REFERENCES]
                : [];
            }
            return projectRowReferenceKeys(name, value);
          };
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
              openCursor: async (key: IDBValidKey) => {
                const items = [...store.values()].filter(
                  (value) => isRecord(value) && value[indexName] === key
                );
                type Cursor = { value: unknown; continue(): Promise<Cursor | null> };
                const at = (index: number): Cursor | null =>
                  index >= items.length
                    ? null
                    : {
                        value: items[index],
                        continue: async () => at(index + 1),
                      };
                return at(0);
              },
              getAll: async (key: IDBValidKey) =>
                [...store.values()].filter((value) =>
                  indexName === ROW_REFERENCE_INDEX
                    ? referenceKeys(value).includes(typeof key === 'string' ? key : '')
                    : isRecord(value) && value[indexName] === key
                ),
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

/** Reject unrestricted object-store body reads during per-source deletion proof. */
export async function forbidGlobalDeletionReads() {
  const db = await harness.db();
  const transaction = db.transaction.bind(db);
  vi.spyOn(db, 'transaction').mockImplementation((...args) => {
    const tx = transaction(...args);
    const objectStore = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => {
      const store = objectStore(name);
      const getAll = store.getAll;
      store.getAll = (query?: IDBValidKey, count?: number) => {
        if (query === undefined) throw new Error(`Global deletion scan forbidden: ${name}`);
        return getAll(query, count);
      };
      return store;
    };
    return tx;
  });
}

/** Read the admitted default project from the cascade fixture. */
export function readCascadeVideoProject() {
  const project = parseVideoProjectEntry([...rows.get('video_projects')!.values()][0]);
  if (!project) throw new Error('Missing valid cascade project fixture');
  return project;
}

/** Build a valid independent review head for cascade fixtures. */
export function createCascadeReviewWorkspace(advanced = createQuickEditAdvancedState()) {
  return {
    aggregateId: 'recording:other',
    formatVersion: 1,
    sourceAssetId: 'primary-physical',
    source: { duration: 2, width: 640, height: 360, size: 4, mimeType: 'video/webm' },
    revision: 1,
    cursor: 0,
    history: [],
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
}

function installCascadeOwner(
  ownerKind: string,
  ownerId: string,
  assetId = physicalId,
  role = 'body'
) {
  rows.get('asset_owners')!.set(JSON.stringify([ownerKind, ownerId, role]), {
    ownerKind,
    ownerId,
    assetId,
    role,
  });
}

function installCascadeWebSnapshot(snapshotId: string) {
  const snapshot = {
    id: snapshotId,
    packageAssetId: physicalId,
    screenshotAssetId: 'snapshot-image',
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: 5,
    createdAt: 1,
    updatedAt: 1,
    manifest: createPagePackageManifestFixture({
      id: snapshotId,
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com/' },
    }),
  };
  rows.set('web_snapshots', new Map([[snapshotId, snapshot]]));
  installCascadeOwner('web-snapshot', snapshotId, physicalId, 'package');
  installCascadeOwner('web-snapshot', snapshotId, 'snapshot-image', 'screenshot');
  rows.get('asset_refs')!.set('snapshot-image', {
    assetId: 'snapshot-image',
    size: 3,
    mimeType: 'image/png',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'snapshot-image' },
  });
}

function installCascadeSourceRecord(source: MediaAssetSource) {
  switch (source.kind) {
    case 'recording': {
      const recording = {
        id: source.recordingId,
        assetId: physicalId,
        filename: 'clip.webm',
        mimeType: 'video/webm',
        size: 5,
        createdAt: 1,
      };
      rows.set('recordings', new Map([[source.recordingId, recording]]));
      installCascadeOwner('recording', source.recordingId);
      break;
    }
    case 'project-asset':
      installCascadeOwner('project-asset', source.projectAssetId);
      break;
    case 'stored-asset':
      installCascadeOwner('media-library', mediaId, physicalId, 'source');
      break;
    case 'project-export': {
      const exported = {
        id: source.exportId,
        assetId: physicalId,
        projectId: source.projectId,
        filename: 'export.webm',
        size: 5,
        createdAt: 1,
        duration: 2,
        width: 100,
        height: 100,
        fps: 30,
      };
      rows.set('project_exports', new Map([[source.exportId, exported]]));
      installCascadeOwner('project-export', source.exportId);
      break;
    }
    case 'web-snapshot':
      installCascadeWebSnapshot(source.snapshotId);
      break;
    case 'screenshot':
      break;
  }
}

/** Seed the source owner, Library root, and consuming video for a cascade case. */
export function installCascadeSource(source: MediaAssetSource) {
  rows.get('asset_owners')!.clear();
  rows.get('media_library')!.set(mediaId, {
    ...mediaEntry(),
    source,
    ...(source.kind === 'screenshot'
      ? { kind: 'image', mimeType: 'image/png', blob: new Blob(['png']) }
      : {}),
  });
  installCascadeSourceRecord(source);
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId };
  rows.get('video_projects')!.clear();
  rows.get('video_projects')!.set(video.id, withVideoProjectUsage(video));
  return video;
}
