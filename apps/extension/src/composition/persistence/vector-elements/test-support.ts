import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import type { openDB } from 'idb';
import { expect, vi } from 'vitest';
import { withIndexedRowProjections } from '../infrastructure/indexed-db/indexed-row-projections';
import { EXPECTED_STORES, EXPECTED_INDEXES } from '../infrastructure/indexed-db/core.stores';
import {
  ROW_REFERENCE_FIELD,
  ROW_REFERENCE_INDEX,
} from '../infrastructure/indexed-db/row-index-contract';
import {
  computeEditorVectorDefinitionDigest,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import { isActivePersistenceMutationTransitionPermit } from '../infrastructure/mutation-barrier';
import type { AssetReadyJournal } from '../assets/contracts';

const vectorTestState = vi.hoisted(() => ({
  database: undefined as unknown,
  bytes: new Map<string, Blob>(),
  journals: new Map<string, AssetReadyJournal>(),
  failJournal: false,
  sequence: 0,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => vectorTestState.database,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(vectorTestState.database),
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  writeBlobToAsset: async (blob: Blob, options: { persistenceTransitionPermit?: unknown } = {}) => {
    expect(isActivePersistenceMutationTransitionPermit(options.persistenceTransitionPermit)).toBe(
      true
    );
    const id = `vector-bytes-${++vectorTestState.sequence}`;
    vectorTestState.bytes.set(id, blob);
    return {
      ref: {
        assetId: id,
        createdAt: 1,
        mimeType: blob.type,
        size: blob.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${id}` },
      },
    };
  },
  readAssetFile: async (ref: { assetId: string }) => {
    const blob = vectorTestState.bytes.get(ref.assetId);
    if (!blob) throw new Error('Missing bytes');
    return blob;
  },
  discardPreparedAsset: async (id: string) => {
    vectorTestState.bytes.delete(id);
  },
  deleteAssetObject: async (id: string) => {
    vectorTestState.bytes.delete(id);
  },
  readWritingAssetIds: async () => [],
  readAssetReadyClaims: async () => ({
    valid: true,
    assetIds: new Set(),
    journals: [...vectorTestState.journals.values()],
  }),
  writeReadyJournal: async (journal: AssetReadyJournal) => {
    if (vectorTestState.failJournal) throw new Error('ready refused');
    vectorTestState.journals.set(journal.journalId, journal);
  },
  deleteReadyJournal: async (id: string) => {
    vectorTestState.journals.delete(id);
  },
  releaseAssetPublicationTransitions: async () => undefined,
}));

function installVectorTestLocks() {
  let readers = 0;
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        options: { mode: string },
        action: (lock: object | null) => Promise<unknown>
      ) => {
        if (!name.includes('resource-readers')) {
          if (options.mode !== 'exclusive') return action({});
          const next = (queues.get(name) ?? Promise.resolve()).then(() => action({}));
          queues.set(
            name,
            next.catch(() => undefined)
          );
          return next;
        }
        if (options.mode === 'exclusive') return action(readers ? null : {});
        readers++;
        try {
          return await action({});
        } finally {
          readers--;
        }
      },
    },
  });
}

async function openVectorTestDatabase(openDatabase: typeof openDB) {
  const native = await openDatabase(`vector-test-${crypto.randomUUID()}`, 1, {
    upgrade(database) {
      for (const name of EXPECTED_STORES) {
        const keyPath =
          name === 'editor_vector_library'
            ? 'key'
            : name === 'asset_owners'
              ? ['ownerKind', 'ownerId', 'role']
              : name === 'asset_refs'
                ? 'assetId'
                : name === 'asset_operations'
                  ? 'operationId'
                  : 'id';
        const store = database.createObjectStore(name, { keyPath });
        for (const index of EXPECTED_INDEXES[name])
          store.createIndex(index, index === ROW_REFERENCE_INDEX ? ROW_REFERENCE_FIELD : index, {
            multiEntry: index === ROW_REFERENCE_INDEX,
          });
      }
    },
  });
  const db = withIndexedRowProjections(native);
  return db;
}

async function createVectorTestDefinition() {
  const definition: EditorVectorDefinition = {
    version: 1,
    id: '',
    viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
    svg: '<svg/>',
    slots: [],
    capabilities: { palette: false, strokeScale: false },
    provenance: {
      sourceId: null,
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    },
  };
  definition.id = await computeEditorVectorDefinitionDigest(definition);
  return definition;
}

/** Real native transactions plus in-memory immutable bytes; publication and retirement remain production code. */
export async function createVectorLibraryTestHarness(openDatabase: typeof openDB) {
  vectorTestState.bytes.clear();
  vectorTestState.journals.clear();
  vectorTestState.sequence = 0;
  vectorTestState.failJournal = false;
  installVectorTestLocks();
  const db = await openVectorTestDatabase(openDatabase);
  vectorTestState.database = db;
  const definition = await createVectorTestDefinition();

  return {
    db,
    definition,
    close() {
      db.close();
      vi.unstubAllGlobals();
    },
  };
}

export { vectorTestState };
