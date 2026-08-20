import { expect, it } from 'vitest';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  LEGACY_RECORDING_STAGING_DIRECTORY_NAME,
  countAssetStorageRoots,
  collectQuiescentWritingObjects,
  createAssetObjectWriter,
  deleteAssetObject,
  deleteReadyJournal,
  discardPreparedAsset,
  eraseAssetStorage,
  isAssetReadyProtected,
  listReadyJournals,
  readAssetFile,
  releaseAssetReadyProtection,
  writeBlobToAsset,
  writeReadyJournal,
} from './opfs-store';

function notFound(): Error {
  return Object.assign(new Error('missing'), { name: 'NotFoundError' });
}

class MemoryFileHandle {
  readonly kind = 'file' as const;
  private bytes = new Blob();

  async createWritable(): Promise<FileSystemWritableFileStream> {
    const chunks: BlobPart[] = [];
    return {
      abort: async () => undefined,
      close: async () => {
        this.bytes = new Blob(chunks);
      },
      write: async (value: FileSystemWriteChunkType) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          !(value instanceof Blob) &&
          'type' in value
        ) {
          throw new Error('Structured writes are unsupported by the test double.');
        }
        chunks.push(value as BlobPart);
      },
    } as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], 'memory-file');
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;
  readonly entriesByName = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>();

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    const current = this.entriesByName.get(name);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    if (current instanceof MemoryDirectoryHandle)
      return current as unknown as FileSystemDirectoryHandle;
    if (current || !options?.create) throw notFound();
    const directory = new MemoryDirectoryHandle();
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    this.entriesByName.set(name, directory);
    return directory as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const current = this.entriesByName.get(name);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    if (current instanceof MemoryFileHandle) return current as unknown as FileSystemFileHandle;
    if (current || !options?.create) throw notFound();
    const file = new MemoryFileHandle();
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    this.entriesByName.set(name, file);
    return file as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entriesByName.delete(name)) throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, handle] of this.entriesByName) {
      // Browser boundary test double: only the OPFS methods exercised below are implemented.
      yield [name, handle as unknown as FileSystemHandle];
    }
  }
}

function createHarness() {
  const root = new MemoryDirectoryHandle();
  return {
    options: {
      createId: () => 'asset-1',
      // Browser boundary test double: only the OPFS methods exercised below are implemented.
      getOriginRoot: async () => root as unknown as FileSystemDirectoryHandle,
      requestExclusiveLock: async (
        _name: string,
        _options: { ifAvailable: boolean },
        callback: (acquired: boolean) => Promise<void>
      ) => callback(true),
    },
    root,
  };
}

it('keeps a closed immutable object and changes writing protection to a ready journal', async () => {
  const harness = createHarness();
  const writer = await createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options);
  const assetRoot = harness.root.entriesByName.get(ASSET_ROOT_DIRECTORY_NAME);
  expect(assetRoot).toBeInstanceOf(MemoryDirectoryHandle);
  const writing = (assetRoot as MemoryDirectoryHandle).entriesByName.get('writing');
  expect((writing as MemoryDirectoryHandle).entriesByName.has('asset-1')).toBe(true);

  await writer.append(new Blob(['first']));
  await writer.append(new Blob(['second']));
  const prepared = await writer.finalize();
  const journal = {
    assetRefs: [prepared.ref],
    createdAt: 1,
    domain: 'recording-assets',
    journalId: 'journal-1',
    payload: { entries: [] },
  };
  await writeReadyJournal(journal, harness.options);

  expect((writing as MemoryDirectoryHandle).entriesByName.has('asset-1')).toBe(false);
  expect(isAssetReadyProtected('asset-1')).toBe(true);
  await expect(listReadyJournals(harness.options)).resolves.toEqual([journal]);
  const file = await readAssetFile(prepared.ref, 'recording.webm', harness.options);
  expect(file.name).toBe('recording.webm');
  expect(file.type).toBe('video/webm');
  await expect(file.text()).resolves.toBe('firstsecond');
  await deleteReadyJournal(journal.journalId, harness.options);
  await expect(listReadyJournals(harness.options)).resolves.toEqual([]);
  releaseAssetReadyProtection(['asset-1']);
  expect(isAssetReadyProtected('asset-1')).toBe(false);
});

it('aborts an active writer and removes both its marker and partial object', async () => {
  const harness = createHarness();
  const writer = await createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options);
  await writer.append(new Blob(['partial']));

  await writer.abort();
  await writer.abort();

  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  expect((assetRoot.entriesByName.get('writing') as MemoryDirectoryHandle).entriesByName.size).toBe(
    0
  );
  expect((assetRoot.entriesByName.get('objects') as MemoryDirectoryHandle).entriesByName.size).toBe(
    0
  );
});

it('erases the durable asset root together with legacy recording staging', async () => {
  const harness = createHarness();
  await harness.root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true });
  await harness.root.getDirectoryHandle(LEGACY_RECORDING_STAGING_DIRECTORY_NAME, { create: true });

  await expect(countAssetStorageRoots(harness.options)).resolves.toBe(2);
  await expect(eraseAssetStorage(harness.options)).resolves.toBe(2);
  await expect(countAssetStorageRoots(harness.options)).resolves.toBe(0);
  await expect(eraseAssetStorage(harness.options)).resolves.toBe(0);
});

it('reports absent storage as empty and fails closed when an object is missing', async () => {
  const harness = createHarness();

  await expect(listReadyJournals(harness.options)).resolves.toEqual([]);
  await expect(collectQuiescentWritingObjects(harness.options)).resolves.toBe(0);
  await expect(countAssetStorageRoots(harness.options)).resolves.toBe(0);
  await expect(deleteAssetObject('missing', harness.options)).resolves.toBeUndefined();
  await expect(discardPreparedAsset('missing', harness.options)).resolves.toBeUndefined();
  await expect(
    readAssetFile(
      {
        assetId: 'missing',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/missing' },
        mimeType: 'video/webm',
        sha256: null,
        size: 1,
      },
      'missing.webm',
      harness.options
    )
  ).rejects.toThrow('missing');
});

it('streams a Blob into an object and can discard the finalized unpublished object', async () => {
  const harness = createHarness();
  const prepared = await writeBlobToAsset(
    new Blob(['video'], { type: 'video/webm' }),
    harness.options
  );
  const file = await readAssetFile(prepared.ref, 'video.webm', harness.options);
  await expect(file.text()).resolves.toBe('video');

  await discardPreparedAsset(prepared.ref.assetId, harness.options);

  await expect(readAssetFile(prepared.ref, 'video.webm', harness.options)).rejects.toThrow(
    'missing'
  );
});

it('uses an explicit asset id and the binary MIME fallback', async () => {
  const harness = createHarness();
  const prepared = await writeBlobToAsset(new Blob(['binary']), {
    ...harness.options,
    assetId: 'explicit-asset',
  });

  expect(prepared.ref).toMatchObject({
    assetId: 'explicit-asset',
    mimeType: 'application/octet-stream',
  });
  await discardPreparedAsset(prepared.ref.assetId, harness.options);
});

it('ignores non-journal entries and malformed journal payloads', async () => {
  const harness = createHarness();
  await writeReadyJournal(
    {
      assetRefs: [],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'empty',
      payload: {},
    },
    harness.options
  );
  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  const ready = assetRoot.entriesByName.get('ready') as MemoryDirectoryHandle;
  await ready.getDirectoryHandle('nested', { create: true });
  const malformed = (await ready.getFileHandle('malformed', {
    create: true,
  })) as unknown as MemoryFileHandle;
  const writable = await malformed.createWritable();
  await writable.write('{}');
  await writable.close();

  await expect(listReadyJournals(harness.options)).resolves.toEqual([
    expect.objectContaining({ journalId: 'empty' }),
  ]);
});

it('rejects invalid MIME metadata and size mismatches', async () => {
  const harness = createHarness();
  await expect(createAssetObjectWriter({ mimeType: ' ' }, harness.options)).rejects.toThrow(
    'MIME type'
  );
  const prepared = await writeBlobToAsset(new Blob(['x']), {
    ...harness.options,
    mimeType: 'application/octet-stream',
  });
  await expect(
    readAssetFile({ ...prepared.ref, size: 2 }, 'bad.bin', harness.options)
  ).rejects.toThrow('size mismatch');
  await discardPreparedAsset(prepared.ref.assetId, harness.options);
});

it('collects only writing objects whose cross-context writer lock is free', async () => {
  const harness = createHarness();
  const writer = await createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options);
  await writer.append(new Blob(['active']));

  await expect(
    collectQuiescentWritingObjects({
      ...harness.options,
      requestExclusiveLock: async (_name, options, callback) =>
        callback(options.ifAvailable ? false : true),
    })
  ).resolves.toBe(0);
  await writer.abort();

  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  await (assetRoot.entriesByName.get('writing') as MemoryDirectoryHandle).getFileHandle('stale', {
    create: true,
  });
  await (assetRoot.entriesByName.get('objects') as MemoryDirectoryHandle).getFileHandle('stale', {
    create: true,
  });
  await expect(
    collectQuiescentWritingObjects({
      ...harness.options,
      requestExclusiveLock: async (_name, _options, callback) => callback(true),
    })
  ).resolves.toBe(1);
});
