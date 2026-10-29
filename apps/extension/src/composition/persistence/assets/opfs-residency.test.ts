import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it, vi } from 'vitest';
import type { AssetRef } from './contracts';
import { restoreMissingAssetObject } from './opfs-residency';
import { createHarness, MemoryDirectoryHandle, MemoryFileHandle } from './opfs-store.test-support';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  collectQuiescentWritingObjects,
  readAssetFile,
} from './opfs-store';
import {
  runWithPersistenceMutationTransition,
  runWithPersistentDataErasureBarrier,
} from '../infrastructure/mutation-barrier';

function digest(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fixture(text = 'restored original') {
  const harness = createHarness();
  const root = new MemoryDirectoryHandle();
  const objects = new MemoryDirectoryHandle();
  const residency = new MemoryDirectoryHandle();
  const markers = new MemoryDirectoryHandle();
  const writing = new MemoryDirectoryHandle();
  harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, root);
  root.entriesByName.set('objects', objects);
  root.entriesByName.set('residency', residency);
  root.entriesByName.set('writing', writing);
  residency.entriesByName.set('asset-1', markers);
  const ref: AssetRef = {
    assetId: 'asset-1',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/asset-1' },
    mimeType: 'application/octet-stream',
    sha256: null,
    size: new Blob([text]).size,
  };
  const input = {
    ref,
    sourceBlob: new Blob([text]),
    sha256: digest(new TextEncoder().encode(text)),
    operationId: 'restore-1',
    assertCurrent: vi.fn(async () => undefined),
  };
  return { ...harness, root, objects, markers, writing, input };
}

async function put(directory: MemoryDirectoryHandle, name: string, text: string) {
  const file = await directory.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(text);
  await stream.close();
  return directory.entriesByName.get(name) as MemoryFileHandle;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('installs the same immutable ref and replays without opening an existing target writable', async () => {
  const f = fixture();
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
  expect(await (await readAssetFile(f.input.ref, 'original.bin', f.options)).text()).toBe(
    'restored original'
  );
  const target = f.objects.entriesByName.get('asset-1') as MemoryFileHandle;
  const writable = vi.spyOn(target, 'createWritable');
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('already-present');
  expect(writable).not.toHaveBeenCalled();
  expect(f.markers.entriesByName.size).toBe(0);
});

it('preserves a committed restored target and marker through startup writing collection and retry', async () => {
  const f = fixture();
  f.markers.removeEffect = async () => {
    throw new Error('marker removal failed');
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'marker removal failed'
  );
  expect(f.markers.entriesByName.size).toBe(1);
  await expect(collectQuiescentWritingObjects(f.options)).resolves.toBe(0);
  expect(await (await readAssetFile(f.input.ref, 'original.bin', f.options)).text()).toBe(
    'restored original'
  );
  f.markers.removeEffect = async () => undefined;
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('already-present');
  expect(f.markers.entriesByName.size).toBe(0);
});

it.each(['different bytes!!', 'short'])(
  'preserves an existing different object: %s',
  async (text) => {
    const f = fixture();
    const target = await put(f.objects, 'asset-1', text);
    const writable = vi.spyOn(target, 'createWritable');
    await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
      'Existing asset bytes'
    );
    expect(await (await target.getFile()).text()).toBe(text);
    expect(writable).not.toHaveBeenCalled();
  }
);

it('rejects a source size mismatch before any OPFS effect', async () => {
  const f = fixture();
  const origin = vi.fn(f.options.getOriginRoot);
  await expect(
    restoreMissingAssetObject(
      { ...f.input, sourceBlob: new Blob(['x']) },
      { ...f.options, getOriginRoot: origin }
    )
  ).rejects.toThrow('size mismatch');
  expect(origin).not.toHaveBeenCalled();
});

it('rejects a same-size source checksum mismatch and retries the owned zero object', async () => {
  const f = fixture();
  await expect(
    restoreMissingAssetObject(
      { ...f.input, sourceBlob: new Blob(['x'.repeat(f.input.ref.size)]) },
      f.options
    )
  ).rejects.toThrow('checksum mismatch');
  expect((await (f.objects.entriesByName.get('asset-1') as MemoryFileHandle).getFile()).size).toBe(
    0
  );
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
});

it('refuses an unknown zero object and preserves it', async () => {
  const f = fixture();
  await put(f.objects, 'asset-1', '');
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'Existing asset bytes'
  );
  expect(f.objects.entriesByName.has('asset-1')).toBe(true);
  expect(f.markers.entriesByName.size).toBe(0);
});

it('installs an empty source and replays its valid empty SHA binding', async () => {
  const f = fixture('');
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
  const target = f.objects.entriesByName.get('asset-1') as MemoryFileHandle;
  const writable = vi.spyOn(target, 'createWritable');
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('already-present');
  expect(writable).not.toHaveBeenCalled();
});

it.each(['foreign.json', 'nested'])(
  'preserves and refuses a foreign marker entry: %s',
  async (name) => {
    const f = fixture();
    if (name === 'nested') await f.markers.getDirectoryHandle(name, { create: true });
    else await put(f.markers, name, '{}');
    await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
      'foreign residency marker'
    );
    expect(f.markers.entriesByName.has(name)).toBe(true);
    expect(f.objects.entriesByName.size).toBe(0);
  }
);

it('preserves malformed nonempty own markers', async () => {
  const f = fixture();
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = async () => {
      throw new Error('quota');
    };
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow('quota');
  const name = [...f.markers.entriesByName.keys()][0]!;
  await put(f.markers, name, '{');
  f.objects.initializeCreatedFile = () => undefined;
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow('marker is invalid');
  expect(
    await (await (f.markers.entriesByName.get(name) as MemoryFileHandle).getFile()).text()
  ).toBe('{');
});

it('rejects operation replacement while an interrupted own marker remains', async () => {
  const f = fixture();
  f.markers.initializeCreatedFile = (file) => {
    file.closeEffect = async () => {
      throw new Error('marker close failed');
    };
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'marker close failed'
  );
  await expect(
    restoreMissingAssetObject({ ...f.input, operationId: 'replacement' }, f.options)
  ).rejects.toThrow('foreign residency marker');
  expect(f.objects.entriesByName.size).toBe(0);
});

it('recovers its exact empty marker after failed marker close before target creation', async () => {
  const f = fixture();
  f.markers.initializeCreatedFile = (file) => {
    file.closeEffect = async () => {
      throw new Error('marker close failed');
    };
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'marker close failed'
  );
  expect(f.objects.entriesByName.size).toBe(0);
  const marker = [...f.markers.entriesByName.values()][0] as MemoryFileHandle;
  expect((await marker.getFile()).size).toBe(0);
  marker.closeEffect = async () => undefined;
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
});

it('refuses an existing writing marker before creating a residency target', async () => {
  const f = fixture();
  await put(f.writing, 'asset-1', '{}');
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'existing writing marker'
  );
  expect(f.objects.entriesByName.size).toBe(0);
});

it('retains completed bytes after uncertain close and verifies them on replay', async () => {
  const f = fixture();
  f.objects.initializeCreatedFile = (file) => {
    file.afterCommitCloseEffect = async () => {
      throw new Error('lost close');
    };
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow('lost close');
  expect(await (await readAssetFile(f.input.ref, 'original.bin', f.options)).text()).toBe(
    'restored original'
  );
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('already-present');
});

it.each(['quota', 'close'])('retains source and retries after %s failure', async (failure) => {
  const f = fixture();
  f.objects.initializeCreatedFile = (file) => {
    const fail = async () => {
      throw new Error(failure);
    };
    if (failure === 'quota') file.writeEffect = fail;
    else file.closeEffect = fail;
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(failure);
  expect(await f.input.sourceBlob.text()).toBe('restored original');
  const target = f.objects.entriesByName.get('asset-1') as MemoryFileHandle;
  target.writeEffect = async () => undefined;
  target.closeEffect = async () => undefined;
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
});

it('checks cancellation after a controlled write wait and allows an exact retry', async () => {
  const f = fixture();
  const controller = new AbortController();
  const entered = deferred();
  const release = deferred();
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = async () => {
      entered.resolve();
      await release.promise;
    };
  };
  const installing = restoreMissingAssetObject(
    { ...f.input, signal: controller.signal },
    f.options
  );
  await entered.promise;
  controller.abort();
  release.resolve();
  await expect(installing).rejects.toMatchObject({ name: 'AbortError' });
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
});

it('returns busy under a held object lock and retries after its controlled release', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  let held = false;
  const options = {
    ...f.options,
    requestExclusiveLock: async (
      _name: string,
      _options: { ifAvailable: boolean },
      callback: (acquired: boolean) => Promise<void>
    ) => {
      if (held) return callback(false);
      held = true;
      try {
        await callback(true);
      } finally {
        held = false;
      }
    },
  };
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = async () => {
      entered.resolve();
      await release.promise;
    };
  };
  const first = restoreMissingAssetObject(f.input, options);
  await entered.promise;
  await expect(restoreMissingAssetObject(f.input, options)).resolves.toBe('busy');
  release.resolve();
  await expect(first).resolves.toBe('installed');
  await expect(restoreMissingAssetObject(f.input, options)).resolves.toBe('already-present');
});

it('refuses delayed work after native deletion and same-ID recreation before OPFS effects', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  let incarnation = 1;
  f.input.assertCurrent = vi.fn(async () => {
    if (incarnation !== 1) throw new Error('native binding changed');
  });
  const options = {
    ...f.options,
    getOriginRoot: async () => {
      entered.resolve();
      await release.promise;
      return f.options.getOriginRoot();
    },
  };
  const installing = restoreMissingAssetObject(f.input, options);
  await entered.promise;
  incarnation = 2;
  release.resolve();
  await expect(installing).rejects.toThrow('native binding changed');
  expect(f.objects.entriesByName.size).toBe(0);
  expect(f.markers.entriesByName.size).toBe(0);
});

it('refuses a native binding revoked during target writes before closing', async () => {
  const f = fixture();
  let current = true;
  f.input.assertCurrent = vi.fn(async () => {
    if (!current) throw new Error('native binding changed');
  });
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = async () => {
      current = false;
    };
  };
  await expect(restoreMissingAssetObject(f.input, f.options)).rejects.toThrow(
    'native binding changed'
  );
  expect((await (f.objects.entriesByName.get('asset-1') as MemoryFileHandle).getFile()).size).toBe(
    0
  );
});

it('uses sixteen bounded writes and a constant number of native fences for a 1 MiB source', async () => {
  const f = fixture('x'.repeat(1024 * 1024));
  const writes = vi.fn(async () => undefined);
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = writes;
  };
  const wholeRead = vi.spyOn(f.input.sourceBlob, 'arrayBuffer');
  await expect(restoreMissingAssetObject(f.input, f.options)).resolves.toBe('installed');
  expect(writes).toHaveBeenCalledTimes(16);
  expect(wholeRead).not.toHaveBeenCalled();
  expect(f.input.assertCurrent.mock.calls.length).toBeLessThanOrEqual(13);
});

it('keeps erasure behind the complete restore operation', async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  f.objects.initializeCreatedFile = (file) => {
    file.writeEffect = async () => {
      entered.resolve();
      await release.promise;
    };
  };
  const installing = restoreMissingAssetObject(f.input, f.options);
  await entered.promise;
  const erase = vi.fn(async () => undefined);
  const erasure = runWithPersistentDataErasureBarrier(erase);
  await Promise.resolve();
  expect(erase).not.toHaveBeenCalled();
  release.resolve();
  await installing;
  await erasure;
  expect(erase).toHaveBeenCalledOnce();
});

it('refuses a supplied transition permit after its admitted lifetime ends', async () => {
  const f = fixture();
  let attempt!: Promise<unknown>;
  const entered = deferred();
  const release = deferred();
  await runWithPersistenceMutationTransition(async (permit) => {
    attempt = restoreMissingAssetObject(f.input, {
      ...f.options,
      persistenceTransitionPermit: permit,
      getOriginRoot: async () => {
        entered.resolve();
        await release.promise;
        return f.options.getOriginRoot();
      },
    });
    await entered.promise;
  });
  release.resolve();
  await expect(attempt).rejects.toThrow('permit is not active');
  expect(f.objects.entriesByName.size).toBe(0);
});
