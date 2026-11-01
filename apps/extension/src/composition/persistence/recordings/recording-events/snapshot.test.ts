import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import fixtureData from '../../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../../features/video/project/recording-events/blocks';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import { DB_VERSION } from '../../infrastructure/indexed-db/core.stores';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  discardPreparedAsset,
  readAssetFile,
  listWritingAssetIds,
  listAssetObjectIds,
} from '../../assets/opfs-store';
import {
  createHarness,
  MemoryDirectoryHandle,
  MemoryFileHandle,
} from '../../assets/opfs-store.test-support';
import { createRecordingEventsStore } from './store';
import { prepareRecordingEventsSnapshot, stageRecordingEventsStream } from './snapshot';
import { openRecordingEventsStream } from './reader';

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

async function fixture() {
  const name = `events-snapshot-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ db, name });
  const store = createRecordingEventsStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = {
    recordingId: fixtureData.recordingId,
    eventStreamId: fixtureData.eventStreamId,
  };
  const writer = await store.begin(identity);
  const packer = createRecordingEventsBlockPacker(identity.recordingId, identity.eventStreamId);
  const blocks = fixtureData.blocks.flatMap((block) =>
    block.value.records.flatMap((record) => packer.append(record))
  );
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  const descriptor = fixtureData.descriptor;
  await store.finalize(writer, descriptor);
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const file = new MemoryFileHandle();
  objects.entriesByName.set('asset-1', file);
  assetRoot.entriesByName.set('objects', objects);
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  return { store, identity, writer, descriptor, blocks, harness, file };
}

it('prepares and verifies exact native bytes while retaining the source writer precondition', async () => {
  const { store, identity, writer, descriptor, harness } = await fixture();
  const prepared = await prepareRecordingEventsSnapshot(
    { store, identity, descriptor },
    harness.options
  );
  try {
    const file = await readAssetFile(prepared.ref, 'events.bin', harness.options);
    const actual = Array.from(sha256(new Uint8Array(await file.arrayBuffer())), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    expect(actual).toBe(descriptor.streamSha256);
    expect(prepared.ref.sha256).toBe(actual);
    expect(prepared.ref.size).toBe(descriptor.totalBytes + descriptor.totalBlocks * 4);
    expect(prepared.writer).toEqual(writer);
    expect(prepared.sourceRecordingId).toBe(identity.recordingId);
    expect(await listWritingAssetIds(harness.options)).toContain(prepared.ref.assetId);
  } finally {
    await discardPreparedAsset(prepared.ref.assetId, harness.options);
  }
  expect((await store.getHead(identity))?.finalized).toBe(true);
});

it.each(['write', 'close', 'corruption', 'cancelled'] as const)(
  'removes only the unpublished snapshot after %s failure',
  async (failure) => {
    const { store, identity, descriptor, harness, file, blocks } = await fixture();
    const head = await store.getHead(identity);
    const controller = new AbortController();
    if (failure === 'write')
      file.writeEffect = async () => {
        throw new Error('Write refused');
      };
    if (failure === 'close')
      file.closeEffect = async () => {
        throw new Error('Close refused');
      };
    if (failure === 'cancelled')
      file.afterCommitCloseEffect = async () => {
        controller.abort();
      };
    if (failure === 'corruption')
      file.afterCommitCloseEffect = async () => {
        file.afterCommitCloseEffect = async () => {};
        const output = await file.createWritable();
        await output.write(new Uint8Array(descriptor.totalBytes + descriptor.totalBlocks * 4));
        await output.close();
      };
    await expect(
      prepareRecordingEventsSnapshot(
        { store, identity, descriptor, signal: controller.signal },
        harness.options
      )
    ).rejects.toThrow();
    expect(await listWritingAssetIds(harness.options)).toEqual([]);
    expect(await listAssetObjectIds(harness.options)).toEqual([]);
    expect(await store.getHead(identity)).toEqual(head);
    expect((await store.readBlock(identity, 0))?.entry.blockSha256).toBe(
      blocks[0]!.entry.blockSha256
    );
  }
);

it('refuses publication preparation when the source retires during OPFS finalization', async () => {
  const { store, identity, descriptor, harness, file } = await fixture();
  file.afterCommitCloseEffect = async () => {
    await store.retire(identity);
  };
  await expect(
    prepareRecordingEventsSnapshot({ store, identity, descriptor }, harness.options)
  ).rejects.toMatchObject({ code: 'stale-writer' });
  expect(await listAssetObjectIds(harness.options)).toEqual([]);
  expect(await listWritingAssetIds(harness.options)).toEqual([]);
  expect(await store.getHead(identity)).toBeNull();
});

it('stages original events under a private identity without changing the canonical recording ID', async () => {
  const { store, identity, descriptor } = await fixture();
  const source = await openRecordingEventsStream(store, identity, descriptor);
  const target = { ...identity, recordingId: 'private-events-stage' };
  const staged = await stageRecordingEventsStream({
    store,
    identity: target,
    sourceIdentity: source.source,
    source,
    stagingJournalId: 'publication-journal',
  });
  expect(await store.getHead(target)).toMatchObject({
    ...staged,
    sourceRecordingId: identity.recordingId,
    stagingJournalId: 'publication-journal',
    finalized: true,
    streamSha256: descriptor.streamSha256,
  });
  expect(new TextDecoder().decode((await store.readBlock(target, 0))!.bytes)).toBe(
    fixtureData.blocks[0]!.utf8
  );
});

it('retires only its private stage after a source refuses before close and preserves the public source', async () => {
  const { store, identity, descriptor } = await fixture();
  const source = await openRecordingEventsStream(store, identity, descriptor);
  const target = { ...identity, recordingId: 'failed-events-stage' };
  await expect(
    stageRecordingEventsStream({
      store,
      identity: target,
      sourceIdentity: source.source,
      source: {
        size: source.size,
        async pipeTo() {
          throw new Error('Source refused.');
        },
      },
    })
  ).rejects.toThrow('Source refused.');
  expect(await store.getHead(target)).toBeNull();
  expect(await store.getHead(identity)).toMatchObject({
    finalized: true,
    streamSha256: descriptor.streamSha256,
  });
});

it('refuses a stage over its canonical source before opening any new writer', async () => {
  const { store, identity, descriptor } = await fixture();
  const source = await openRecordingEventsStream(store, identity, descriptor);
  const head = await store.getHead(identity);
  await expect(
    stageRecordingEventsStream({ store, identity, sourceIdentity: source.source, source })
  ).rejects.toMatchObject({ code: 'integrity' });
  expect(await store.getHead(identity)).toEqual(head);
});

it('fences deletion and exact same-identity recreation after file close', async () => {
  const { store, identity, descriptor, harness, file, blocks, writer } = await fixture();
  let successorGeneration: string | undefined;
  file.afterCommitCloseEffect = async () => {
    await store.retire(identity);
    const successor = await store.restore(identity);
    successorGeneration = successor.writerGeneration;
    for (const block of blocks) await store.append(successor, block);
    await store.finalize(successor, descriptor);
  };
  await expect(
    prepareRecordingEventsSnapshot({ store, identity, descriptor }, harness.options)
  ).rejects.toMatchObject({ code: 'stale-writer' });
  expect(successorGeneration).not.toBe(writer.writerGeneration);
  expect(await store.getHead(identity)).toMatchObject({
    writerGeneration: successorGeneration,
    finalized: true,
    streamSha256: descriptor.streamSha256,
  });
  expect(await listWritingAssetIds(harness.options)).toEqual([]);
  expect(await listAssetObjectIds(harness.options)).toEqual([]);
});
