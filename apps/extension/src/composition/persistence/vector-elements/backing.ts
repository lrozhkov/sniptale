import {
  isEditorVectorDefinition,
  serializeEditorVectorDefinition,
  validateEditorVectorDefinitionDigest,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
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
  runWithPersistenceMutationTransitionRecovery,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import {
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
  SupersededAssetPublicationError,
} from '../assets/publication';
import { discardPreparedAsset, readAssetFile, writeBlobToAsset } from '../assets/opfs-store';
import { parseAssetOwner, parseAssetRef } from '../assets/guards';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
} from '../assets/operations';
import type { AssetPublicationAdapter, AssetReadyJournal, AssetRef } from '../assets/contracts';
import {
  EDITOR_VECTOR_OWNER_KIND,
  EDITOR_VECTOR_PUBLICATION_DOMAIN,
  parseEditorVectorBacking,
  type EditorVectorBacking,
  type EditorVectorPublicationIntent,
  isEditorVectorItem,
  isEditorVectorCollection,
  isEditorVectorMember,
  isEditorVectorDownload,
  isEditorVectorPublicationIntent,
  editorVectorItemHasMembership,
} from './contracts';
import {
  admitsEditorVectorSource,
  admitsEditorVectorCollection,
  planEditorVectorPublicationItem,
  planEditorVectorPublicationMember,
} from './publication-admission';
import {
  acceptEditorVectorDownloadName,
  removeEditorVectorDownloadDefinition,
} from './download-transitions';
import { reviseEditorVectorItemMembership } from './library-metadata';

const STORES = [
  EDITOR_VECTOR_LIBRARY_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
];
const keyFor = (id: string) => `definition:${id}`;

async function publishVectorJournal(journal: AssetReadyJournal): Promise<void> {
  const backing = parseEditorVectorBacking(journal.payload);
  const rawIntent =
    typeof journal.payload === 'object' &&
    journal.payload !== null &&
    'libraryIntent' in journal.payload
      ? journal.payload.libraryIntent
      : undefined;
  if (rawIntent !== undefined && !isEditorVectorPublicationIntent(rawIntent))
    throw new Error('Invalid vector library publication intent.');
  const intent = rawIntent ?? { kind: 'used' as const };
  const ref = journal.assetRefs.length === 1 ? parseAssetRef(journal.assetRefs[0]) : null;
  if (
    !backing ||
    !ref ||
    backing.assetId !== ref.assetId ||
    ref.mimeType !== 'application/json' ||
    ref.size > 8 * 1024 * 1024
  )
    throw new Error('Invalid vector publication.');
  const value: unknown = JSON.parse(
    await (await readAssetFile(ref, `vector:${backing.definitionId}`)).text()
  );
  if (
    !isEditorVectorDefinition(value) ||
    value.id !== backing.definitionId ||
    !(await validateEditorVectorDefinitionDigest(value))
  )
    throw new Error('Invalid vector publication identity.');
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(STORES, 'readwrite');
    try {
      const source = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
      const raw: unknown = await source.get(backing.key);
      const current = parseEditorVectorBacking(raw);
      if (
        raw !== undefined &&
        (!current ||
          current.assetId !== backing.assetId ||
          current.incarnation !== backing.incarnation)
      )
        throw new SupersededAssetPublicationError();
      if (!current) await applyEditorVectorPublicationIntent(tx, value, intent);
      await source.put(current ?? backing);
      await tx.objectStore(ASSET_REFS_STORE).put(ref);
      await tx.objectStore(ASSET_OWNERS_STORE).put({
        ownerKind: EDITOR_VECTOR_OWNER_KIND,
        ownerId: backing.definitionId,
        role: 'body',
        assetId: backing.assetId,
      });
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

/** Startup replay uses the original immutable journal identity and never overwrites a replacement. */
export const editorVectorPublicationAdapter: AssetPublicationAdapter = {
  domain: EDITOR_VECTOR_PUBLICATION_DOMAIN,
  publish: publishVectorJournal,
};

async function readRefs(ids: readonly string[]): Promise<ReadonlyMap<string, AssetRef>> {
  const db = await initDB();
  const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE, ASSET_REFS_STORE], 'readonly');
  const refs = new Map<string, AssetRef>();
  for (const id of new Set(ids)) {
    const backing = parseEditorVectorBacking(
      await tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE).get(keyFor(id))
    );
    if (!backing) continue;
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(backing.assetId));
    if (ref) refs.set(id, ref);
  }
  await tx.done;
  for (const [id, ref] of refs) {
    if (ref.mimeType !== 'application/json' || ref.size > 8 * 1024 * 1024)
      throw new Error('Invalid vector backing resource.');
    const file = await readAssetFile(ref, `vector:${id}`);
    if (file.size > 8 * 1024 * 1024) throw new Error('Vector backing resource exceeds its limit.');
    const value: unknown = JSON.parse(await file.text());
    if (
      !isEditorVectorDefinition(value) ||
      value.id !== id ||
      !(await validateEditorVectorDefinitionDigest(value))
    )
      throw new Error('Invalid vector backing identity.');
  }
  return refs;
}

async function removeLocalMembership(definitionId: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/u.test(definitionId)) throw new Error('Invalid vector library identity.');
  await initDB();
  return runWithPersistenceMutationTransition(async () => {
    const operation = await runWithDurableAssetLifecycleLock(() =>
      runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction(STORES, 'readwrite');
        try {
          const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
          const raw: unknown = await store.get(keyFor(definitionId));
          const backing = parseEditorVectorBacking(raw);
          if (raw !== undefined && !backing) throw new Error('Invalid vector backing evidence.');
          await removeEditorVectorItemMembership(tx, definitionId);
          if (!backing) {
            await tx.done;
            return null;
          }
          const intent = buildPhysicalDeleteOperation([]);
          intent.vectorDefinitions = [
            { definitionId, expectedAssetId: backing.assetId, incarnation: backing.incarnation },
          ];
          await store.put({ ...backing, retained: false });
          await tx.objectStore(ASSET_OPERATIONS_STORE).put(intent);
          await tx.done;
          return intent;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      })
    );
    // Visible membership is already committed. A failed physical retry keeps its durable intent.
    if (operation) void completePhysicalDeleteOperation(operation).catch(() => undefined);
  });
}

/** The caller supplies the SVG owner's full profile validator before publishing an insertion resource. */
export function createEditorVectorBackingStore(dependencies: {
  validateDefinition(value: unknown): Promise<EditorVectorDefinition>;
}) {
  async function publish(
    input: unknown,
    libraryIntent: EditorVectorPublicationIntent = { kind: 'used' },
    publicationTransition?: PersistenceMutationTransitionPermit
  ): Promise<AssetRef> {
    if (!isEditorVectorPublicationIntent(libraryIntent))
      throw new Error('Invalid vector library publication intent.');
    await initDB();
    return runWithPersistenceMutationTransitionRecovery(
      publicationTransition,
      async (transitionPermit) => {
        const definition = await dependencies.validateDefinition(input);
        if (
          !isEditorVectorDefinition(definition) ||
          !(await validateEditorVectorDefinitionDigest(definition))
        )
          throw new Error('Invalid vector definition.');
        await initDB();
        return runWithDurableAssetLifecycleLock(async (permit) => {
          const reused = await runWithIndexedDbMutation(async (db) => {
            const tx = db.transaction(STORES, 'readwrite');
            try {
              const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
              const raw: unknown = await store.get(keyFor(definition.id));
              const current = parseEditorVectorBacking(raw);
              if (raw !== undefined && !current)
                throw new Error('Invalid vector backing evidence.');
              const ref = current
                ? parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(current.assetId))
                : null;
              if (current && !ref) throw new Error('Missing vector backing resource.');
              if (
                current &&
                parseAssetOwner(
                  await tx
                    .objectStore(ASSET_OWNERS_STORE)
                    .get([EDITOR_VECTOR_OWNER_KIND, definition.id, 'body'])
                )?.assetId !== current.assetId
              )
                throw new Error('Invalid vector backing ownership.');
              if (current && ref) {
                await applyEditorVectorPublicationIntent(tx, definition, libraryIntent);
                // A new explicit adoption invalidates every older causal retirement capability.
                await store.put({ ...current, retained: true, incarnation: crypto.randomUUID() });
              }
              await tx.done;
              return ref;
            } catch (error) {
              return abortIndexedDbMutation(tx, error);
            }
          });
          if (reused) {
            if (reused.mimeType !== 'application/json' || reused.size > 8 * 1024 * 1024)
              throw new Error('Invalid vector backing resource.');
            const value: unknown = JSON.parse(
              await (await readAssetFile(reused, `vector:${definition.id}`)).text()
            );
            if (
              !isEditorVectorDefinition(value) ||
              serializeEditorVectorDefinition(value) !== serializeEditorVectorDefinition(definition)
            )
              throw new Error('Vector backing identity does not match its resource.');
            return reused;
          }
          const blob = new Blob([serializeEditorVectorDefinition(definition)], {
            type: 'application/json',
          });
          if (blob.size > 8 * 1024 * 1024)
            throw new Error('Vector definition exceeds its resource limit.');
          const prepared = await writeBlobToAsset(blob, {
            persistenceTransitionPermit: transitionPermit,
          });
          let journal: AssetReadyJournal;
          try {
            journal = await createAssetPublicationJournal({
              assetRefs: [prepared.ref],
              domain: EDITOR_VECTOR_PUBLICATION_DOMAIN,
              payload: {
                key: keyFor(definition.id),
                kind: 'definition',
                definitionId: definition.id,
                assetId: prepared.ref.assetId,
                incarnation: crypto.randomUUID(),
                retained: true,
                libraryIntent,
              } satisfies EditorVectorBacking & { libraryIntent: EditorVectorPublicationIntent },
              lifecyclePermit: permit,
            });
          } catch (error) {
            await discardPreparedAsset(prepared.ref.assetId);
            throw error;
          }
          await publishReadyJournalWithRetry(journal, publishVectorJournal, permit);
          return prepared.ref;
        });
      }
    );
  }

  return { publish, readRefs, removeLocalMembership };
}

/** Ready publication admits metadata and byte ownership in the same native commit. */
async function applyEditorVectorPublicationIntent(
  tx: IndexedDbWriteTransaction,
  definition: EditorVectorDefinition,
  intent: EditorVectorPublicationIntent
): Promise<void> {
  const definitionId = definition.id;
  const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
  if (intent.source && !admitsEditorVectorSource(await store.get('settings'), intent.source))
    throw new SupersededAssetPublicationError();
  if (
    intent.collection &&
    !admitsEditorVectorCollection(
      await store.get(`collection:${intent.collection.id}`),
      intent.collection
    )
  )
    throw new SupersededAssetPublicationError();
  const item = planEditorVectorPublicationItem(
    await store.get(`item:${definitionId}`),
    definition,
    intent,
    crypto.randomUUID(),
    Date.now()
  );
  if (!item) throw new SupersededAssetPublicationError();
  if (intent.kind === 'download') {
    const attempt = intent.download;
    if (!attempt || !intent.name) throw new Error('Invalid vector download publication.');
    const next = acceptEditorVectorDownloadName(
      await store.get(`download:${attempt.collection.id}`),
      attempt,
      intent.name,
      definitionId
    );
    if (!next) throw new SupersededAssetPublicationError();
    await store.put(next);
  }
  if (intent.collection)
    await store.put(
      planEditorVectorPublicationMember(definitionId, intent.collection, intent.name)
    );
  await store.put(item);
}

/** Explicit item removal fences delayed commands even when no immutable backing exists yet. */
async function removeEditorVectorItemMembership(
  tx: IndexedDbWriteTransaction,
  definitionId: string
): Promise<void> {
  const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
  await store.put(
    reviseEditorVectorItemMembership(
      await store.get(`item:${definitionId}`),
      definitionId,
      true,
      crypto.randomUUID(),
      Date.now()
    )
  );
  const rows: unknown[] = await store.index('definitionId').getAll(definitionId);
  for (const row of rows) {
    if (!isEditorVectorMember(row)) continue;
    await store.delete(row.key);
    const download: unknown = await store.get(`download:${row.collectionId}`);
    if (isEditorVectorDownload(download)) {
      await store.put(removeEditorVectorDownloadDefinition(download, definitionId));
    }
  }
}

/** The metadata owner refreshes the coarse backing latch and causal intent in its own transaction. */
export async function syncEditorVectorBackingRetention(
  tx: IndexedDbWriteTransaction,
  definitionId: string
): Promise<void> {
  const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
  const backing = parseEditorVectorBacking(await store.get(keyFor(definitionId)));
  if (!backing) return;
  const item: unknown = await store.get(`item:${definitionId}`);
  if (item !== undefined && !isEditorVectorItem(item))
    throw new Error('Invalid vector library item.');
  let retained = isEditorVectorItem(item) && editorVectorItemHasMembership(item);
  for (const row of await store.index('definitionId').getAll(definitionId)) {
    if (!isEditorVectorMember(row)) continue;
    const collection: unknown = await store.get(`collection:${row.collectionId}`);
    if (!isEditorVectorCollection(collection))
      throw new Error('Invalid vector library collection.');
    retained ||= !collection.deleted && collection.incarnation === row.collectionIncarnation;
  }
  const incarnation = crypto.randomUUID();
  await store.put({ ...backing, retained, incarnation });
  if (!retained) {
    const operation = buildPhysicalDeleteOperation([]);
    operation.vectorDefinitions = [{ definitionId, expectedAssetId: backing.assetId, incarnation }];
    await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  }
}
