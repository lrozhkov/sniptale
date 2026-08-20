import { expect, it, vi } from 'vitest';
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
  listAssetObjectIds,
  listReadyJournals,
  listWritingAssetIds,
  readAssetFile,
  releaseAssetReadyProtection,
  writeBlobToAsset,
  writeReadyJournal,
} from './opfs-store';
import { runWithPersistentDataErasureBarrier } from '../infrastructure/mutation-barrier';

function notFound(): Error {
  return Object.assign(new Error('missing'), { name: 'NotFoundError' });
}

class MemoryFileHandle {
  readonly kind = 'file' as const;
  private bytes = new Blob();
  abortEffect: () => Promise<void> = async () => undefined;
  closeEffect: () => Promise<void> = async () => undefined;
  createWritableEffect: () => Promise<void> = async () => undefined;
  writeEffect: () => Promise<void> = async () => undefined;

  async createWritable(): Promise<FileSystemWritableFileStream> {
    await this.createWritableEffect();
    const chunks: BlobPart[] = [];
    return {
      abort: async () => this.abortEffect(),
      close: async () => {
        await this.closeEffect();
        this.bytes = new Blob(chunks);
      },
      write: async (value: FileSystemWriteChunkType) => {
        await this.writeEffect();
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
  initializeCreatedFile: (file: MemoryFileHandle) => void = () => undefined;
  removeEffect: () => Promise<void> = async () => undefined;

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
    this.initializeCreatedFile(file);
    // Browser boundary test double: only the OPFS methods exercised below are implemented.
    this.entriesByName.set(name, file);
    return file as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    await this.removeEffect();
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
  await expect(listWritingAssetIds(harness.options)).resolves.toEqual(['asset-1']);
  await expect(listAssetObjectIds(harness.options)).resolves.toEqual(['asset-1']);

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
  await expect(listWritingAssetIds(harness.options)).resolves.toEqual([]);
  expect(isAssetReadyProtected('asset-1')).toBe(true);
  await expect(listReadyJournals(harness.options)).resolves.toEqual([journal]);
  const file = await readAssetFile(prepared.ref, 'recording.webm', harness.options);
  expect(file.name).toBe('recording.webm');
  expect(file.type).toBe('video/webm');
  await expect(file.text()).resolves.toBe('firstsecond');
  await deleteReadyJournal(journal.journalId, harness.options);
  await expect(listReadyJournals(harness.options)).resolves.toEqual([]);
  await expect(listAssetObjectIds(harness.options)).resolves.toEqual(['asset-1']);
  await expect(listWritingAssetIds(harness.options)).resolves.toEqual([]);
  await releaseAssetReadyProtection(['asset-1']);
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

it('supports a writer whose enclosing workflow already owns persistence admission', async () => {
  const harness = createHarness();
  const writer = await createAssetObjectWriter(
    { mimeType: 'video/webm' },
    { ...harness.options, persistenceTransition: 'already-admitted' }
  );

  await writer.abort();

  await expect(listWritingAssetIds(harness.options)).resolves.toEqual([]);
  await expect(listAssetObjectIds(harness.options)).resolves.toEqual([]);
});

it('releases persistence admission when the object writer lock cannot be acquired', async () => {
  const harness = createHarness();
  await expect(
    createAssetObjectWriter(
      { mimeType: 'video/webm' },
      {
        ...harness.options,
        requestExclusiveLock: async () => {
          throw new Error('writer lock failed');
        },
      }
    )
  ).rejects.toThrow('writer lock failed');

  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('releases writer and persistence admission when OPFS directory creation fails', async () => {
  const harness = createHarness();
  await expect(
    createAssetObjectWriter(
      { mimeType: 'video/webm' },
      {
        ...harness.options,
        getOriginRoot: async () => {
          throw new Error('OPFS root failed');
        },
      }
    )
  ).rejects.toMatchObject({
    errors: expect.arrayContaining([expect.objectContaining({ message: 'OPFS root failed' })]),
  });

  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('keeps persistence admission until concurrent directory creation attempts settle', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  const getDirectoryHandle = assetRoot.getDirectoryHandle.bind(assetRoot);
  let releaseWritingDirectory: (() => void) | undefined;
  let writingDirectoryStartedResolve: (() => void) | undefined;
  const writingDirectoryStarted = new Promise<void>((resolve) => {
    writingDirectoryStartedResolve = resolve;
  });
  vi.spyOn(assetRoot, 'getDirectoryHandle').mockImplementation(async (name, options) => {
    if (name === 'objects') throw new Error('objects directory failed');
    if (name === 'writing') {
      writingDirectoryStartedResolve?.();
      await new Promise<void>((resolve) => {
        releaseWritingDirectory = resolve;
      });
    }
    return getDirectoryHandle(name, options);
  });

  const writerCreation = createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options);
  let writerCreationSettled = false;
  void writerCreation.then(
    () => {
      writerCreationSettled = true;
    },
    () => {
      writerCreationSettled = true;
    }
  );
  await writingDirectoryStarted;
  const rootRemoval = vi.spyOn(harness.root, 'removeEntry');
  let erasureCompleted = false;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    await eraseAssetStorage(harness.options);
    erasureCompleted = true;
  });
  await Promise.resolve();
  expect(writerCreationSettled).toBe(false);
  expect(erasureCompleted).toBe(false);
  expect(rootRemoval).not.toHaveBeenCalled();

  releaseWritingDirectory?.();
  await expect(writerCreation).rejects.toThrow('Failed to create asset directories.');
  await erasure;

  expect(erasureCompleted).toBe(true);
  expect(rootRemoval).toHaveBeenCalledWith(ASSET_ROOT_DIRECTORY_NAME, { recursive: true });
  expect(harness.root.entriesByName.has(ASSET_ROOT_DIRECTORY_NAME)).toBe(false);
});

it('removes the marker and releases persistence admission when object creation fails', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);
  vi.spyOn(objects, 'getFileHandle').mockRejectedValueOnce(new Error('object creation failed'));

  await expect(
    createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options)
  ).rejects.toThrow('object creation failed');

  expect(writing.entriesByName.has('asset-1')).toBe(false);
  expect(objects.entriesByName.has('asset-1')).toBe(false);
  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('removes a created marker when its writable cannot be opened', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  writing.initializeCreatedFile = (marker) => {
    marker.createWritableEffect = async () => {
      throw new Error('marker writable failed');
    };
  };
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);

  await expect(
    createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options)
  ).rejects.toThrow('marker writable failed');

  expect(writing.entriesByName.has('asset-1')).toBe(false);
  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('releases persistence admission when marker file creation fails', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);
  vi.spyOn(writing, 'getFileHandle').mockRejectedValueOnce(new Error('marker creation failed'));
  const markerRemoval = vi.spyOn(writing, 'removeEntry');

  await expect(
    createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options)
  ).rejects.toThrow('marker creation failed');
  expect(markerRemoval).toHaveBeenCalledWith('asset-1', { recursive: false });
  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it.each([
  {
    configure(marker: MemoryFileHandle) {
      marker.writeEffect = async () => {
        throw new Error('marker write failed');
      };
    },
    failure: 'marker write failed',
  },
  {
    configure(marker: MemoryFileHandle) {
      marker.closeEffect = async () => {
        throw new Error('marker close failed');
      };
    },
    failure: 'marker close failed',
  },
])('removes a created marker when $failure', async ({ configure, failure }) => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  writing.initializeCreatedFile = configure;
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);

  await expect(
    createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options)
  ).rejects.toThrow(failure);

  expect(writing.entriesByName.has('asset-1')).toBe(false);
  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('surfaces marker cleanup failure without retaining persistence admission', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  writing.initializeCreatedFile = (marker) => {
    marker.writeEffect = async () => {
      throw new Error('marker write failed');
    };
    marker.abortEffect = async () => {
      throw new Error('marker abort failed');
    };
  };
  writing.removeEffect = async () => {
    throw new Error('marker removal failed');
  };
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);

  await expect(
    createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options)
  ).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ message: 'marker write failed' }),
          expect.objectContaining({ message: 'marker abort failed' }),
          expect.objectContaining({ message: 'marker removal failed' }),
        ]),
        message: 'Failed to write and clean up OPFS marker: asset-1.',
      }),
      expect.objectContaining({ message: 'marker removal failed' }),
    ]),
  });
  await expect(runWithPersistentDataErasureBarrier(async () => undefined)).resolves.toBeUndefined();
});

it('surfaces Blob write and abort-cleanup failures together', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  const object = new MemoryFileHandle();
  object.writeEffect = async () => {
    throw new Error('object write failed');
  };
  object.abortEffect = async () => {
    throw new Error('writable abort failed');
  };
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);
  objects.entriesByName.set('asset-1', object);

  await expect(writeBlobToAsset(new Blob(['bytes']), harness.options)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: 'object write failed' }),
    errors: expect.arrayContaining([
      expect.objectContaining({ message: 'object write failed' }),
      expect.objectContaining({ message: 'Failed to discard asset object: asset-1.' }),
    ]),
  });
});

it('settles an active writable abort before removing its object and marker', async () => {
  const harness = createHarness();
  const writer = await createAssetObjectWriter({ mimeType: 'video/webm' }, harness.options);
  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  const objects = assetRoot.entriesByName.get('objects') as MemoryDirectoryHandle;
  const writing = assetRoot.entriesByName.get('writing') as MemoryDirectoryHandle;
  const object = objects.entriesByName.get('asset-1') as MemoryFileHandle;
  let releaseAbort: (() => void) | undefined;
  object.abortEffect = () =>
    new Promise<void>((resolve) => {
      releaseAbort = resolve;
    });

  const aborting = writer.abort();
  await Promise.resolve();

  expect(objects.entriesByName.has('asset-1')).toBe(true);
  expect(writing.entriesByName.has('asset-1')).toBe(true);
  releaseAbort?.();
  await aborting;
  expect(objects.entriesByName.has('asset-1')).toBe(false);
  expect(writing.entriesByName.has('asset-1')).toBe(false);
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
  await expect(listAssetObjectIds(harness.options)).resolves.toEqual([]);
  await expect(listWritingAssetIds(harness.options)).resolves.toEqual([]);
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

it('fails closed when OPFS directory enumeration is unavailable', async () => {
  const harness = createHarness();
  const assetRoot = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, assetRoot);
  assetRoot.entriesByName.set('objects', objects);
  assetRoot.entriesByName.set('writing', writing);
  Reflect.set(objects, 'entries', undefined);
  Reflect.set(writing, 'entries', undefined);

  await expect(listAssetObjectIds(harness.options)).rejects.toThrow('enumeration');
  await expect(listWritingAssetIds(harness.options)).rejects.toThrow('enumeration');
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

it('keeps erasure behind an unpublished OPFS object until the object is discarded', async () => {
  const harness = createHarness();
  const prepared = await writeBlobToAsset(new Blob(['video']), harness.options);
  const erase = vi.fn(async () => undefined);

  const erasure = runWithPersistentDataErasureBarrier(erase);
  await Promise.resolve();
  expect(erase).not.toHaveBeenCalled();

  await discardPreparedAsset(prepared.ref.assetId, harness.options);
  await erasure;
  expect(erase).toHaveBeenCalledOnce();
});

it('removes writer protection even when prepared object deletion fails', async () => {
  const harness = createHarness();
  const prepared = await writeBlobToAsset(new Blob(['video']), harness.options);
  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  const objects = assetRoot.entriesByName.get('objects') as MemoryDirectoryHandle;
  const writing = assetRoot.entriesByName.get('writing') as MemoryDirectoryHandle;
  const removeObject = objects.removeEntry.bind(objects);
  objects.removeEntry = async () => {
    throw new Error('transient object delete failure');
  };

  await expect(discardPreparedAsset(prepared.ref.assetId, harness.options)).rejects.toThrow(
    'Unable to discard prepared asset'
  );

  expect(writing.entriesByName.has(prepared.ref.assetId)).toBe(false);
  expect(objects.entriesByName.has(prepared.ref.assetId)).toBe(true);
  objects.removeEntry = removeObject;
  await expect(
    discardPreparedAsset(prepared.ref.assetId, harness.options)
  ).resolves.toBeUndefined();
});

it('removes an available writing marker when the objects directory lookup fails', async () => {
  const harness = createHarness();
  const prepared = await writeBlobToAsset(new Blob(['video']), harness.options);
  const assetRoot = harness.root.entriesByName.get(
    ASSET_ROOT_DIRECTORY_NAME
  ) as MemoryDirectoryHandle;
  const writing = assetRoot.entriesByName.get('writing') as MemoryDirectoryHandle;
  const getDirectory = assetRoot.getDirectoryHandle.bind(assetRoot);
  assetRoot.getDirectoryHandle = async (name, options) => {
    if (name === 'objects') throw new Error('transient objects lookup failure');
    return getDirectory(name, options);
  };

  await expect(discardPreparedAsset(prepared.ref.assetId, harness.options)).rejects.toThrow(
    'Unable to discard prepared asset'
  );

  expect(writing.entriesByName.has(prepared.ref.assetId)).toBe(false);
  assetRoot.getDirectoryHandle = getDirectory;
  await expect(
    discardPreparedAsset(prepared.ref.assetId, harness.options)
  ).resolves.toBeUndefined();
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
