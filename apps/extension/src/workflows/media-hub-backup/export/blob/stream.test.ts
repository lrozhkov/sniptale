import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  append: vi.fn(),
  createWriter: vi.fn(),
  discard: vi.fn(),
  finalize: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  createAssetObjectWriter: mocks.createWriter,
  discardPreparedAsset: mocks.discard,
  readAssetFile: mocks.readFile,
}));
vi.mock(
  '../../../../composition/persistence/infrastructure/mutation-barrier',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/mutation-barrier')
    >()),
    runWithPersistenceMutationTransition: (effect: () => Promise<unknown>) => effect(),
  })
);

import { generateBackupZipFileToOpfs, releaseBackupZipFile } from './stream';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abort.mockResolvedValue(undefined);
  mocks.append.mockResolvedValue(undefined);
  mocks.discard.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue({
    ref: {
      assetId: 'backup-temp',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/backup-temp' },
      mimeType: 'application/zip',
      sha256: null,
      size: 3,
    },
  });
  mocks.readFile.mockResolvedValue(new File(['zip'], 'sniptale-backup.zip'));
  mocks.createWriter.mockResolvedValue({
    abort: mocks.abort,
    append: mocks.append,
    assetId: 'backup-temp',
    finalize: mocks.finalize,
  });
});

it('keeps the temporary OPFS object until the returned File download is released', async () => {
  const stream = new ZipStream([new Uint8Array([1]), new Uint8Array([2, 3])]);

  const file = await generateBackupZipFileToOpfs({
    zip: { generateInternalStream: () => stream },
  });

  expect(mocks.append).toHaveBeenCalledTimes(2);
  expect(mocks.readFile).toHaveBeenCalledOnce();
  expect(mocks.discard).not.toHaveBeenCalled();

  await releaseBackupZipFile(file);

  expect(mocks.discard).toHaveBeenCalledWith('backup-temp');
});

it('aborts and removes partial output when export cancellation is observed between chunks', async () => {
  const controller = new AbortController();
  mocks.append.mockImplementationOnce(async () => controller.abort());

  await expect(
    generateBackupZipFileToOpfs({
      signal: controller.signal,
      zip: {
        generateInternalStream: () => new ZipStream([new Uint8Array([1]), new Uint8Array([2])]),
      },
    })
  ).rejects.toThrow('cancelled');

  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('retains release authority and retries a transient OPFS cleanup failure', async () => {
  const file = await generateBackupZipFileToOpfs({
    zip: { generateInternalStream: () => new ZipStream([new Uint8Array([1])]) },
  });
  mocks.discard.mockRejectedValueOnce(new Error('transient remove failure'));

  await expect(releaseBackupZipFile(file)).resolves.toBeUndefined();

  expect(mocks.discard).toHaveBeenCalledTimes(2);
  expect(mocks.discard).toHaveBeenNthCalledWith(1, 'backup-temp');
  expect(mocks.discard).toHaveBeenNthCalledWith(2, 'backup-temp');
});

it('surfaces partial OPFS cleanup failure together with the streaming failure', async () => {
  mocks.append.mockRejectedValueOnce(new Error('zip append failed'));
  mocks.abort.mockRejectedValueOnce(new Error('partial object cleanup failed'));

  await expect(
    generateBackupZipFileToOpfs({
      zip: { generateInternalStream: () => new ZipStream([new Uint8Array([1])]) },
    })
  ).rejects.toThrow('partial OPFS cleanup was incomplete');

  expect(mocks.abort).toHaveBeenCalledOnce();
});

class ZipStream {
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
