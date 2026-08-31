import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  append: vi.fn(),
  createAssetObjectWriter: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('./opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs-store')>()),
  createAssetObjectWriter: mocks.createAssetObjectWriter,
}));

import { createPreparedAssetArchiveSink } from './archive-sink';

const prepared = {
  ref: {
    assetId: 'archive-1',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/archive-1' },
    mimeType: 'application/zip',
    sha256: null,
    size: 6,
  },
};

describe('prepared asset archive sink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.abort.mockResolvedValue(undefined);
    mocks.append.mockResolvedValue(undefined);
    mocks.finalize.mockResolvedValue(prepared);
    mocks.createAssetObjectWriter.mockResolvedValue({
      abort: mocks.abort,
      append: mocks.append,
      assetId: 'archive-1',
      finalize: mocks.finalize,
    });
  });

  it('forwards bounded chunks and exposes the prepared ref only after close', async () => {
    const archive = await createPreparedAssetArchiveSink({
      assetId: 'archive-1',
      mimeType: 'application/zip',
    });
    expect(() => archive.preparedAsset()).toThrow('before a successful close');
    const writer = archive.sink.writable.getWriter();
    await writer.write(new TextEncoder().encode('abc'));
    await writer.write(new TextEncoder().encode('def'));
    writer.releaseLock();

    await archive.sink.close();

    expect(mocks.createAssetObjectWriter).toHaveBeenCalledWith({
      assetId: 'archive-1',
      mimeType: 'application/zip',
    });
    expect(mocks.append).toHaveBeenCalledTimes(2);
    await expect(mocks.append.mock.calls[0]?.[0].text()).resolves.toBe('abc');
    await expect(mocks.append.mock.calls[1]?.[0].text()).resolves.toBe('def');
    expect(archive.preparedAsset()).toBe(prepared);
    await expect(archive.sink.close()).resolves.toBeUndefined();
  });

  it('can compensate after finalize fails and never exposes a result', async () => {
    mocks.finalize.mockRejectedValueOnce(new Error('quota exhausted'));
    const archive = await createPreparedAssetArchiveSink({ mimeType: 'application/zip' });

    await expect(archive.sink.close()).rejects.toThrow('quota exhausted');
    expect(() => archive.preparedAsset()).toThrow('before a successful close');
    await archive.sink.abort(new Error('archive failed'));
    await archive.sink.abort();

    expect(mocks.abort).toHaveBeenCalledTimes(1);
  });

  it('propagates abort cleanup failure and keeps the sink retryable', async () => {
    mocks.abort.mockRejectedValueOnce(new Error('cleanup failed')).mockResolvedValueOnce(undefined);
    const archive = await createPreparedAssetArchiveSink({ mimeType: 'application/zip' });

    await expect(archive.sink.abort()).rejects.toThrow('cleanup failed');
    await expect(archive.sink.abort()).resolves.toBeUndefined();
    expect(mocks.abort).toHaveBeenCalledTimes(2);
  });
});
