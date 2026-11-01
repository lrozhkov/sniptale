import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  collectQuiescentWritingObjects,
  writeReadyJournal,
  deleteReadyJournal,
  releaseAssetReadyProtection,
  settleAssetWritingMarkers,
} from './opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  installPersistenceLockManagerForTests,
  type DurableAssetLifecyclePermit,
  type PersistenceLockManager,
} from '../infrastructure/mutation-barrier';
import type { AssetReadyJournal } from './contracts';
import { createHarness } from './opfs-store.test-support';

beforeEach(() => vi.stubGlobal('navigator', {}));
afterEach(async () => {
  await releaseAssetReadyProtection(['asset-0', 'asset-1', 'asset-2']);
  installPersistenceLockManagerForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function writeFile(directory: FileSystemDirectoryHandle, name: string, contents: string) {
  const handle = await directory.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  await stream.write(contents);
  await stream.close();
  return handle;
}

async function fixture(markers = 3, journals = 2) {
  const harness = createHarness();
  const root = await harness.root.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create: true });
  const writing = await root.getDirectoryHandle('writing', { create: true });
  const objects = await root.getDirectoryHandle('objects', { create: true });
  const ready = await root.getDirectoryHandle('ready', { create: true });
  for (let index = 0; index < markers; index++) {
    await writeFile(writing, `asset-${index}`, '{}');
    await writeFile(objects, `asset-${index}`, 'body');
  }
  const files = [];
  for (let index = 0; index < journals; index++)
    files.push(
      await writeFile(
        ready,
        `journal-${index}`,
        JSON.stringify({
          assetRefs: [],
          createdAt: index,
          domain: 'project-assets',
          journalId: `journal-${index}`,
          payload: {},
        })
      )
    );
  return { ...harness, writing, objects, ready, files };
}

it('reads ready journals once for all eligible markers within the lifecycle hold', async () => {
  const f = await fixture();
  const enumerate = vi.spyOn(f.ready, 'entries');
  const reads = f.files.map((file) => vi.spyOn(file, 'getFile'));
  await expect(
    runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(f.options, async () => false, permit)
    )
  ).resolves.toBe(3);
  expect(enumerate).toHaveBeenCalledOnce();
  for (const read of reads) expect(read).toHaveBeenCalledOnce();
});

function journal(assetId: string, size = 4): AssetReadyJournal {
  return {
    assetRefs: [
      {
        assetId,
        createdAt: 1,
        mimeType: 'application/octet-stream',
        size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      },
    ],
    createdAt: 1,
    domain: 'project-assets',
    journalId: 'claimed',
    payload: {},
  };
}

it.each(['busy', 'missing'])('does not read ready journals for %s markers', async (kind) => {
  const f = await fixture();
  const enumerate = vi.spyOn(f.ready, 'entries');
  const options = {
    ...f.options,
    requestExclusiveLock: async (
      name: string,
      _options: { ifAvailable: boolean },
      callback: (locked: boolean) => Promise<void>
    ) => {
      if (kind === 'missing') await f.writing.removeEntry(name.slice('sniptale-asset:'.length));
      return callback(kind !== 'busy');
    },
  };
  expect(
    await runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(options, async () => false, permit)
    )
  ).toBe(0);
  expect(enumerate).not.toHaveBeenCalled();
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
});

it('sees a late ready claim with failed marker unlink without a lifecycle permit', async () => {
  const f = await fixture(2, 0);
  const enumerate = vi.spyOn(f.ready, 'entries');
  const options = {
    ...f.options,
    requestExclusiveLock: async (
      name: string,
      _options: { ifAvailable: boolean },
      callback: (locked: boolean) => Promise<void>
    ) => {
      if (name === 'sniptale-asset:asset-1') {
        vi.spyOn(f.writing, 'removeEntry').mockRejectedValueOnce(
          new DOMException('unlink', 'NoModificationAllowedError')
        );
        await writeReadyJournal(journal('asset-1'), f.options);
      }
      return callback(true);
    },
  };
  expect(await collectQuiescentWritingObjects(options)).toBe(1);
  expect(enumerate).toHaveBeenCalledTimes(2);
  expect(await (await (await f.objects.getFileHandle('asset-1')).getFile()).text()).toBe('body');
  await expect(f.writing.getFileHandle('asset-1')).rejects.toMatchObject({ name: 'NotFoundError' });
});

it('retains ready bytes and removes only the stale marker after unlink failed', async () => {
  const f = await fixture(1, 0);
  vi.spyOn(f.writing, 'removeEntry').mockRejectedValueOnce(
    new DOMException('unlink', 'NoModificationAllowedError')
  );
  await writeReadyJournal(journal('asset-0'), f.options);
  const nativeClaim = vi.fn(async () => false);
  expect(
    await runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(f.options, nativeClaim, permit)
    )
  ).toBe(0);
  expect(nativeClaim).not.toHaveBeenCalled();
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
  await expect(f.writing.getFileHandle('asset-0')).rejects.toMatchObject({ name: 'NotFoundError' });
});

it('retires the stale marker after journal deletion while preserving native bytes', async () => {
  const f = await fixture(1, 0);
  vi.spyOn(f.writing, 'removeEntry').mockRejectedValueOnce(
    new DOMException('unlink', 'NoModificationAllowedError')
  );
  const ready = journal('asset-0');
  await writeReadyJournal(ready, f.options);
  await deleteReadyJournal(ready.journalId, f.options);
  const enumerate = vi.spyOn(f.ready, 'entries');
  const claim = vi.fn(async () => true);
  expect(
    await runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(f.options, claim, permit)
    )
  ).toBe(0);
  expect(claim).toHaveBeenCalledExactlyOnceWith('asset-0');
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
  await expect(f.writing.getFileHandle('asset-0')).rejects.toMatchObject({ name: 'NotFoundError' });
  claim.mockResolvedValue(false);
  expect(
    await runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(f.options, claim, permit)
    )
  ).toBe(0);
  expect(enumerate).toHaveBeenCalledOnce();
  expect(claim).toHaveBeenCalledOnce();
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
});

it('queues a competing publication until the lifecycle cleanup pass finishes', async () => {
  const f = await fixture(2, 1);
  let published = false;
  let publication: Promise<void> | undefined;
  const options = {
    ...f.options,
    requestExclusiveLock: async (
      name: string,
      _options: { ifAvailable: boolean },
      callback: (locked: boolean) => Promise<void>
    ) => {
      if (name === 'sniptale-asset:asset-1') {
        publication = runWithDurableAssetLifecycleLock(async () => {
          await writeReadyJournal(journal('asset-1'), f.options);
          published = true;
        });
      }
      return callback(true);
    },
  };
  const enumerate = vi.spyOn(f.ready, 'entries');
  await runWithDurableAssetLifecycleLock(async (permit) => {
    expect(
      await collectQuiescentWritingObjects(options, async (id) => id === 'asset-1', permit)
    ).toBe(1);
    expect(published).toBe(false);
  });
  expect(publication).toBeDefined();
  await publication;
  expect(published).toBe(true);
  expect(enumerate).toHaveBeenCalledOnce();
  expect(await (await (await f.objects.getFileHandle('asset-1')).getFile()).text()).toBe('body');
});

it.each(['invalid-json', 'read-error'])(
  'preserves all bytes after %s and rebuilds the snapshot on retry',
  async (failure) => {
    const f = await fixture(2, 1);
    const file = f.files[0];
    if (!file) throw new Error('Missing journal fixture');
    if (failure === 'invalid-json') await writeFile(f.ready, 'journal-0', '{');
    else
      vi.spyOn(file, 'getFile').mockRejectedValueOnce(new DOMException('read', 'NotAllowedError'));
    const cleanup = () =>
      runWithDurableAssetLifecycleLock((permit) =>
        collectQuiescentWritingObjects(f.options, async () => false, permit)
      );
    await expect(cleanup()).rejects.toThrow();
    for (const id of ['asset-0', 'asset-1']) {
      expect(await (await (await f.objects.getFileHandle(id)).getFile()).text()).toBe('body');
      await expect(f.writing.getFileHandle(id)).resolves.toBeDefined();
    }
    await writeFile(
      f.ready,
      'journal-0',
      JSON.stringify({
        assetRefs: [],
        createdAt: 0,
        domain: 'project-assets',
        journalId: 'journal-0',
        payload: {},
      })
    );
    expect(await cleanup()).toBe(2);
  }
);

it('preserves completed deletions and rereads a late claim after retention read failure', async () => {
  const f = await fixture(3, 0);
  await expect(
    runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(
        f.options,
        async (id) => {
          if (id === 'asset-1') throw new Error('authority read');
          return false;
        },
        permit
      )
    )
  ).rejects.toThrow('authority read');
  await expect(f.objects.getFileHandle('asset-0')).rejects.toMatchObject({ name: 'NotFoundError' });
  expect(await (await (await f.objects.getFileHandle('asset-1')).getFile()).text()).toBe('body');
  await writeFile(f.ready, 'claimed', JSON.stringify(journal('asset-1')));
  expect(
    await runWithDurableAssetLifecycleLock((permit) =>
      collectQuiescentWritingObjects(f.options, async () => false, permit)
    )
  ).toBe(1);
  expect(await (await (await f.objects.getFileHandle('asset-1')).getFile()).text()).toBe('body');
});

it('readmits an expired permit and protects a recreated identity with a fresh ready snapshot', async () => {
  const f = await fixture(1, 0);
  const manager: PersistenceLockManager = {
    async request<T>(
      _name: string,
      _options: { mode: 'exclusive' | 'shared'; ifAvailable?: boolean },
      operation: (lock?: unknown) => T | Promise<T>
    ): Promise<T> {
      return operation({});
    },
  };
  const request = vi.spyOn(manager, 'request');
  installPersistenceLockManagerForTests(manager);
  let expired: DurableAssetLifecyclePermit | undefined;
  await runWithDurableAssetLifecycleLock(async (permit) => {
    expired = permit;
    expect(await collectQuiescentWritingObjects(f.options, async () => false, permit)).toBe(1);
  });
  expect(request).toHaveBeenCalledOnce();
  await writeFile(f.objects, 'asset-0', 'new-body');
  await writeFile(f.writing, 'asset-0', '{}');
  await writeFile(f.ready, 'claimed', JSON.stringify(journal('asset-0', 8)));
  expect(await collectQuiescentWritingObjects(f.options, async () => false, expired)).toBe(0);
  expect(request).toHaveBeenCalledTimes(2);
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe(
    'new-body'
  );
});

it('settles selected markers without deleting bytes or ready journal claims', async () => {
  const f = await fixture(3, 0);
  await writeFile(f.ready, 'claimed', JSON.stringify(journal('asset-0')));
  await settleAssetWritingMarkers(['asset-0', 'asset-1'], f.options);
  for (const id of ['asset-0', 'asset-1']) {
    await expect(f.writing.getFileHandle(id)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(await (await (await f.objects.getFileHandle(id)).getFile()).text()).toBe('body');
  }
  await expect(f.writing.getFileHandle('asset-2')).resolves.toBeDefined();
  await expect(f.ready.getFileHandle('claimed')).resolves.toBeDefined();
  await expect(
    settleAssetWritingMarkers(['asset-0', 'missing'], f.options)
  ).resolves.toBeUndefined();
});

it('preserves a busy writer marker until a later settlement pass', async () => {
  const f = await fixture(1, 0);
  let busy = true;
  const requestExclusiveLock = vi.fn(
    async (
      _name: string,
      _options: { ifAvailable: boolean },
      callback: (locked: boolean) => Promise<void>
    ) => callback(!busy)
  );
  const options = { ...f.options, requestExclusiveLock };
  await settleAssetWritingMarkers(['asset-0'], options);
  expect(requestExclusiveLock).toHaveBeenCalledWith(
    'sniptale-asset:asset-0',
    { ifAvailable: true },
    expect.any(Function)
  );
  await expect(f.writing.getFileHandle('asset-0')).resolves.toBeDefined();
  busy = false;
  await settleAssetWritingMarkers(['asset-0'], options);
  await expect(f.writing.getFileHandle('asset-0')).rejects.toMatchObject({ name: 'NotFoundError' });
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
});

it('retries explicit marker settlement after unlink failure without deleting durable bytes', async () => {
  const f = await fixture(1, 0);
  vi.spyOn(f.writing, 'removeEntry').mockRejectedValueOnce(
    new DOMException('unlink', 'NoModificationAllowedError')
  );
  await expect(settleAssetWritingMarkers(['asset-0'], f.options)).rejects.toThrow('unlink');
  await expect(f.writing.getFileHandle('asset-0')).resolves.toBeDefined();
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
  await settleAssetWritingMarkers(['asset-0'], f.options);
  await expect(f.writing.getFileHandle('asset-0')).rejects.toMatchObject({ name: 'NotFoundError' });
});

it('preserves bytes and writing evidence when native retention authority is unresolved', async () => {
  const f = await fixture(1, 0);
  await collectQuiescentWritingObjects(f.options, async () => null);
  await expect(f.writing.getFileHandle('asset-0')).resolves.toBeDefined();
  expect(await (await (await f.objects.getFileHandle('asset-0')).getFile()).text()).toBe('body');
});
