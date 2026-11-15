import { createVectorLibraryTestHarness, vectorTestState as state } from './test-support';
import { openDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { createEditorVectorBackingStore, editorVectorPublicationAdapter } from './backing';
import {
  completePhysicalDeleteOperation,
  deleteOrphanAssetObjectBatch,
} from '../assets/operations';
import { acquireAssetResourceSession } from '../assets/resource-sessions';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import type { PhysicalDeleteAssetOperation } from '../assets/contracts';

let harness: Awaited<ReturnType<typeof createVectorLibraryTestHarness>>;
let db: IDBPDatabase;
let definition: EditorVectorDefinition;
beforeEach(async () => {
  harness = await createVectorLibraryTestHarness(openDB);
  db = harness.db;
  definition = harness.definition;
});
afterEach(() => harness.close());
const store = () => createEditorVectorBackingStore({ validateDefinition: async () => definition });
async function intents(): Promise<PhysicalDeleteAssetOperation[]> {
  return db.getAll('asset_operations');
}
async function drain() {
  for (const intent of await intents()) await completePhysicalDeleteOperation(intent);
}

it('publishes one immutable backing for parallel writers and retries ready refusal without data loss', async () => {
  const service = store();
  state.failJournal = true;
  await expect(service.publish(definition)).rejects.toThrow('ready refused');
  expect(state.bytes.size).toBe(0);
  expect(await db.count('editor_vector_library')).toBe(0);
  state.failJournal = false;
  // The lifecycle owner serializes parallel commands. Exact journal replay cannot duplicate its record.
  const [first, second] = await Promise.all([
    service.publish(definition),
    service.publish(definition),
  ]);
  expect(second).toEqual(first);
  expect((await service.readRefs([definition.id])).get(definition.id)).toEqual(first);
  expect(state.bytes.size).toBe(1);
  expect(await db.count('asset_owners')).toBe(1);
});

it('keeps removed backing through orphan cleanup until both readers release', async () => {
  const service = store();
  const ref = await service.publish(definition);
  const first = await acquireAssetResourceSession();
  const second = await acquireAssetResourceSession();
  await service.removeLocalMembership(definition.id);
  await drain();
  await runWithDurableAssetLifecycleLock((permit) =>
    deleteOrphanAssetObjectBatch([ref.assetId], new AbortController().signal, permit)
  );
  expect(state.bytes.has(ref.assetId)).toBe(true);
  expect((await db.get('editor_vector_library', `definition:${definition.id}`)).retained).toBe(
    false
  );
  await first.release();
  await drain();
  expect(state.bytes.has(ref.assetId)).toBe(true);
  await second.release();
  await drain();
  expect(await db.get('editor_vector_library', `definition:${definition.id}`)).toBeUndefined();
  expect(state.bytes.has(ref.assetId)).toBe(false);
});

it('late autosave ownership after library deletion retains bytes after reader disposal', async () => {
  const service = store();
  const ref = await service.publish(definition);
  const reader = await acquireAssetResourceSession();
  await service.removeLocalMembership(definition.id);
  await drain();
  await db.put('asset_owners', {
    ownerKind: 'image-workspace',
    ownerId: 'saved',
    role: `vector:${definition.id}`,
    assetId: ref.assetId,
  });
  await reader.release();
  await drain();
  expect(state.bytes.has(ref.assetId)).toBe(true);
  expect(await db.get('asset_refs', ref.assetId)).toBeDefined();
});

it('re-adoption rejects old retirement and replay cannot restore removed membership', async () => {
  const service = store();
  const ref = await service.publish(definition);
  const original = await db.get('editor_vector_library', `definition:${definition.id}`);
  const reader = await acquireAssetResourceSession();
  await service.removeLocalMembership(definition.id);
  await editorVectorPublicationAdapter.publish({
    assetRefs: [ref],
    createdAt: 1,
    domain: 'editor-vector-definition',
    journalId: 'old',
    payload: original,
  });
  expect((await db.get('editor_vector_library', original.key)).retained).toBe(false);
  await service.publish(definition);
  const replacement = await db.get('editor_vector_library', original.key);
  expect(replacement.incarnation).not.toBe(original.incarnation);
  await reader.release();
  await drain();
  expect(await db.get('editor_vector_library', original.key)).toEqual(replacement);
  expect(state.bytes.has(ref.assetId)).toBe(true);
});

it('requires full profile validation before writing or publishing an insertion resource', async () => {
  const validateDefinition = vi.fn(async () => {
    throw new Error('unsupported profile');
  });
  await expect(
    createEditorVectorBackingStore({ validateDefinition }).publish(definition)
  ).rejects.toThrow('unsupported profile');
  expect(state.bytes.size).toBe(0);
  expect(await db.count('asset_owners')).toBe(0);
});

it('rolls back failed metadata publication and replays the retained ready resource on retry', async () => {
  state.database = {
    transaction(names: string[], mode: IDBTransactionMode) {
      const tx = db.transaction(names, mode);
      return {
        done: tx.done,
        abort: () => tx.abort(),
        objectStore(name: string) {
          const source = tx.objectStore(name);
          return {
            get: (key: IDBValidKey) => source.get(key),
            put: (value: unknown) => {
              if (name === 'asset_owners') throw new Error('publication refused');
              if (!source.put) throw new Error('Expected writable fixture transaction.');
              return source.put(value);
            },
          };
        },
      };
    },
  };
  await expect(store().publish(definition)).rejects.toThrow('publication refused');
  expect(await db.count('editor_vector_library')).toBe(0);
  expect(await db.count('asset_refs')).toBe(0);
  expect(await db.count('asset_owners')).toBe(0);
  expect(state.journals.size).toBe(1);
  expect(state.bytes.size).toBe(1);
  state.database = db;
  const journal = [...state.journals.values()][0]!;
  await editorVectorPublicationAdapter.publish(journal);
  state.journals.delete(journal.journalId);
  const recovered = await store().publish(definition);
  expect(recovered.assetId).toBe(journal.assetRefs[0]!.assetId);
  expect(state.bytes.size).toBe(1);
});

it('holds pending opening validation and publication before exclusive restore or erasure admission', async () => {
  const { installPersistenceLockManagerForTests, runWithPersistentDataErasureBarrier } =
    await import('../infrastructure/mutation-barrier');
  let releaseShared!: () => void;
  let shared = 0;
  let erased = false;
  const drained = new Promise<void>((resolve) => {
    releaseShared = resolve;
  });
  installPersistenceLockManagerForTests({
    async request(_name, options, operation) {
      if (!_name.endsWith(':transition')) return operation({});
      if (options.mode === 'exclusive') {
        if (shared) await drained;
        return operation({});
      }
      shared++;
      try {
        return await operation({});
      } finally {
        if (--shared === 0) releaseShared();
      }
    },
  });
  let allowValidation!: () => void;
  let validationStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    validationStarted = resolve;
  });
  const validate = new Promise<void>((resolve) => {
    allowValidation = resolve;
  });
  try {
    const pending = createEditorVectorBackingStore({
      validateDefinition: async () => {
        validationStarted();
        await validate;
        return definition;
      },
    }).publish(definition);
    await started;
    const erase = runWithPersistentDataErasureBarrier(async () => {
      erased = true;
      expect((await db.getAllFromIndex('editor_vector_library', 'kind', 'definition')).length).toBe(
        1
      );
      await db.clear('editor_vector_library');
      await db.clear('asset_refs');
      await db.clear('asset_owners');
      state.bytes.clear();
    });
    expect(erased).toBe(false);
    allowValidation();
    await pending;
    await erase;
    expect(erased).toBe(true);
    expect(state.bytes.size).toBe(0);
    expect(await db.count('editor_vector_library')).toBe(0);
  } finally {
    installPersistenceLockManagerForTests(null);
  }
});
