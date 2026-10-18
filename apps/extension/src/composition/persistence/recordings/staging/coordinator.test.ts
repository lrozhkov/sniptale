import { describe, expect, it, vi } from 'vitest';

const { initDBMock } = vi.hoisted(() => ({
  initDBMock: vi.fn(async () => undefined),
}));

vi.mock('../../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/indexed-db/core')>()),
  initDB: initDBMock,
}));

import * as assets from '../../assets';
import type { AssetObjectWriter } from '../../assets';
import {
  createRecordingStagingCoordinator,
  invalidateAndAbortActiveRecordingStaging,
} from './coordinator';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createWriterFactory(options: { append?: (chunk: Blob) => Promise<void> } = {}) {
  const writers: Array<{
    abort: ReturnType<typeof vi.fn>;
    chunks: Blob[];
    writer: AssetObjectWriter;
  }> = [];
  const createWriter = vi.fn(async ({ mimeType }: { mimeType: string }) => {
    const chunks: Blob[] = [];
    const abort = vi.fn().mockResolvedValue(undefined);
    const assetId = `asset-${writers.length + 1}`;
    const writer: AssetObjectWriter = {
      abort,
      assetId,
      async append(chunk) {
        await options.append?.(chunk);
        chunks.push(chunk);
      },
      async finalize() {
        const size = chunks.reduce((total, chunk) => total + chunk.size, 0);
        return {
          ref: {
            assetId,
            createdAt: 1,
            location: { kind: 'opfs', objectKey: `objects/${assetId}` },
            mimeType,
            sha256: null,
            size,
          },
        };
      },
    };
    writers.push({ abort, chunks, writer });
    return writer;
  });
  return { createWriter, writers };
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
  it('settles database admission before any artifact writer lease is acquired', async () => {
    const order: string[] = [];
    initDBMock.mockImplementationOnce(async () => {
      order.push('initDB');
    });
    const factory = createWriterFactory();
    const createWriter = vi.fn(async (input: { mimeType: string }) => {
      order.push('createWriter');
      return factory.createWriter(input);
    });
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter,
    });

    await openArtifact(coordinator);

    expect(order).toEqual(['initDB', 'createWriter']);
    await coordinator.abort();
  });

  it('rejects coordinator creation when database admission rejects', async () => {
    const admissionError = new Error('IndexedDB admission blocked');
    initDBMock.mockRejectedValueOnce(admissionError);

    await expect(createRecordingStagingCoordinator()).rejects.toBe(admissionError);
  });

  it('rejects an invalid pending-byte budget', async () => {
    await expect(createRecordingStagingCoordinator({ pendingBytesLimit: 0 })).rejects.toThrow(
      'positive safe integer'
    );
    await expect(
      createRecordingStagingCoordinator({ pendingBytesLimit: Number.MAX_SAFE_INTEGER + 1 })
    ).rejects.toThrow('positive safe integer');
  });

  it('serializes writes and finalizes the stable OPFS asset without creating a File copy', async () => {
    const gate = deferred();
    const appendCalls: string[] = [];
    const factory = createWriterFactory({
      async append(chunk) {
        appendCalls.push(await chunk.text());
        if (appendCalls.length === 1) await gate.promise;
      },
    });
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter: factory.createWriter,
    });
    const writer = await openArtifact(coordinator);
    const writes = [writer.append(new Blob(['a'])), writer.append(new Blob(['b']))];
    await vi.waitFor(() => expect(appendCalls).toEqual(['a']));
    expect(coordinator.getPendingBytes()).toBe(2);
    gate.resolve();
    await Promise.all(writes);
    const artifact = await writer.finalize();
    expect(artifact).toMatchObject({
      artifactId: 'primary',
      asset: { ref: { assetId: 'asset-1', size: 2 } },
      filename: 'primary.webm',
      mimeType: 'video/webm;codecs=vp9',
      size: 2,
    });
    expect('file' in artifact).toBe(false);
    await coordinator.delete();
  });

  it('enforces one pending-byte budget across concurrent sources', async () => {
    const gate = deferred();
    const factory = createWriterFactory({ append: () => gate.promise });
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter: factory.createWriter,
      pendingBytesLimit: 3,
    });
    const primary = await openArtifact(coordinator);
    const webcam = await openArtifact(coordinator, 'webcam');
    const pending = primary.append(new Blob(['aa']));
    await vi.waitFor(() => expect(coordinator.getPendingBytes()).toBe(2));
    await expect(webcam.append(new Blob(['bb']))).rejects.toThrow('pending-byte limit');
    gate.resolve();
    await pending;
  });

  it('treats quota admission and OPFS write failures as terminal', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new DOMException('full', 'QuotaExceededError')),
      createWriter: factory.createWriter,
    });
    const writer = await openArtifact(coordinator);
    await expect(writer.append(new Blob(['x']))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    await expect(writer.finalize()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('invalidates and aborts active writers before privacy erasure', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter: factory.createWriter,
    });
    await openArtifact(coordinator);
    await invalidateAndAbortActiveRecordingStaging();
    expect(factory.writers[0]?.abort).toHaveBeenCalledOnce();
    await expect(openArtifact(coordinator, 'late')).rejects.toThrow('generation is stale');
  });

  it('releases privacy invalidation without waiting for a queued append admission', async () => {
    const waiting = deferred();
    const entered = deferred();
    let calls = 0;
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      createWriter: factory.createWriter,
      admitBytes: async () => {
        calls += 1;
        if (calls > 1) {
          entered.resolve();
          await waiting.promise;
        }
      },
    });
    const writer = await openArtifact(coordinator);
    const append = writer.append(new Blob(['x']));
    const outcome = expect(append).rejects.toThrow('generation is stale');
    await entered.promise;
    await invalidateAndAbortActiveRecordingStaging();
    expect(factory.writers[0]?.abort).toHaveBeenCalledOnce();
    waiting.resolve();
    await outcome;
    expect(factory.writers[0]?.chunks).toEqual([]);
  });

  it('discards a finalized object when no ready journal protects it', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter: factory.createWriter,
    });
    const writer = await openArtifact(coordinator);
    await writer.finalize();

    await coordinator.abort();

    expect(factory.writers[0]?.abort).toHaveBeenCalledOnce();
  });

  it('preserves a finalized object after its ready journal becomes durable', async () => {
    const protection = vi.spyOn(assets, 'isAssetReadyProtected').mockReturnValue(true);
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      admitBytes: vi.fn().mockResolvedValue(undefined),
      createWriter: factory.createWriter,
    });
    const writer = await openArtifact(coordinator);
    await writer.finalize();

    await coordinator.abort();

    expect(factory.writers[0]?.abort).not.toHaveBeenCalled();
    protection.mockRestore();
  });
  it.each([false, true])(
    'refuses delayed opening across privacy erasure and releases opened resources (cleanup failure: %s)',
    async (cleanupFailure) => {
      const gate = deferred();
      const entered = deferred();
      const factory = createWriterFactory();
      const coordinator = await createRecordingStagingCoordinator({
        admitBytes: async () => undefined,
        createWriter: async (input) => {
          const writer = await factory.createWriter(input);
          if (cleanupFailure)
            factory.writers[0]!.abort.mockRejectedValueOnce(new Error('Cleanup failed'));
          entered.resolve();
          await gate.promise;
          return writer;
        },
      });
      const opening = openArtifact(coordinator);
      const result = expect(opening).rejects.toThrow(
        cleanupFailure ? 'became unavailable' : 'generation is stale'
      );
      await entered.promise;
      await invalidateAndAbortActiveRecordingStaging();
      gate.resolve();
      await result;
      expect(factory.writers[0]?.abort).toHaveBeenCalledOnce();
    }
  );

  it('reports abort cleanup failure once and keeps the coordinator closed', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      createWriter: factory.createWriter,
      admitBytes: async () => undefined,
    });
    await openArtifact(coordinator);
    factory.writers[0]!.abort.mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(coordinator.abort()).rejects.toThrow('Failed to abort');
    await expect(coordinator.abort()).rejects.toThrow('Failed to abort');
    expect(factory.writers[0]?.abort).toHaveBeenCalledOnce();
    await expect(openArtifact(coordinator, 'late')).rejects.toThrow('aborted');
  });

  it('reports release failure after successful finalization and closes the coordinator', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      createWriter: factory.createWriter,
      admitBytes: async () => undefined,
    });
    const writer = await openArtifact(coordinator);
    await writer.finalize();
    const release = vi
      .spyOn(assets, 'releaseAssetReadyProtection')
      .mockRejectedValueOnce(new Error('Release failed'));
    await expect(coordinator.delete()).rejects.toThrow('Failed to release');
    await expect(openArtifact(coordinator, 'late')).rejects.toThrow('deleted');
    release.mockRestore();
  });

  it('reports privacy teardown failure after invalidating the writer generation', async () => {
    const factory = createWriterFactory();
    const coordinator = await createRecordingStagingCoordinator({
      createWriter: factory.createWriter,
      admitBytes: async () => undefined,
    });
    await openArtifact(coordinator);
    factory.writers[0]!.abort.mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(invalidateAndAbortActiveRecordingStaging()).rejects.toThrow(
      'Failed to invalidate'
    );
    await expect(openArtifact(coordinator, 'late')).rejects.toThrow('generation is stale');
  });
});
