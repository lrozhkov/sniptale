import { beforeEach, expect, it, vi } from 'vitest';
import type { AssetReadyJournal, AssetRef, PhysicalDeleteAssetOperation } from './contracts';

const storage = vi.hoisted(() => ({
  deleteJournalFailures: 0,
  deleteObjectFailures: 0,
  deleteOperationFailures: 0,
  journals: new Map<string, AssetReadyJournal>(),
  objects: new Set<string>(),
  operations: new Map<string, PhysicalDeleteAssetOperation>(),
  owners: new Map<string, string>(),
  refs: new Set<string>(),
  writing: new Set<string>(),
}));

vi.mock('./opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs-store')>()),
  deleteAssetObject: vi.fn(async (assetId: string) => {
    if (storage.deleteObjectFailures > 0) {
      storage.deleteObjectFailures -= 1;
      throw new Error('injected object deletion interruption');
    }
    storage.objects.delete(assetId);
  }),
  deleteReadyJournal: vi.fn(async (journalId: string) => {
    if (storage.deleteJournalFailures > 0) {
      storage.deleteJournalFailures -= 1;
      throw new Error('injected journal cleanup interruption');
    }
    storage.journals.delete(journalId);
  }),
  listReadyJournals: vi.fn(async () => [...storage.journals.values()]),
  releaseAssetPublicationTransitions: vi.fn(async () => undefined),
  writeReadyJournal: vi.fn(async (journal: AssetReadyJournal) => {
    storage.journals.set(journal.journalId, journal);
  }),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: vi.fn(async (effect) =>
    effect({
      delete: async (_store: string, operationId: string) => {
        if (storage.deleteOperationFailures > 0) {
          storage.deleteOperationFailures -= 1;
          throw new Error('injected delete-intent cleanup interruption');
        }
        storage.operations.delete(operationId);
      },
    })
  ),
}));

import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from './operations';
import { createAssetPublicationJournal, publishReadyJournalWithRetry } from './publication';
import { recoverStandaloneAssetPublications } from './recovery';

const SEED_COUNT = 64;
const TRANSITIONS_PER_SEED = 40;
const PUBLICATION_DOMAIN = 'fault-state-machine';

type Interruption =
  | 'after-idb-commit'
  | 'after-object-delete'
  | 'after-object-marker'
  | 'after-ready-journal'
  | 'before-idb-commit'
  | 'before-object-delete'
  | 'before-ready-cleanup'
  | 'none';

const interruptions: readonly Interruption[] = [
  'after-object-marker',
  'after-ready-journal',
  'before-idb-commit',
  'after-idb-commit',
  'before-ready-cleanup',
  'before-object-delete',
  'after-object-delete',
  'none',
];

function resetStorage(): void {
  storage.deleteJournalFailures = 0;
  storage.deleteObjectFailures = 0;
  storage.deleteOperationFailures = 0;
  storage.journals.clear();
  storage.objects.clear();
  storage.operations.clear();
  storage.owners.clear();
  storage.refs.clear();
  storage.writing.clear();
}

function nextRandom(state: number): number {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
}

function createRef(assetId: string): AssetRef {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'application/octet-stream',
    sha256: null,
    size: 1,
  };
}

function publishJournal(journal: AssetReadyJournal): void {
  const ownerId = (journal.payload as { ownerId: string }).ownerId;
  const assetId = journal.assetRefs[0]?.assetId;
  if (!assetId) throw new Error('fault journal has no asset ref');
  const existing = storage.owners.get(ownerId);
  if (existing !== undefined && existing !== assetId) {
    throw new Error('fault publication attempted dual owner authority');
  }
  storage.refs.add(assetId);
  storage.owners.set(ownerId, assetId);
}

function assertInvariant(): void {
  const journalAssets = new Set(
    [...storage.journals.values()].flatMap((journal) => journal.assetRefs.map((ref) => ref.assetId))
  );
  const pendingDeleteAssets = new Set(
    [...storage.operations.values()].flatMap((operation) => operation.assetIds)
  );
  const ownedAssets = new Set(storage.owners.values());

  if (new Set(storage.owners.values()).size !== storage.owners.size) {
    throw new Error('two domain owners published the same immutable object');
  }
  for (const assetId of ownedAssets) {
    if (!storage.refs.has(assetId)) throw new Error(`published owner has no ref: ${assetId}`);
    if (!storage.objects.has(assetId)) throw new Error(`published owner has no object: ${assetId}`);
  }
  for (const assetId of storage.refs) {
    if (!ownedAssets.has(assetId)) throw new Error(`asset ref has no owner: ${assetId}`);
    if (!storage.objects.has(assetId)) throw new Error(`asset ref has no object: ${assetId}`);
  }
  for (const assetId of storage.objects) {
    if (
      !ownedAssets.has(assetId) &&
      !storage.writing.has(assetId) &&
      !journalAssets.has(assetId) &&
      !pendingDeleteAssets.has(assetId)
    ) {
      throw new Error(`physical object has no reachable recovery authority: ${assetId}`);
    }
  }
}

async function recoverPublications(): Promise<void> {
  await recoverStandaloneAssetPublications([
    {
      domain: PUBLICATION_DOMAIN,
      publish: async (journal) => publishJournal(journal),
    },
  ]);
}

async function publishWithInterruption(
  ownerId: string,
  assetId: string,
  interruption: Interruption
): Promise<void> {
  storage.objects.add(assetId);
  storage.writing.add(assetId);
  assertInvariant();
  if (interruption === 'after-object-marker') {
    storage.objects.delete(assetId);
    storage.writing.delete(assetId);
    return;
  }

  storage.writing.delete(assetId);
  const journal = await createAssetPublicationJournal({
    assetRefs: [createRef(assetId)],
    domain: PUBLICATION_DOMAIN,
    payload: { ownerId },
  });
  assertInvariant();
  if (interruption === 'after-ready-journal') {
    await recoverPublications();
    return;
  }

  let remainingPublicationFailures =
    interruption === 'before-idb-commit' || interruption === 'after-idb-commit' ? 3 : 0;
  if (interruption === 'before-ready-cleanup') storage.deleteJournalFailures = 1;
  const publish = async (candidate: AssetReadyJournal): Promise<void> => {
    if (interruption === 'after-idb-commit') publishJournal(candidate);
    if (remainingPublicationFailures > 0) {
      remainingPublicationFailures -= 1;
      throw new Error('injected publication interruption');
    }
    publishJournal(candidate);
  };
  await publishReadyJournalWithRetry(journal, publish).catch(() => undefined);
  assertInvariant();
  await recoverPublications();
}

async function deleteWithInterruption(ownerId: string, interruption: Interruption): Promise<void> {
  const assetId = storage.owners.get(ownerId);
  if (!assetId) return;
  storage.owners.delete(ownerId);
  storage.refs.delete(assetId);
  const operation = buildPhysicalDeleteOperation([assetId, assetId]);
  storage.operations.set(operation.operationId, operation);
  if (interruption === 'before-object-delete') storage.deleteObjectFailures = 1;
  if (interruption === 'after-object-delete') storage.deleteOperationFailures = 1;
  await completePhysicalDeleteOperation(operation).catch(() => undefined);
  assertInvariant();
  if (storage.operations.has(operation.operationId)) {
    await completePhysicalDeleteOperation(operation);
  }
}

beforeEach(resetStorage);

it('converges publication and physical deletion across 64 seeded interruption histories', async () => {
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    resetStorage();
    let random = seed;
    const liveOwners: string[] = [];
    for (let transition = 0; transition < TRANSITIONS_PER_SEED; transition += 1) {
      random = nextRandom(random);
      const interruption = interruptions[random % interruptions.length]!;
      const ownerId = `owner-${seed}-${transition}`;
      const assetId = `asset-${seed}-${transition}`;
      await publishWithInterruption(ownerId, assetId, interruption);
      if (storage.owners.has(ownerId)) liveOwners.push(ownerId);

      random = nextRandom(random);
      if (liveOwners.length > 0 && random % 3 === 0) {
        const deleteIndex = random % liveOwners.length;
        const [deletedOwner] = liveOwners.splice(deleteIndex, 1);
        await deleteWithInterruption(deletedOwner!, interruption);
      }
      assertInvariant();
    }

    await recoverPublications();
    for (const operation of [...storage.operations.values()]) {
      await completePhysicalDeleteOperation(operation);
    }
    assertInvariant();
    expect(storage.journals.size).toBe(0);
    expect(storage.operations.size).toBe(0);
    expect(storage.writing.size).toBe(0);
  }
});
