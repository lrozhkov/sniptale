import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  append: vi.fn(),
  createWriter: vi.fn(),
  finalize: vi.fn(),
  admit: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: mocks.admit,
  createAssetObjectWriter: mocks.createWriter,
}));

import { writeBackupArchiveEntryToAsset } from './asset-stream';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admit.mockResolvedValue(undefined);
  mocks.abort.mockResolvedValue(undefined);
  mocks.append.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue({
    ref: {
      assetId: 'asset-1',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/asset-1' },
      mimeType: 'video/webm',
      sha256: null,
      size: 5,
    },
  });
  mocks.createWriter.mockResolvedValue({
    abort: mocks.abort,
    append: mocks.append,
    assetId: 'asset-1',
    finalize: mocks.finalize,
  });
});

it('streams durable ZIP bytes with backpressure without materializing a Blob entry', async () => {
  const stream = new ControlledStream([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]);
  const asyncBlob = vi.fn();

  await expect(
    writeBackupArchiveEntryToAsset({
      expectedSize: 5,
      mimeType: 'video/webm',
      path: 'assets/recording.webm',
      zip: { file: () => ({ async: asyncBlob, internalStream: () => stream }) },
    })
  ).resolves.toEqual(
    expect.objectContaining({ ref: expect.objectContaining({ assetId: 'asset-1' }) })
  );

  expect(asyncBlob).not.toHaveBeenCalled();
  expect(mocks.admit).toHaveBeenCalledWith(5);
  expect(mocks.append).toHaveBeenCalledTimes(2);
  expect(stream.pauseCount).toBe(2);
  expect(mocks.finalize).toHaveBeenCalledOnce();
});

it('aborts the OPFS writer when streamed bytes exceed declared metadata', async () => {
  const stream = new ControlledStream([new Uint8Array([1, 2, 3])]);

  await expect(
    writeBackupArchiveEntryToAsset({
      expectedSize: 2,
      mimeType: 'video/webm',
      path: 'assets/recording.webm',
      zip: { file: () => ({ async: vi.fn(), internalStream: () => stream }) },
    })
  ).rejects.toThrow('exceeds its declared size');

  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('surfaces incomplete OPFS cleanup together with the invalid archive error', async () => {
  mocks.abort.mockRejectedValueOnce(new Error('partial restore cleanup failed'));

  await expect(
    writeBackupArchiveEntryToAsset({
      expectedSize: 2,
      mimeType: 'video/webm',
      path: 'assets/recording.webm',
      zip: {
        file: () => ({
          async: vi.fn(),
          internalStream: () => new ControlledStream([new Uint8Array([1, 2, 3])]),
        }),
      },
    })
  ).rejects.toThrow('partial OPFS cleanup was incomplete');

  expect(mocks.abort).toHaveBeenCalledOnce();
});

it('refuses a durable entry when the archive cannot expose an internal stream', async () => {
  await expect(
    writeBackupArchiveEntryToAsset({
      expectedSize: 1,
      mimeType: 'video/webm',
      path: 'assets/recording.webm',
      zip: { file: () => ({ async: vi.fn() }) },
    })
  ).rejects.toThrow('cannot be streamed');

  expect(mocks.createWriter).not.toHaveBeenCalled();
});

class ControlledStream {
  pauseCount = 0;
  private current = 0;
  private paused = true;
  private readonly listeners = new Map<string, Array<(value?: unknown) => void>>();

  constructor(private readonly chunks: Uint8Array[]) {}

  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(
    event: string,
    listener: ((chunk: Uint8Array) => void) | (() => void) | ((error: unknown) => void)
  ): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push((value) => (listener as (next: unknown) => void)(value));
    this.listeners.set(event, listeners);
    return this;
  }

  pause(): this {
    this.pauseCount += 1;
    this.paused = true;
    return this;
  }

  resume(): this {
    this.paused = false;
    queueMicrotask(() => this.emitNext());
    return this;
  }

  private emitNext(): void {
    if (this.paused) return;
    const chunk = this.chunks[this.current];
    if (chunk) {
      this.current += 1;
      this.listeners.get('data')?.forEach((listener) => listener(chunk));
      return;
    }
    this.paused = true;
    this.listeners.get('end')?.forEach((listener) => listener());
  }
}
