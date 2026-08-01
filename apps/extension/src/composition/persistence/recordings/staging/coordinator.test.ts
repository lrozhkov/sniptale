import { describe, expect, it, vi } from 'vitest';

import type {
  RecordingStagingStorageAdapter,
  RecordingStagingStorageArtifact,
  RecordingStagingStorageSession,
} from './contracts';
import {
  createRecordingStagingCoordinator,
  invalidateAndAbortActiveRecordingStaging,
} from './coordinator';

function deferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

interface FakeStorageOptions {
  append?: (chunk: Blob, artifactIndex: number) => Promise<void>;
  close?: (artifactIndex: number) => Promise<void>;
}

function createFakeStorage(options: FakeStorageOptions = {}) {
  const storedChunks: Blob[][] = [];
  const artifacts: RecordingStagingStorageArtifact[] = [];
  const removeSession = vi.fn().mockResolvedValue(undefined);
  const aborts: Array<ReturnType<typeof vi.fn>> = [];
  const closes: Array<ReturnType<typeof vi.fn>> = [];
  const session: RecordingStagingStorageSession = {
    async createArtifact() {
      const artifactIndex = artifacts.length;
      storedChunks.push([]);
      const abort = vi.fn().mockResolvedValue(undefined);
      const close = vi.fn(async () => options.close?.(artifactIndex));
      aborts.push(abort);
      closes.push(close);
      const artifact: RecordingStagingStorageArtifact = {
        abort,
        async append(chunk) {
          await options.append?.(chunk, artifactIndex);
          storedChunks[artifactIndex]?.push(chunk);
        },
        close,
        async getFile() {
          return new File(storedChunks[artifactIndex] ?? [], `artifact-${artifactIndex}.part`);
        },
        remove: vi.fn().mockResolvedValue(undefined),
      };
      artifacts.push(artifact);
      return artifact;
    },
    remove: removeSession,
  };
  const adapter: RecordingStagingStorageAdapter = {
    countSessions: vi.fn().mockResolvedValue(0),
    createSession: vi.fn().mockResolvedValue(session),
    removeAllSessions: vi.fn().mockResolvedValue(0),
  };
  return { aborts, adapter, closes, removeSession, storedChunks };
}

async function openArtifact(
  coordinator: Awaited<ReturnType<typeof createRecordingStagingCoordinator>>,
  artifactId = 'primary'
) {
  return coordinator.openArtifact({
    artifactId,
    filename: `${artifactId}.webm`,
    mimeType: 'video/webm;codecs=vp9',
  });
}

describe('recording staging coordinator', () => {
  it('serializes ordered appends and returns a typed disk-backed File wrapper', async () => {
    const firstWrite = deferred();
    const appendCalls: string[] = [];
    const storage = createFakeStorage({
      async append(chunk) {
        appendCalls.push(await chunk.text());
        if (appendCalls.length === 1) await firstWrite.promise;
      },
    });
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    const writer = await openArtifact(coordinator);

    const writes = [writer.append(new Blob(['a'])), writer.append(new Blob(['b']))];
    await vi.waitFor(() => expect(appendCalls).toEqual(['a']));
    expect(coordinator.getPendingBytes()).toBe(2);
    firstWrite.resolve();
    await Promise.all(writes);

    const result = await writer.finalize();
    expect(await result.file.text()).toBe('ab');
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe('primary.webm');
    expect(result.file.type).toBe('video/webm;codecs=vp9');
    expect(result.size).toBe(2);
    expect(coordinator.getPendingBytes()).toBe(0);
    await coordinator.delete();
    expect(storage.removeSession).toHaveBeenCalledOnce();
  });

  it('does not retain pending bytes across thousands of completed writes', async () => {
    const storage = createFakeStorage();
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    const writer = await openArtifact(coordinator);

    for (let index = 0; index < 2_000; index += 1) {
      await writer.append(new Blob(['x']));
      expect(coordinator.getPendingBytes()).toBe(0);
    }

    const result = await writer.finalize();
    expect(result.size).toBe(2_000);
  });

  it('enforces one aggregate pending-byte budget across artifact writers', async () => {
    const writeGate = deferred();
    const storage = createFakeStorage({ append: () => writeGate.promise });
    const coordinator = await createRecordingStagingCoordinator({
      pendingBytesLimit: 10,
      storage: storage.adapter,
    });
    const primary = await openArtifact(coordinator, 'primary');
    const webcam = await openArtifact(coordinator, 'webcam');

    const acceptedWrite = primary.append(new Blob(['123456']));
    await vi.waitFor(() => expect(coordinator.getPendingBytes()).toBe(6));
    await expect(webcam.append(new Blob(['12345']))).rejects.toThrow(
      'pending-byte limit exceeded (10 bytes)'
    );
    expect(coordinator.getPendingBytes()).toBe(6);
    writeGate.resolve();
    await acceptedWrite;
    await expect(primary.finalize()).rejects.toThrow('pending-byte limit exceeded (10 bytes)');
    await coordinator.abort();
  });

  it('poisons finalization after an append failure and still supports cleanup', async () => {
    const writeError = new Error('disk write failed');
    const storage = createFakeStorage({ append: () => Promise.reject(writeError) });
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    const writer = await openArtifact(coordinator);

    await expect(writer.append(new Blob(['bytes']))).rejects.toBe(writeError);
    expect(coordinator.getPendingBytes()).toBe(0);
    await expect(writer.finalize()).rejects.toBe(writeError);
    await coordinator.abort();
    expect(storage.aborts[0]).toHaveBeenCalledOnce();
    expect(storage.removeSession).toHaveBeenCalledOnce();
  });

  it('rejects close failure instead of publishing an incomplete File', async () => {
    const closeError = new Error('close failed');
    const storage = createFakeStorage({ close: () => Promise.reject(closeError) });
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    const writer = await openArtifact(coordinator);

    await writer.append(new Blob(['bytes']));
    await expect(writer.finalize()).rejects.toBe(closeError);
    await coordinator.abort();
  });

  it('aborts every artifact and deletes the session without finalizing', async () => {
    const storage = createFakeStorage();
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    await openArtifact(coordinator, 'primary');
    await openArtifact(coordinator, 'microphone');

    await coordinator.abort();
    await coordinator.abort();

    expect(storage.aborts[0]).toHaveBeenCalledOnce();
    expect(storage.aborts[1]).toHaveBeenCalledOnce();
    expect(storage.removeSession).toHaveBeenCalledOnce();
  });

  it('rejects duplicate artifact IDs and invalid coordinator budgets', async () => {
    const storage = createFakeStorage();
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    await openArtifact(coordinator);

    await expect(openArtifact(coordinator)).rejects.toThrow('artifact already exists');
    await expect(
      createRecordingStagingCoordinator({ pendingBytesLimit: 0, storage: storage.adapter })
    ).rejects.toThrow('positive safe integer');
  });

  it('invalidates active writers before privacy erasure can continue', async () => {
    const storage = createFakeStorage();
    const coordinator = await createRecordingStagingCoordinator({ storage: storage.adapter });
    const writer = await openArtifact(coordinator);

    await invalidateAndAbortActiveRecordingStaging();

    await expect(writer.append(new Blob(['stale']))).rejects.toThrow(/aborted|stale/);
    expect(storage.aborts[0]).toHaveBeenCalledOnce();
    expect(storage.removeSession).toHaveBeenCalledOnce();
  });

  it('discards an artifact that finishes opening after the coordinator is aborted', async () => {
    const artifactOpened = deferred<RecordingStagingStorageArtifact>();
    const abortArtifact = vi.fn().mockResolvedValue(undefined);
    const removeSession = vi.fn().mockResolvedValue(undefined);
    const session: RecordingStagingStorageSession = {
      createArtifact: () => artifactOpened.promise,
      remove: removeSession,
    };
    const storage: RecordingStagingStorageAdapter = {
      countSessions: vi.fn().mockResolvedValue(0),
      createSession: vi.fn().mockResolvedValue(session),
      removeAllSessions: vi.fn().mockResolvedValue(0),
    };
    const coordinator = await createRecordingStagingCoordinator({ storage });
    const opening = openArtifact(coordinator);

    await coordinator.abort();
    artifactOpened.resolve({
      abort: abortArtifact,
      append: vi.fn(),
      close: vi.fn(),
      getFile: vi.fn(),
      remove: vi.fn(),
    });

    await expect(opening).rejects.toThrow('coordinator is aborted');
    expect(abortArtifact).toHaveBeenCalledOnce();
    expect(removeSession).toHaveBeenCalledOnce();
  });
});
