import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveReader } from '../../../composition/archive-transfer';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  admission: vi.fn(),
  append: vi.fn(),
  createWriter: vi.fn(),
  discard: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: mocks.admission,
  createAssetObjectWriter: mocks.createWriter,
  discardPreparedAsset: mocks.discard,
}));

import { stageArchiveRootObjects } from './staging';

const descriptor = {
  mediaSubtype: 'library-item' as const,
  metadataPath: '_sniptale/metadata/media/one.json',
  objectCount: 1,
  rootId: 'one',
  rootKind: 'media' as const,
  totalBytes: 5,
};
const object = {
  filename: 'one.bin',
  mimeType: 'application/octet-stream',
  objectId: 'object-one',
  path: 'Screenshots/one.bin',
  size: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abort.mockResolvedValue(undefined);
  mocks.discard.mockResolvedValue(undefined);
  mocks.createWriter.mockResolvedValue({
    abort: mocks.abort,
    append: mocks.append,
    assetId: 'local-asset',
    finalize: mocks.finalize,
  });
  mocks.finalize.mockResolvedValue({
    ref: {
      assetId: 'local-asset',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/local-asset' },
      mimeType: object.mimeType,
      sha256: null,
      size: 5,
    },
  });
});

function reader(chunks: string[], reportedSize = chunks.join('').length): ArchiveReader {
  return {
    close: vi.fn(),
    entries: () => [],
    entry: () => ({
      compressedSize: 5,
      crc32: 1,
      directory: false,
      path: object.path,
      size: reportedSize,
      async pipeTo(writable: WritableStream<Uint8Array>) {
        const writer = writable.getWriter();
        for (const chunk of chunks) await writer.write(new TextEncoder().encode(chunk));
        await writer.close();
      },
      text: vi.fn(),
    }),
  };
}

function envelope(objects = [object]) {
  return { descriptor, metadata: {}, objects };
}

describe('media backup v6 root staging', () => {
  it('streams one object into OPFS and validates exact bytes', async () => {
    await expect(
      stageArchiveRootObjects({
        envelope: envelope(),
        reader: reader(['me', 'dia']),
      })
    ).resolves.toEqual([expect.objectContaining({ objectId: 'object-one' })]);
    expect(mocks.admission).toHaveBeenCalledWith(5);
    expect(mocks.append).toHaveBeenCalledTimes(2);
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it('aborts the active writer and discards earlier objects on failure', async () => {
    mocks.append.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      stageArchiveRootObjects({
        envelope: envelope(),
        reader: reader(['media']),
      })
    ).rejects.toThrow('disk full');
    expect(mocks.abort).toHaveBeenCalledOnce();
  });

  it('rejects a missing archive entry before opening an OPFS writer', async () => {
    await expect(
      stageArchiveRootObjects({
        envelope: envelope(),
        reader: { ...reader([]), entry: () => null },
      })
    ).rejects.toThrow('Media backup object is missing');
    expect(mocks.createWriter).not.toHaveBeenCalled();
  });

  it('rejects declared-size drift before opening an OPFS writer', async () => {
    await expect(
      stageArchiveRootObjects({ envelope: envelope(), reader: reader(['tiny']) })
    ).rejects.toThrow('Media backup object size does not match');
    expect(mocks.createWriter).not.toHaveBeenCalled();
  });

  it('aborts an object that streams beyond its declared size', async () => {
    const oversized = { ...object, size: 4 };
    await expect(
      stageArchiveRootObjects({
        envelope: envelope([oversized]),
        reader: reader(['media'], 4),
      })
    ).rejects.toThrow('exceeds its declared size');
    expect(mocks.abort).toHaveBeenCalledOnce();
  });

  it('discards already finalized root objects when a later object fails', async () => {
    const second = { ...object, objectId: 'object-two', path: 'Screenshots/two.bin' };
    let entryIndex = 0;
    const archiveReader = reader(['media']);
    archiveReader.entry = vi.fn(() => {
      entryIndex += 1;
      return entryIndex === 1 ? reader(['media']).entry(object.path) : null;
    });
    await expect(
      stageArchiveRootObjects({ envelope: envelope([object, second]), reader: archiveReader })
    ).rejects.toThrow('Media backup object is missing');
    expect(mocks.discard).toHaveBeenCalledWith('local-asset');
  });

  it('surfaces active-writer cleanup failure together with the write error', async () => {
    mocks.append.mockRejectedValueOnce(new Error('disk full'));
    mocks.abort.mockRejectedValueOnce(new Error('abort failed'));
    await expect(
      stageArchiveRootObjects({ envelope: envelope(), reader: reader(['media']) })
    ).rejects.toThrow('Media backup object staging cleanup failed');
  });

  it('surfaces finalized-object cleanup failures together with the root error', async () => {
    const second = { ...object, objectId: 'object-two', path: 'Screenshots/two.bin' };
    let entryIndex = 0;
    const archiveReader = reader(['media']);
    archiveReader.entry = vi.fn(() => {
      entryIndex += 1;
      return entryIndex === 1 ? reader(['media']).entry(object.path) : null;
    });
    mocks.discard.mockRejectedValueOnce(new Error('discard failed'));

    await expect(
      stageArchiveRootObjects({ envelope: envelope([object, second]), reader: archiveReader })
    ).rejects.toThrow('Media backup root staging cleanup failed');
  });
});
