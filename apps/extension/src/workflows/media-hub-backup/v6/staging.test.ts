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

import { stageArchiveRootObjects, stageRootObjects } from './staging';

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

const MEDIA_SHA256 = '721c9525ade2ea8903d343ef25cf68b9bf4ab0aad56bb7b01fbe48d09bc7fcf4';

async function streamedSource(chunks: string[]) {
  const entry = reader(chunks).entry(object.path);
  if (!entry) throw new Error('The test source is missing.');
  return entry;
}

it('verifies selected object bytes across chunks before finalization', async () => {
  const readObject = vi.fn(async () => streamedSource(['me', 'dia']));
  const staged = await stageRootObjects({
    objects: [object],
    expectedSha256: new Map([[object.objectId, MEDIA_SHA256]]),
    readObject,
  });
  expect(staged).toEqual([expect.objectContaining({ objectId: object.objectId })]);
  expect(mocks.admission).toHaveBeenCalledWith(object.size);
  expect(readObject).toHaveBeenCalledOnce();
  expect(mocks.append).toHaveBeenCalledTimes(2);
  expect(mocks.finalize).toHaveBeenCalledOnce();
});

it('rejects equal-size corruption before finalization', async () => {
  await expect(
    stageRootObjects({
      objects: [object],
      expectedSha256: new Map([[object.objectId, MEDIA_SHA256]]),
      readObject: async () => streamedSource(['ra', 'dio']),
    })
  ).rejects.toThrow('Root object checksum does not match.');
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it.each([
  { name: 'missing', hashes: new Map<string, string>() },
  { name: 'malformed', hashes: new Map([[object.objectId, 'not-a-digest']]) },
  { name: 'wrong identity', hashes: new Map([['another-object', MEDIA_SHA256]]) },
  {
    name: 'extra',
    hashes: new Map([
      [object.objectId, MEDIA_SHA256],
      ['another-object', MEDIA_SHA256],
    ]),
  },
])('rejects a $name checksum table before admission or reads', async ({ hashes }) => {
  const readObject = vi.fn(async () => streamedSource(['media']));
  await expect(
    stageRootObjects({ objects: [object], expectedSha256: hashes, readObject })
  ).rejects.toThrow('Root object checksum table is invalid.');
  expect(mocks.admission).not.toHaveBeenCalled();
  expect(readObject).not.toHaveBeenCalled();
  expect(mocks.createWriter).not.toHaveBeenCalled();
});

it('discards earlier selected objects when a later streamed digest fails', async () => {
  const second = { ...object, objectId: 'object-two', path: 'Originals/two.bin' };
  await expect(
    stageRootObjects({
      objects: [object, second],
      expectedSha256: new Map([
        [object.objectId, MEDIA_SHA256],
        [second.objectId, MEDIA_SHA256],
      ]),
      readObject: async (selected) =>
        streamedSource(selected.objectId === object.objectId ? ['media'] : ['radio']),
    })
  ).rejects.toThrow('Root object checksum does not match.');
  expect(mocks.finalize).toHaveBeenCalledOnce();
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.discard).toHaveBeenCalledWith('local-asset');
});

it('snapshots selected metadata and digests before asynchronous admission', async () => {
  let resume: (() => void) | undefined;
  mocks.admission.mockReturnValueOnce(new Promise<void>((resolve) => (resume = resolve)));
  const selected = { ...object };
  const hashes = new Map([[selected.objectId, MEDIA_SHA256]]);
  const readObject = vi.fn(async () => streamedSource(['media']));
  const result = stageRootObjects({ objects: [selected], expectedSha256: hashes, readObject });
  selected.objectId = 'changed-object';
  selected.path = 'changed-path';
  selected.size = 1;
  hashes.clear();
  resume?.();
  await expect(result).resolves.toEqual([expect.objectContaining({ objectId: object.objectId })]);
  expect(readObject).toHaveBeenCalledWith(object);
  expect(mocks.finalize).toHaveBeenCalledOnce();
});

it('refuses finalization when cancellation follows the last source chunk', async () => {
  const controller = new AbortController();
  await expect(
    stageRootObjects({
      objects: [object],
      signal: controller.signal,
      readObject: async () => ({
        async pipeTo(destination) {
          const source = await streamedSource(['media']);
          await source.pipeTo(destination);
          controller.abort();
        },
      }),
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.finalize).not.toHaveBeenCalled();
});

it('keeps digest and writer state independent across concurrent root staging', async () => {
  let release: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  const read = (prefix: string, suffix: string) => async () => ({
    async pipeTo(destination: WritableStream<Uint8Array>) {
      const writer = destination.getWriter();
      await writer.write(new TextEncoder().encode(prefix));
      if (++started === 2) release?.();
      await bothStarted;
      await writer.write(new TextEncoder().encode(suffix));
      await writer.close();
    },
  });
  const first = stageRootObjects({
    objects: [object],
    expectedSha256: new Map([[object.objectId, MEDIA_SHA256]]),
    readObject: read('me', 'dia'),
  });
  const second = stageRootObjects({
    objects: [object],
    expectedSha256: new Map([
      [object.objectId, 'aa3a05d9d57c08d694cf230a36386221f56890092e54cf8d6b04fab1b2cc0702'],
    ]),
    readObject: read('ra', 'dio'),
  });
  await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  expect(mocks.createWriter).toHaveBeenCalledTimes(2);
  expect(mocks.finalize).toHaveBeenCalledTimes(2);
  expect(mocks.abort).not.toHaveBeenCalled();
});
