import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import fixture from '../../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../../features/video/project/recording-events/blocks';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_EVENTS_STORE as STORE,
  ASSET_REFS_STORE as REFS,
  ASSET_OWNERS_STORE as OWNERS,
} from '../../infrastructure/indexed-db/core.stores';
import { createRecordingEventsStore } from './store';
import { RECORDING_EVENTS_SNAPSHOT_ROLE as ROLE } from './contracts';
import { isRecordingEventsSnapshot } from './guards';
import {
  recordingEventsStagingIdentity,
  retireJournalRecordingEventStagesInTransaction,
} from './staging';
import { openRecordingEventsStream, createRecordingEventsReader } from './reader';
import { stageRecordingEventsStream } from './snapshot';
import { admitStoredRecordingEventsBlock } from './guards';
import {
  linkRecordingEventsSnapshotInTransaction,
  publishStagedRecordingEventsInTransaction,
} from './publication';
import {
  retireRecordingEventsInTransaction,
  retireRecordingEventSourcesInTransaction,
} from './retirement';

const databases: { name: string; db: IDBPDatabase }[] = [];
let sequence = 0;
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  installPersistenceLockManagerForTests(null);
  for (const { db, name } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
async function setup() {
  const name = `events-publication-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ db, name });
  const store = createRecordingEventsStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = { recordingId: fixture.recordingId, eventStreamId: fixture.eventStreamId };
  const writer = await store.begin(identity);
  const packer = createRecordingEventsBlockPacker(identity.recordingId, identity.eventStreamId);
  const blocks = fixture.blocks.flatMap((block) =>
    block.value.records.flatMap((record) => packer.append(record))
  );
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, fixture.descriptor);
  const ref = {
    assetId: 'events-snapshot',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/events-snapshot' },
    mimeType: 'application/octet-stream',
    size: fixture.descriptor.totalBytes + fixture.descriptor.totalBlocks * 4,
    sha256: fixture.descriptor.streamSha256,
  };
  const owner = {
    assetId: ref.assetId,
    ownerKind: 'recording',
    ownerId: identity.recordingId,
    role: ROLE,
  };
  const transaction = async (operation: (tx: IndexedDbWriteTransaction) => Promise<void>) => {
    const tx = db.transaction([STORE, REFS, OWNERS], 'readwrite');
    void tx.done.catch(() => undefined);
    try {
      await operation(tx);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction can already be aborted by the failed operation.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  };
  return { db, store, identity, writer, ref, owner, blocks, transaction };
}

it('links the immutable file owner and finalized source atomically and retries without changing revision', async () => {
  const { db, store, identity, writer, ref, owner, transaction } = await setup();
  await transaction(async (tx) => {
    await tx.objectStore(REFS).put(ref);
    await tx.objectStore(OWNERS).put(owner);
    await linkRecordingEventsSnapshotInTransaction(tx, writer, ref.assetId);
  });
  const head = await store.getHead(identity);
  expect(head?.snapshotAssetId).toBe(ref.assetId);
  await transaction((tx) => linkRecordingEventsSnapshotInTransaction(tx, writer, ref.assetId));
  expect(await store.getHead(identity)).toEqual(head);
  expect(await db.get(OWNERS, ['recording', identity.recordingId, ROLE])).toEqual(owner);
  expect(
    isRecordingEventsSnapshot({ ref, sourceRecordingId: identity.recordingId }, fixture.descriptor)
  ).toBe(true);
  expect(
    isRecordingEventsSnapshot(
      { ref: { ...ref, size: ref.size + 1 }, sourceRecordingId: identity.recordingId },
      fixture.descriptor
    )
  ).toBe(false);
});

it.each(['hash', 'owner', 'stale'] as const)(
  'rolls back refs and owner when publication refuses %s',
  async (failure) => {
    const { db, store, identity, writer, ref, owner, transaction } = await setup();
    const head = await store.getHead(identity);
    await expect(
      transaction(async (tx) => {
        await tx
          .objectStore(REFS)
          .put(failure === 'hash' ? { ...ref, sha256: 'f'.repeat(64) } : ref);
        await tx
          .objectStore(OWNERS)
          .put(failure === 'owner' ? { ...owner, assetId: 'foreign' } : owner);
        await linkRecordingEventsSnapshotInTransaction(
          tx,
          failure === 'stale' ? { ...writer, writerGeneration: 'stale' } : writer,
          ref.assetId
        );
      })
    ).rejects.toThrow();
    expect(await db.get(REFS, ref.assetId)).toBeUndefined();
    expect(await db.get(OWNERS, ['recording', identity.recordingId, ROLE])).toBeUndefined();
    expect(await store.getHead(identity)).toEqual(head);
  }
);

it('retires source blocks and derived facts without touching another recording and fences delayed begin', async () => {
  const { db, store, identity, transaction } = await setup();
  const other = { recordingId: 'unrelated', eventStreamId: 'e'.repeat(32) };
  await store.begin(other);
  await transaction((tx) => retireRecordingEventSourcesInTransaction(tx, identity.recordingId));
  expect(await store.getHead(identity)).toBeNull();
  expect(await store.readBlock(identity, 0)).toBeNull();
  expect(
    await db.count(
      STORE,
      IDBKeyRange.bound(
        [identity.recordingId, identity.eventStreamId, 'block'],
        [identity.recordingId, identity.eventStreamId, 'head'],
        false,
        true
      )
    )
  ).toBe(0);
  expect(await store.getHead(other)).not.toBeNull();
  await expect(store.begin(identity)).rejects.toMatchObject({ code: 'retired' });
});

it(
  'creates a tombstone for a known pending source and rejects cleanup from its retired ' +
    'generation after restore',
  async () => {
    const { store, transaction } = await setup();
    const identity = { recordingId: 'not-yet-begun', eventStreamId: 'e'.repeat(32) };
    await transaction((tx) =>
      retireRecordingEventSourcesInTransaction(tx, identity.recordingId, identity.eventStreamId)
    );
    await expect(store.begin(identity)).rejects.toMatchObject({ code: 'retired' });
    const successor = await store.restore(identity);
    await expect(
      transaction((tx) =>
        retireRecordingEventsInTransaction(
          tx,
          identity,
          () => crypto.randomUUID(),
          'old-generation'
        )
      )
    ).rejects.toMatchObject({ code: 'stale-writer' });
    expect(await store.getHead(identity)).toMatchObject({
      writerGeneration: successor.writerGeneration,
      retired: false,
    });
  }
);

async function stage(input: Awaited<ReturnType<typeof setup>>) {
  const source = await openRecordingEventsStream(input.store, input.identity, fixture.descriptor);
  const identity = { ...input.identity, recordingId: 'private-import-stage' };
  return stageRecordingEventsStream({
    store: input.store,
    identity,
    sourceIdentity: source.source,
    source,
    stagingJournalId: 'import-journal',
  });
}

it(
  'publishes private original blocks and rebuilds interval facts for the local recording ' +
    'in one transaction',
  async () => {
    const input = await setup();
    const staged = await stage(input);
    const target = { recordingId: 'restored-recording', eventStreamId: staged.eventStreamId };
    await input.transaction(async (tx) => {
      const published = await publishStagedRecordingEventsInTransaction({
        tx,
        stagingWriter: staged,
        recordingId: target.recordingId,
        descriptor: fixture.descriptor,
        mintGeneration: () => crypto.randomUUID(),
      });
      expect(published.writerGeneration).not.toBe(staged.writerGeneration);
    });
    expect(await input.store.getHead(target)).toMatchObject({
      sourceRecordingId: input.identity.recordingId,
      streamSha256: fixture.descriptor.streamSha256,
      finalized: true,
    });
    expect(await input.store.getHead(staged)).toBeNull();
    expect(await input.store.getHead(input.identity)).not.toBeNull();
    expect(new TextDecoder().decode((await input.store.readBlock(target, 0))!.bytes)).toBe(
      fixture.blocks[0]!.utf8
    );
    const reader = createRecordingEventsReader({ database: async () => input.db });
    const page = await reader.readPage({
      identity: target,
      descriptor: fixture.descriptor,
      fromTimeUs: 0,
      toTimeUs: 9000000,
    });
    expect(page.facts.length).toBeGreaterThan(0);
    expect(
      page.facts.every(
        (fact) =>
          fact.recordingId === target.recordingId &&
          fact.timeBuckets.every((bucket) => bucket[0] === target.recordingId)
      )
    ).toBe(true);
    await expect(input.store.begin(staged)).rejects.toMatchObject({ code: 'retired' });
  }
);

it.each(['stale', 'live-target', 'unmarked-source'] as const)(
  'refuses %s publication without retiring valid source data',
  async (refusal) => {
    const input = await setup();
    const staged = refusal === 'unmarked-source' ? input.writer : await stage(input);
    const target = { recordingId: 'restored-recording', eventStreamId: staged.eventStreamId };
    if (refusal === 'live-target') await input.store.begin(target);
    const before = await input.store.getHead(staged);
    await expect(
      input.transaction((tx) =>
        publishStagedRecordingEventsInTransaction({
          tx,
          stagingWriter: refusal === 'stale' ? { ...staged, writerGeneration: 'stale' } : staged,
          recordingId: target.recordingId,
          descriptor: fixture.descriptor,
          mintGeneration: () => crypto.randomUUID(),
        }).then(() => undefined)
      )
    ).rejects.toThrow();
    expect(await input.store.getHead(staged)).toEqual(before);
    expect(await input.store.readBlock(staged, 0)).not.toBeNull();
  }
);

it('rolls back all destination rows when original private bytes fail integrity', async () => {
  const input = await setup();
  const staged = await stage(input);
  const head = await input.store.getHead(staged);
  if (!head) throw new Error('Missing private source.');
  const { row } = admitStoredRecordingEventsBlock(
    await input.db.get(STORE, [staged.recordingId, staged.eventStreamId, 'block', 0]),
    head
  );
  const first = row.bytes[0];
  if (first === undefined) throw new Error('Missing block bytes.');
  row.bytes[0] = first ^ 1;
  await input.db.put(STORE, row);
  const target = { recordingId: 'restored-recording', eventStreamId: staged.eventStreamId };
  await expect(
    input.transaction((tx) =>
      publishStagedRecordingEventsInTransaction({
        tx,
        stagingWriter: staged,
        recordingId: target.recordingId,
        descriptor: fixture.descriptor,
        mintGeneration: () => crypto.randomUUID(),
      }).then(() => undefined)
    )
  ).rejects.toMatchObject({ code: 'integrity' });
  expect(await input.store.getHead(target)).toBeNull();
  expect(
    await input.db.count(STORE, IDBKeyRange.bound([target.recordingId], [target.recordingId, []]))
  ).toBe(0);
  expect(await input.store.getHead(staged)).toEqual(head);
  expect(await input.store.getHead(input.identity)).not.toBeNull();
});

it('cleans only journal-marked private attempts and preserves a published target with the same namespace', async () => {
  const input = await setup();
  const prepare = async (journalId: string, attempt: string) => {
    const base = recordingEventsStagingIdentity(journalId, input.identity);
    const source = await openRecordingEventsStream(input.store, input.identity, fixture.descriptor);
    return stageRecordingEventsStream({
      store: input.store,
      identity: { ...base, recordingId: `${base.recordingId}:${attempt}` },
      sourceIdentity: source.source,
      source,
      stagingJournalId: journalId,
    });
  };
  const first = await prepare('journal-one', 'first');
  const base = recordingEventsStagingIdentity('journal-one', input.identity);
  const target = { ...base, recordingId: `${base.recordingId}:published` };
  await input.transaction((tx) =>
    publishStagedRecordingEventsInTransaction({
      tx,
      stagingWriter: first,
      recordingId: target.recordingId,
      descriptor: fixture.descriptor,
      mintGeneration: () => crypto.randomUUID(),
    }).then(() => undefined)
  );
  const pending = await prepare('journal-one', 'pending');
  const other = await prepare('journal-two', 'pending');
  await input.transaction((tx) =>
    retireJournalRecordingEventStagesInTransaction(tx, 'journal-one')
  );
  expect(await input.store.getHead(pending)).toBeNull();
  expect(await input.store.getHead(target)).toMatchObject({ finalized: true, retired: false });
  expect(await input.store.readBlock(target, 0)).not.toBeNull();
  expect(await input.store.getHead(other)).not.toBeNull();
  expect(await input.store.getHead(input.identity)).not.toBeNull();
});

it('fences an unknown stream ID when the recording is deleted before its first begin', async () => {
  const input = await setup();
  const identity = {
    recordingId: 'deleted-before-stream-admission',
    eventStreamId: 'e'.repeat(32),
  };
  await input.transaction((tx) =>
    retireRecordingEventSourcesInTransaction(tx, identity.recordingId)
  );
  await expect(input.store.begin(identity)).rejects.toMatchObject({ code: 'retired' });
  expect(await input.store.getHead(identity)).toBeNull();
});
