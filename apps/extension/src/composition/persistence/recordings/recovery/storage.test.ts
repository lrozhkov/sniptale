import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const faults = { strict: true, block: false };
  const sessions = new Map<string, unknown>();
  const blocks = new Map<string, unknown>();
  const transaction = vi.fn(
    (names: string | string[], mode?: string, options?: { durability: string }) => {
      void names;
      void mode;
      void options;
      const snapshotSessions = new Map(sessions);
      const snapshotBlocks = new Map(blocks);
      const store = (name: string) => {
        const map = name === 'recording_recovery_sessions' ? sessions : blocks;
        const key = (value: unknown) => JSON.stringify(value);
        return {
          async get(id: unknown) {
            return structuredClone(map.get(key(id)));
          },
          async add(raw: Record<string, unknown>) {
            if (name === 'recording_recovery_blocks' && faults.block)
              throw new Error('Disk unavailable');
            const id =
              name === 'recording_recovery_sessions' ? raw['id'] : [raw['id'], raw['index']];
            if (map.has(key(id))) throw new Error('ConstraintError');
            map.set(key(id), structuredClone(raw));
          },
          async put(raw: Record<string, unknown>) {
            map.set(key(raw['id']), structuredClone(raw));
          },
          async delete(id: unknown) {
            map.delete(key(id));
          },
          async getAll() {
            return [...map.values()];
          },
          index() {
            return {
              async getAllKeys(id: string) {
                return [...map.values()].flatMap((value) => {
                  if (
                    typeof value === 'object' &&
                    value !== null &&
                    'id' in value &&
                    'index' in value &&
                    value.id === id
                  )
                    return [[id, value.index]];
                  return [];
                });
              },
            };
          },
        };
      };
      return {
        durability: faults.strict ? (options?.durability ?? 'default') : 'relaxed',
        store: store('recording_recovery_sessions'),
        objectStore: store,
        done: Promise.resolve(),
        abort() {
          sessions.clear();
          blocks.clear();
          for (const [key, value] of snapshotSessions) sessions.set(key, value);
          for (const [key, value] of snapshotBlocks) blocks.set(key, value);
        },
      };
    }
  );
  const db = {
    transaction,
    async get(name: string, key: unknown) {
      return transaction(name).objectStore(name).get(key);
    },
    async getAll() {
      return [...sessions.values()];
    },
  };
  return { sessions, blocks, transaction, db, faults };
});
vi.mock('../../assets', () => ({
  createAssetObjectWriter: vi.fn(async () => ({
    assetId: 'copy',
    append: vi.fn(async () => undefined),
    finalize: vi.fn(async () => ({ ref: { assetId: 'copy', size: 3, mimeType: 'video/webm' } })),
    abort: vi.fn(async () => undefined),
  })),
  readAssetFile: vi.fn(),
  discardPreparedAsset: vi.fn(),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  releaseAssetReadyProtection: vi.fn(async () => undefined),
  isAssetReadyProtected: vi.fn(() => false),
}));
vi.mock('../../infrastructure/indexed-db/core', () => ({
  initDB: async () => state.db,
  RECORDING_RECOVERY_SESSIONS_STORE: 'recording_recovery_sessions',
  RECORDING_RECOVERY_BLOCKS_STORE: 'recording_recovery_blocks',
}));
vi.mock('../../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: typeof state.db) => Promise<unknown>) =>
    operation(state.db),
}));
import * as assets from '../../assets';
import { createRecordingStagingCoordinator } from '../staging/coordinator';
import { createPreparedRecordingAssetForTest } from '../staging/test-support';
import { createDurableRecordingWriter } from '../staging/durable-writer';
import {
  readRecoveryRecording,
  deleteRecoveryRecording,
  listRecoverableRecordings,
  withRecoveryRecording,
} from './index';
import {
  parseRecoveryRecording,
  RECORDING_RECOVERY_BLOCK_BYTES,
  initializeRecoveryEpoch,
  openRecoverySession,
  commitRecoveryBlock,
  completeRecoverySession,
  streamRecoveryRecording,
  assertRecoveryIdentity,
} from './storage';

async function open(id = 'source') {
  const epoch = await initializeRecoveryEpoch();
  return openRecoverySession(
    { artifactId: id, filename: 'source.webm', mimeType: 'video/webm' },
    epoch
  );
}
async function read(entry: Awaited<ReturnType<typeof open>>) {
  const result: number[] = [];
  const reader = streamRecoveryRecording(entry).getReader();
  for (;;) {
    const block = await reader.read();
    if (block.done) break;
    result.push(...block.value);
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  const locks = new Set<string>();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        options: { ifAvailable?: boolean },
        operation: (lock: unknown) => Promise<unknown>
      ) => {
        if (locks.has(name)) {
          if (options.ifAvailable) return operation(null);
          throw new Error('Lock already held in test');
        }
        locks.add(name);
        try {
          return await operation({ name });
        } finally {
          locks.delete(name);
        }
      },
    },
  });
  state.faults.strict = true;
  state.faults.block = false;
  state.sessions.clear();
  state.blocks.clear();
  state.transaction.mockClear();
});
describe('recording recovery storage', () => {
  it('refuses browsers that do not honor strict durability before writing', async () => {
    state.faults.strict = false;
    await expect(initializeRecoveryEpoch()).rejects.toThrow('Strict');
    expect(state.sessions.size).toBe(0);
  });
  it('retains actual durable writer blocks after failure, abort and reopen', async () => {
    const epoch = await initializeRecoveryEpoch();
    const writer = await createDurableRecordingWriter(
      { artifactId: 'source', filename: 'source.webm', mimeType: 'video/webm' },
      epoch
    );
    await writer.append(new Blob([new Uint8Array([1, 2, 3])]));
    expect(await listRecoverableRecordings()).toEqual([]);
    await expect(
      withRecoveryRecording('source', writer.recoverySource.incarnation, async () => undefined)
    ).rejects.toThrow('active');
    state.faults.block = true;
    await expect(writer.append(new Blob([new Uint8Array([4])]))).rejects.toThrow(
      'Disk unavailable'
    );
    const writes = state.transaction.mock.calls.length;
    await writer.abort();
    expect(state.transaction.mock.calls.length).toBe(writes);
    const [entry] = await listRecoverableRecordings();
    expect(await read(entry!)).toEqual([1, 2, 3]);
  });
  it('retains original bytes after finalize and failed publication cleanup', async () => {
    const epoch = await initializeRecoveryEpoch();
    const writer = await createDurableRecordingWriter(
      { artifactId: 'source', filename: 'source.webm', mimeType: 'video/webm' },
      epoch
    );
    await writer.append(new Blob([new Uint8Array([1, 2, 3])]));
    await writer.finalize();
    await writer.abort();
    const [entry] = await listRecoverableRecordings();
    expect(entry?.complete).toBe(true);
    expect(entry?.published).toBe(false);
    expect(await read(entry!)).toEqual([1, 2, 3]);
  });
  it('rejects corrupt headers and bounds durable blocks', () => {
    expect(parseRecoveryRecording({ id: 'one', blockCount: -1 })).toBeNull();
    expect(parseRecoveryRecording({ id: '@epoch', token: 'epoch' })).toBeNull();
    expect(RECORDING_RECOVERY_BLOCK_BYTES).toBe(4 * 1024 * 1024);
  });
  it('preserves acknowledged prefix and incomplete suffix after writer failure and reopen', async () => {
    const entry = await open();
    await commitRecoveryBlock(entry, new Uint8Array([1, 2]).buffer);
    await commitRecoveryBlock(entry, new Uint8Array([3]).buffer);
    await expect(
      commitRecoveryBlock(entry, new ArrayBuffer(RECORDING_RECOVERY_BLOCK_BYTES + 1))
    ).rejects.toThrow('size');
    const reopened = parseRecoveryRecording(
      await state.db.get('recording_recovery_sessions', entry.id)
    );
    expect(reopened).not.toBeNull();
    expect(await read(reopened!)).toEqual([1, 2, 3]);
    for (const [, mode, options] of state.transaction.mock.calls)
      if (mode === 'readwrite') expect(options?.durability).toBe('strict');
  });
  it('keeps independent parallel writers and refuses same-identity replacement', async () => {
    await initializeRecoveryEpoch();
    const [first, second] = await Promise.all([open('first'), open('second')]);
    await Promise.all([
      commitRecoveryBlock(first, new Uint8Array([1]).buffer),
      commitRecoveryBlock(second, new Uint8Array([2]).buffer),
    ]);
    expect(await read(first)).toEqual([1]);
    expect(await read(second)).toEqual([2]);
    await expect(open('first')).rejects.toThrow('ConstraintError');
  });
  it('refuses opening captured before erasure with a missing or replaced epoch', async () => {
    const epoch = await initializeRecoveryEpoch();
    state.sessions.clear();
    await expect(
      openRecoverySession(
        { artifactId: 'old', filename: 'old.webm', mimeType: 'video/webm' },
        epoch
      )
    ).rejects.toThrow('epoch');
    await initializeRecoveryEpoch();
    await expect(
      openRecoverySession(
        { artifactId: 'old', filename: 'old.webm', mimeType: 'video/webm' },
        epoch
      )
    ).rejects.toThrow('epoch');
  });
  it('refuses delayed append after deletion and after same-identity recreation', async () => {
    const old = await open();
    await commitRecoveryBlock(old, new Uint8Array([1]).buffer);
    state.sessions.delete(JSON.stringify(old.id));
    state.blocks.clear();
    await expect(commitRecoveryBlock(old, new Uint8Array([2]).buffer)).rejects.toThrow('stale');
    const fresh = await open();
    await commitRecoveryBlock(fresh, new Uint8Array([3]).buffer);
    await expect(commitRecoveryBlock(old, new Uint8Array([4]).buffer)).rejects.toThrow('stale');
    expect(await read(fresh)).toEqual([3]);
  });
  it('refuses stale sequence retries without duplicating committed bytes', async () => {
    const entry = await open();
    const stale = { ...entry };
    await commitRecoveryBlock(entry, new Uint8Array([1]).buffer);
    await expect(commitRecoveryBlock(stale, new Uint8Array([1]).buffer)).rejects.toThrow('stale');
    expect(await read(entry)).toEqual([1]);
  });
  it('keeps every block after completion and rejects further append', async () => {
    const entry = await open();
    await commitRecoveryBlock(entry, new Uint8Array([1, 2]).buffer);
    await completeRecoverySession(entry);
    await completeRecoverySession(entry);
    await expect(commitRecoveryBlock(entry, new Uint8Array([3]).buffer)).rejects.toThrow('stale');
    expect(await read(entry)).toEqual([1, 2]);
  });
  it('rejects old readers after erasure without recreating metadata', async () => {
    const entry = await open();
    state.sessions.clear();
    state.blocks.clear();
    await expect(assertRecoveryIdentity(entry)).rejects.toThrow('stale');
    await expect(read(entry)).rejects.toThrow('stale');
    expect(state.sessions.size).toBe(0);
  });
});

function outputWriter() {
  const chunks: Blob[] = [];
  return {
    assetId: 'snapshot',
    chunks,
    append: vi.fn(async (chunk: Blob) => {
      chunks.push(chunk);
    }),
    finalize: vi.fn(async () => createPreparedRecordingAssetForTest(new Blob(chunks), 'snapshot')),
    abort: vi.fn(async () => undefined),
  };
}

it('downloads the exact committed bytes through a disk snapshot and releases its temporary asset', async () => {
  const entry = await open();
  await commitRecoveryBlock(entry, new Uint8Array([1, 2]).buffer);
  await commitRecoveryBlock(entry, new Uint8Array([3]).buffer);
  const output = outputWriter();
  vi.mocked(assets.createAssetObjectWriter).mockResolvedValueOnce(output);
  vi.mocked(assets.readAssetFile).mockImplementationOnce(
    async () => new File(output.chunks, 'source.webm')
  );
  const snapshot = await readRecoveryRecording(entry.id);
  expect([...new Uint8Array(await snapshot.file.arrayBuffer())]).toEqual([1, 2, 3]);
  await snapshot.release();
  expect(assets.discardPreparedAsset).toHaveBeenCalledWith('snapshot');
  expect(await read(entry)).toEqual([1, 2, 3]);
});

it.each(['missing-block', 'snapshot-read', 'snapshot-write'])(
  'preserves original bytes after %s failure',
  async (failure) => {
    const entry = await open();
    await commitRecoveryBlock(entry, new Uint8Array([1, 2, 3]).buffer);
    const output = outputWriter();
    vi.mocked(assets.createAssetObjectWriter).mockResolvedValueOnce(output);
    if (failure === 'missing-block') state.blocks.clear();
    if (failure === 'snapshot-read')
      vi.mocked(assets.readAssetFile).mockRejectedValueOnce(new Error('Read failed'));
    if (failure === 'snapshot-write') output.append.mockRejectedValueOnce(new Error('Disk full'));
    await expect(readRecoveryRecording(entry.id)).rejects.toThrow();
    expect(output.abort).toHaveBeenCalledOnce();
    expect(state.sessions.has(JSON.stringify(entry.id))).toBe(true);
    if (failure !== 'missing-block') expect(await read(entry)).toEqual([1, 2, 3]);
  }
);

it('explicit deletion refuses stale commands and removes the admitted incarnation only', async () => {
  const entry = await open();
  await commitRecoveryBlock(entry, new Uint8Array([1, 2, 3]).buffer);
  await expect(deleteRecoveryRecording(entry.id, 'stale')).rejects.toThrow('stale');
  expect(await read(entry)).toEqual([1, 2, 3]);
  await deleteRecoveryRecording(entry.id, entry.incarnation);
  expect(state.blocks.size).toBe(0);
  await expect(readRecoveryRecording(entry.id)).rejects.toThrow('unavailable');
  expect(await initializeRecoveryEpoch()).toBe(entry.epoch);
});

it('preserves originals and releases recovery access when final output assembly fails', async () => {
  const epoch = await initializeRecoveryEpoch();
  const writer = await createDurableRecordingWriter(
    { artifactId: 'source', filename: 'source.webm', mimeType: 'video/webm' },
    epoch
  );
  expect(writer.assetId).toBe('source');
  await writer.append(new Blob([new Uint8Array([1, 2, 3])]));
  const output = outputWriter();
  output.finalize.mockRejectedValueOnce(new Error('Finalize failed'));
  vi.mocked(assets.createAssetObjectWriter).mockResolvedValueOnce(output);
  await expect(writer.finalize()).rejects.toThrow('Finalize failed');
  expect(writer.assetId).toBe('snapshot');
  output.abort.mockRejectedValueOnce(new Error('Cleanup failed'));
  await expect(writer.abort()).rejects.toThrow('Cleanup failed');
  const [entry] = await listRecoverableRecordings();
  expect(await read(entry!)).toEqual([1, 2, 3]);
  await expect(writer.append(new Blob(['late']))).rejects.toThrow('closed');
  await expect(writer.finalize()).rejects.toThrow('closed');
});

it('invalidates finalization waiting for an output writer without losing source bytes', async () => {
  const epoch = await initializeRecoveryEpoch();
  const writer = await createDurableRecordingWriter(
    { artifactId: 'source', filename: 'source.webm', mimeType: 'video/webm' },
    epoch
  );
  await writer.append(new Blob([new Uint8Array([1, 2, 3])]));
  let supply!: (output: ReturnType<typeof outputWriter>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  vi.mocked(assets.createAssetObjectWriter).mockImplementationOnce(async () => {
    entered();
    return new Promise((resolve) => {
      supply = resolve;
    });
  });
  const finalize = writer.finalize();
  const outcome = expect(finalize).rejects.toThrow('closed');
  await started;
  await writer.invalidate();
  const output = outputWriter();
  supply(output);
  await outcome;
  expect(output.abort).toHaveBeenCalledOnce();
  const [entry] = await listRecoverableRecordings();
  expect(await read(entry!)).toEqual([1, 2, 3]);
});

it('default coordinator preserves safety copies on success and removes them only on explicit discard', async () => {
  const output = outputWriter();
  vi.mocked(assets.createAssetObjectWriter).mockResolvedValueOnce(output);
  const coordinator = await createRecordingStagingCoordinator();
  const writer = await coordinator.openArtifact({
    artifactId: 'source',
    filename: 'source.webm',
    mimeType: 'video/webm',
  });
  await writer.append(new Blob([new Uint8Array([1, 2, 3])]));
  const finalized = await writer.finalize();
  expect(finalized.recoverySource?.id).toBe('source');
  await coordinator.delete();
  await coordinator.abort();
  const [entry] = await listRecoverableRecordings();
  expect(await read(entry!)).toEqual([1, 2, 3]);
  const second = await createRecordingStagingCoordinator();
  const next = await second.openArtifact({
    artifactId: 'discard',
    filename: 'discard.webm',
    mimeType: 'video/webm',
  });
  await next.append(new Blob(['private']));
  await second.discard?.();
  expect((await listRecoverableRecordings()).map((row) => row.id)).toEqual(['source']);
});

it('refuses recovery operations when cross-context locks are unavailable', async () => {
  vi.stubGlobal('navigator', {});
  await expect(listRecoverableRecordings()).rejects.toThrow('Web Locks');
  await expect(
    createDurableRecordingWriter(
      { artifactId: 'source', filename: 'source.webm', mimeType: 'video/webm' },
      'epoch'
    )
  ).rejects.toThrow('Web Locks');
});
