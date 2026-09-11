import { beforeEach, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());

function getStore(name: string) {
  const store = stores.get(name);
  if (!store) throw new Error(`Uninitialized test store ${name}`);
  return store;
}

function normalizeKey(key: unknown): string {
  return typeof key === 'string' ? key : JSON.stringify(key);
}

const db = {
  get: vi.fn(async (name: string, id: string) => getStore(name).get(id)),
  getAllFromIndex: vi.fn(async (name: string, _index: string, projectId: string) =>
    [...getStore(name).values()].filter(
      (value) => (value as { projectId?: string }).projectId === projectId
    )
  ),
  transaction: vi.fn((names: string | string[]) => {
    const allowed = new Set(Array.isArray(names) ? names : [names]);
    return {
      abort: vi.fn(),
      done: Promise.resolve(),
      objectStore: (name: string) => {
        if (!allowed.has(name)) throw new Error(`Unexpected store ${name}`);
        return {
          delete: async (id: unknown) => void getStore(name).delete(normalizeKey(id)),
          get: async (id: unknown) => getStore(name).get(normalizeKey(id)),
          index: () => ({
            count: async (assetId: string) =>
              [...getStore(name).values()].filter(
                (value) => (value as { assetId?: string }).assetId === assetId
              ).length,
            getAll: async (projectId: string) =>
              [...getStore(name).values()].filter(
                (value) => (value as { projectId?: string }).projectId === projectId
              ),
          }),
          put: async (value: {
            assetId?: string;
            id?: string;
            operationId?: string;
            ownerId?: string;
            ownerKind?: string;
            role?: string;
            stepId?: string;
          }) => {
            const key =
              value.id ??
              value.stepId ??
              value.operationId ??
              (value.ownerKind
                ? JSON.stringify([value.ownerKind, value.ownerId, value.role])
                : value.assetId) ??
              '';
            getStore(name).set(key, value);
          },
        };
      },
    };
  }),
};

vi.mock('../infrastructure/indexed-db/core', () => ({
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  ASSET_OPERATIONS_STORE: 'asset_operations',
  ASSET_OWNERS_STORE: 'asset_owners',
  ASSET_REFS_STORE: 'asset_refs',
  SCENARIO_ASSETS_STORE: 'scenario_assets',
  SCENARIO_EXPORTS_STORE: 'scenario_exports',
  SCENARIO_PROJECTS_STORE: 'scenario_projects',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
  initDB: vi.fn(async () => db),
}));

vi.mock('../assets', () => ({
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  createAssetPublicationJournal: vi.fn(async (args) => ({
    ...args,
    createdAt: 1,
    journalId: 'journal-1',
  })),
  deleteAssetObject: vi.fn(async () => undefined),
  discardPreparedAsset: vi.fn(async () => undefined),
  parseAssetRef: (value: unknown) => value,
  publishReadyJournalWithRetry: vi.fn(async (journal, publish) => publish(journal)),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
  releaseAssetReadyProtection: vi.fn(),
  writeBlobToAsset: vi.fn(async (blob: Blob) => {
    const assetId = `editor-${getStore('prepared_editor_assets').size + 1}`;
    getStore('prepared_editor_assets').set(assetId, blob);
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type || 'application/octet-stream',
        sha256: null,
        size: blob.size,
      },
    };
  }),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: vi.fn(async (effect) => effect(db)),
}));
function createAsset(projectId: string, id = 'asset-1') {
  const blob = new Blob(['asset'], { type: 'image/png' });
  const assetId = `opfs-${id}`;
  return {
    assetId,
    assetRef: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: 'image/png',
      sha256: null,
      size: blob.size,
    },
    createdAt: 1,
    galleryAssetId: null,
    height: 10,
    id,
    mimeType: 'image/png',
    projectId,
    size: blob.size,
    width: 10,
  };
}

function createDocument(projectId: string, stepId = 'step-1') {
  return {
    createdAt: 1,
    document: {
      browserFrame: DEFAULT_BROWSER_FRAME_STATE,
      canvasHeight: 10,
      canvasJson: '{}',
      canvasWidth: 10,
      frame: DEFAULT_EDITOR_FRAME_SETTINGS,
      sourceDisplayHeight: 10,
      sourceDisplayWidth: 10,
      sourceHeight: 10,
      sourceImageData: 'data:image/png;base64,YQ==',
      sourceLeft: 0,
      sourceName: null,
      sourceTop: 0,
      sourceWidth: 10,
      version: 2 as const,
    },
    projectId,
    stepId,
    updatedAt: 1,
  };
}

beforeEach(() => {
  stores.clear();
  for (const name of [
    'aggregate_presentations',
    'asset_operations',
    'asset_owners',
    'asset_refs',
    'scenario_assets',
    'scenario_exports',
    'scenario_projects',
    'scenario_step_editor_documents',
    'prepared_editor_assets',
  ])
    stores.set(name, new Map());
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(100);
});

export { stores, getStore, normalizeKey, db, createAsset, createDocument };
