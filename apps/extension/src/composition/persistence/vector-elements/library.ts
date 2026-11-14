import {
  isEditorVectorDefinition,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import type { EditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import { initDB, type IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  EDITOR_VECTOR_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransition,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import { readAssetFile } from '../assets/opfs-store';
import { SupersededAssetPublicationError } from '../assets/publication';
import { createEditorVectorBackingStore, syncEditorVectorBackingRetention } from './backing';
import {
  isEditorVectorCollection,
  isEditorVectorItem,
  isEditorVectorMember,
  isEditorVectorPreset,
  type EditorVectorCollection,
  type EditorVectorCollectionToken,
  type EditorVectorItemToken,
  type EditorVectorPublicationIntent,
  type EditorVectorPreset,
} from './contracts';
import {
  parseEditorVectorSettings,
  projectEditorVectorCatalog,
  reviseEditorVectorSettings,
  reviseEditorVectorItemMembership,
  createEditorVectorCollectionMetadata,
  renameEditorVectorCollection,
  reviseEditorVectorPreset,
  type EditorVectorSettingsPatch,
} from './library-metadata';

const STORES = [
  EDITOR_VECTOR_LIBRARY_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
];
/** Background admission reads the authoritative source without constructing a DOM/SVG service. */
export async function readEditorVectorSettings() {
  const value: unknown = await (await initDB()).get(EDITOR_VECTOR_LIBRARY_STORE, 'settings');
  return parseEditorVectorSettings(value);
}

async function mutate<T>(operation: (tx: IndexedDbWriteTransaction) => Promise<T>): Promise<T> {
  await initDB();
  return runWithPersistenceMutationTransition(() =>
    runWithDurableAssetLifecycleLock(() =>
      runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction(STORES, 'readwrite');
        try {
          const result = await operation(tx);
          await tx.done;
          return result;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      })
    )
  );
}
async function publishCommand<T>(
  operation: (permit: PersistenceMutationTransitionPermit) => Promise<T>
): Promise<T> {
  await initDB();
  return runWithPersistenceMutationTransition(operation);
}
async function readCatalog() {
  const db = await initDB();
  const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readonly');
  const groups: unknown[][] = await Promise.all(
    ['item', 'collection', 'member', 'preset'].map((kind) =>
      tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE).index('kind').getAll(kind)
    )
  );
  await tx.done;
  return projectEditorVectorCatalog(groups.flat());
}

async function captureAdmission(definitionId?: string, collectionId?: string) {
  const db = await initDB();
  const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readonly');
  const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
  const item: unknown = definitionId ? await store.get(`item:${definitionId}`) : undefined;
  if (item !== undefined && !isEditorVectorItem(item))
    throw new Error('Invalid vector library item.');
  let collection: EditorVectorCollectionToken | undefined;
  if (collectionId) {
    const row: unknown = await store.get(`collection:${collectionId}`);
    if (!isEditorVectorCollection(row) || row.deleted) throw new SupersededAssetPublicationError();
    collection = { id: row.id, incarnation: row.incarnation };
  }
  const rawSettings: unknown = await store.get('settings');
  const settings = parseEditorVectorSettings(rawSettings);
  await tx.done;
  const expectedItem: EditorVectorItemToken | null = isEditorVectorItem(item)
    ? { incarnation: item.incarnation, revision: item.revision }
    : null;
  const source: EditorVectorSourceToken | undefined =
    settings.networkEnabled && settings.disclosureAccepted
      ? {
          sourceId: settings.baseUrl,
          incarnation: settings.incarnation,
          generation: settings.sourceGeneration,
        }
      : undefined;
  return { expectedItem, ...(collection ? { collection } : {}), ...(source ? { source } : {}) };
}

async function updateSettings(patch: EditorVectorSettingsPatch, expected: EditorVectorItemToken) {
  return mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const next = reviseEditorVectorSettings(
      await store.get('settings'),
      patch,
      expected,
      crypto.randomUUID()
    );
    if (!next) throw new SupersededAssetPublicationError();
    await store.put(next);
    return next;
  });
}
async function createCollection(input: {
  id: string;
  name: string;
}): Promise<EditorVectorCollection> {
  return mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const collection = createEditorVectorCollectionMetadata(
      await store.get(`collection:${input.id}`),
      input,
      crypto.randomUUID()
    );
    await store.put(collection);
    return collection;
  });
}
async function renameCollection(id: string, incarnation: string, name: string): Promise<void> {
  await mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const next = renameEditorVectorCollection(
      await store.get(`collection:${id}`),
      incarnation,
      name
    );
    if (!next) throw new SupersededAssetPublicationError();
    await store.put(next);
  });
}
async function removeCollection(id: string, incarnation: string): Promise<void> {
  await mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const row: unknown = await store.get(`collection:${id}`);
    if (!isEditorVectorCollection(row) || row.incarnation !== incarnation)
      throw new SupersededAssetPublicationError();
    if (row.deleted) return;
    await store.put({ ...row, deleted: true, revision: row.revision + 1 });
    const members: unknown[] = await store.getAll(
      IDBKeyRange.bound(`member:${id}:`, `member:${id}:\uffff`)
    );
    for (const member of members) {
      if (!isEditorVectorMember(member)) throw new Error('Invalid vector collection membership.');
      await store.delete(member.key);
      await syncEditorVectorBackingRetention(tx, member.definitionId);
    }
    await store.delete(`download:${id}`);
  });
}
async function savePreset(
  input: Pick<EditorVectorPreset, 'id' | 'name' | 'style'>,
  expected: EditorVectorItemToken | null
): Promise<EditorVectorPreset> {
  return mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const preset = reviseEditorVectorPreset(
      await store.get(`preset:${input.id}`),
      input,
      expected,
      crypto.randomUUID()
    );
    if (!preset) throw new SupersededAssetPublicationError();
    await store.put(preset);
    return preset;
  });
}
async function removePreset(id: string, incarnation: string): Promise<void> {
  await mutate(async (tx) => {
    const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
    const row: unknown = await store.get(`preset:${id}`);
    if (!isEditorVectorPreset(row) || row.incarnation !== incarnation)
      throw new SupersededAssetPublicationError();
    await store.put({ ...row, deleted: true, revision: row.revision + 1 });
  });
}

/** Metadata commands share the library's existing transaction and revision owners. */
export function createEditorVectorLibraryMetadata() {
  return {
    readCatalog,
    readSettings: readEditorVectorSettings,
    updateSettings,
    createCollection,
    renameCollection,
    removeCollection,
    removePreset,
  };
}
export type EditorVectorLibraryMetadata = ReturnType<typeof createEditorVectorLibraryMetadata>;

/** Library commands own native commit, cancellation fencing and coarse backing retention. */
export function createEditorVectorLibrary(dependencies: {
  validateDefinition(value: unknown): Promise<EditorVectorDefinition>;
}) {
  const backing = createEditorVectorBackingStore(dependencies);
  async function readDefinition(id: string): Promise<EditorVectorDefinition> {
    const ref = (await backing.readRefs([id])).get(id);
    if (!ref) throw new Error('Vector library resource is missing.');
    return dependencies.validateDefinition(
      JSON.parse(await (await readAssetFile(ref, `vector:${id}`)).text()) as unknown
    );
  }
  async function importDefinition(
    definition: unknown,
    options: Omit<EditorVectorPublicationIntent, 'kind'> = {}
  ) {
    if (!isEditorVectorDefinition(definition))
      throw new Error('Invalid prepared vector definition.');
    return publishCommand(async (permit) => {
      const admission = await captureAdmission(definition.id, options.collection?.id);
      return backing.publish(
        definition,
        {
          kind: 'import',
          ...options,
          expectedItem:
            options.expectedItem === undefined ? admission.expectedItem : options.expectedItem,
        },
        permit
      );
    });
  }

  async function setFavorite(definitionId: string, enabled: boolean) {
    if (enabled) {
      await publishCommand(async (permit) => {
        const admission = await captureAdmission(definitionId);
        const definition = await readDefinition(definitionId);
        await backing.publish(
          definition,
          { kind: 'favorite', expectedItem: admission.expectedItem },
          permit
        );
      });
      return;
    }
    await mutate(async (tx) => {
      const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
      const raw: unknown = await store.get(`item:${definitionId}`);
      const item = reviseEditorVectorItemMembership(
        raw,
        definitionId,
        false,
        crypto.randomUUID(),
        Date.now()
      );
      await store.put(item);
      await syncEditorVectorBackingRetention(tx, definitionId);
    });
  }
  async function markUsed(definitionId: string) {
    return publishCommand(async (permit) => {
      const admission = await captureAdmission(definitionId);
      await backing.publish(
        await readDefinition(definitionId),
        { kind: 'used', expectedItem: admission.expectedItem },
        permit
      );
    });
  }

  return {
    readCatalog,
    readDefinition,
    readSettings: readEditorVectorSettings,
    captureAdmission,
    updateSettings,
    importDefinition,
    setFavorite,
    markUsed,
    removeItem: backing.removeLocalMembership,
    createCollection,
    renameCollection,
    removeCollection,
    savePreset,
    removePreset,
    publish: backing.publish,
  };
}
export type EditorVectorLibrary = ReturnType<typeof createEditorVectorLibrary>;
