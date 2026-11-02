import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createCursorTrajectoryBlockPacker } from '../../../../features/video/project/cursor-trajectory/blocks';
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
import { createRecordingCursorTrajectoryStore } from './store';
import {
  prepareRecordingCursorTrajectorySnapshot,
  stageRecordingCursorTrajectoryStream,
} from './snapshot';
import { openRecordingCursorTrajectoryStream } from './reader';

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
  const name = `cursor-snapshot-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ db, name });
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  const identity = { recordingId: 'snapshot-source', trajectoryId: 'a'.repeat(32) };
  const writer = await store.begin(identity, { width: 160, height: 90 });
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = [];
  blocks.push(
    ...packer.append({
      kind: 'segment',
      segmentId: 0,
      activeTimeUs: 0,
      width: 160,
      height: 90,
      reason: 'start',
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    })
  );
  blocks.push(
    ...packer.append({
      kind: 'sample',
      segmentId: 0,
      observationSeq: 0,
      activeTimeUs: 1000,
      xQ8: 256,
      yQ8: 512,
      visible: true,
      observed: true,
      event: 'move',
      button: 'none',
      relatedObservationSeq: null,
      anchors: [],
    })
  );
  blocks.push(
    ...packer.append({ kind: 'boundary', segmentId: 0, activeTimeUs: 2000, reason: 'stop' })
  );
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, packer.summary(), 'complete');
  const descriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...packer.summary(),
  };
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
  const prepared = await prepareRecordingCursorTrajectorySnapshot(
    { store, identity, descriptor },
    harness.options
  );
  try {
    const file = await readAssetFile(prepared.ref, 'cursor.bin', harness.options);
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
      prepareRecordingCursorTrajectorySnapshot(
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
    prepareRecordingCursorTrajectorySnapshot({ store, identity, descriptor }, harness.options)
  ).rejects.toMatchObject({ code: 'stale-writer' });
  expect(await listAssetObjectIds(harness.options)).toEqual([]);
  expect(await listWritingAssetIds(harness.options)).toEqual([]);
  expect(await store.getHead(identity)).toBeNull();
});

it('stages a verified cursor stream under a private identity and retains the exact original bytes', async () => {
  const { store, identity, descriptor, blocks } = await fixture();
  const originalHead = await store.getHead(identity);
  const stream = await openRecordingCursorTrajectoryStream(store, identity, descriptor);
  const target = { ...identity, recordingId: 'private-cursor-stage' };
  const staged = await stageRecordingCursorTrajectoryStream({
    store,
    identity: target,
    sourceIdentity: stream.source,
    source: stream,
    stagingJournalId: 'cursor-stage-journal',
  });
  expect(await store.getHead(target)).toMatchObject({
    ...staged,
    sourceRecordingId: identity.recordingId,
    stagingJournalId: 'cursor-stage-journal',
    finalized: true,
    streamSha256: descriptor.streamSha256,
    totalBlocks: descriptor.totalBlocks,
  });
  expect((await store.readBlock(target, 0, staged.writerGeneration))?.bytes).toEqual(
    blocks[0]!.bytes
  );
  expect(await store.getHead(identity)).toEqual(originalHead);
});

it.each(['source', 'finalize', 'cleanup'] as const)(
  'retires only the private cursor stream after a %s failure and preserves the original',
  async (failure) => {
    const { store, identity, descriptor, blocks } = await fixture();
    const originalHead = await store.getHead(identity);
    const stream = await openRecordingCursorTrajectoryStream(store, identity, descriptor);
    const target = { ...identity, recordingId: 'failed-cursor-stage' };
    const failureMessage = 'Cursor stage source failed';
    const result = stageRecordingCursorTrajectoryStream({
      store: {
        ...store,
        async finalize(...args: Parameters<typeof store.finalize>) {
          if (failure === 'finalize') throw new Error('Cursor stage finalization failed');
          return store.finalize(...args);
        },
        async retire(...args: Parameters<typeof store.retire>) {
          await store.retire(...args);
          if (failure === 'cleanup') throw new Error('Cursor stage cleanup failed');
        },
      },
      identity: target,
      sourceIdentity: stream.source,
      source: {
        size: stream.size,
        async pipeTo(sink, signal) {
          await stream.pipeTo(sink, signal);
          if (failure !== 'finalize') throw new Error(failureMessage);
        },
      },
    });
    if (failure === 'cleanup') {
      await expect(result).rejects.toMatchObject({
        name: 'AggregateError',
        errors: [new Error(failureMessage), new Error('Cursor stage cleanup failed')],
      });
    } else {
      await expect(result).rejects.toThrow(
        failure === 'source' ? failureMessage : 'Cursor stage finalization failed'
      );
    }
    expect(await store.getHead(target)).toBeNull();
    expect(await store.readBlock(target, 0)).toBeNull();
    expect(await store.getHead(identity)).toEqual(originalHead);
    expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]!.bytes);
  }
);

it('rejects an incorrect cursor stream size before creating its private head', async () => {
  const { store, identity, descriptor } = await fixture();
  const stream = await openRecordingCursorTrajectoryStream(store, identity, descriptor);
  const target = { ...identity, recordingId: 'invalid-cursor-stage' };
  await expect(
    stageRecordingCursorTrajectoryStream({
      store,
      identity: target,
      sourceIdentity: stream.source,
      source: { ...stream, size: stream.size + 1 },
    })
  ).rejects.toMatchObject({ code: 'integrity' });
  expect(await store.getHead(target)).toBeNull();
  expect((await store.getHead(identity))?.finalized).toBe(true);
});
