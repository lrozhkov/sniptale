import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readValidBundleArtifact } from './fixture.test-support';
import {
  deleteEffectBundle,
  EffectBundlePersistenceError,
  getEffectBundle,
  listEffectBundles,
  saveEffectArtifact,
  setEffectBundleEnabled,
} from './index';

const mocks = vi.hoisted(() => {
  const abort = vi.fn();
  const get = vi.fn();
  const getAll = vi.fn();
  const put = vi.fn();
  const remove = vi.fn();
  const store = { get, getAll, put };
  const transaction = vi.fn(() => ({ abort, done: Promise.resolve(), objectStore: () => store }));
  const db = {
    get: vi.fn(),
    getAll: vi.fn(),
    delete: remove,
    transaction,
  };
  return { abort, db, get, getAll, put, remove, transaction };
});

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: async () => mocks.db,
  VIDEO_EFFECT_BUNDLES_STORE: 'video_effect_bundles',
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => unknown) => operation(mocks.db),
}));

beforeEach(() => {
  mocks.abort.mockReset();
  mocks.db.get.mockReset();
  mocks.db.get.mockResolvedValue(undefined);
  mocks.db.getAll.mockReset();
  mocks.get.mockReset();
  mocks.getAll.mockReset();
  mocks.put.mockReset();
  mocks.remove.mockReset();
  mocks.transaction.mockClear();
  mocks.get.mockResolvedValue(undefined);
  mocks.getAll.mockResolvedValue([]);
  mocks.put.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('commits one fully materialized engine2 bundle record in a readwrite transaction', async () => {
  const artifact = await readValidBundleArtifact();

  const entry = await saveEffectArtifact(artifact, 1234);

  expect(entry).toEqual(
    expect.objectContaining({
      createdAt: 1234,
      enabled: true,
      packId: 'sniptale.effect-v1.conformance',
      source: 'bundle-zip',
      updatedAt: 1234,
    })
  );
  expect(entry.documents).toHaveLength(1);
  expect(entry.assets).toHaveLength(1);
  expect(entry.retainedByteLength).toBeGreaterThan(entry.assets[0]!.byteLength);
  expect(mocks.transaction).toHaveBeenCalledWith('video_effect_bundles', 'readwrite');
  expect(mocks.put).toHaveBeenCalledOnce();
  expect(mocks.abort).not.toHaveBeenCalled();
});

it('aborts rather than overwriting an invalid existing catalog authority', async () => {
  mocks.get.mockResolvedValue({ packId: 'sniptale.effect-v1.conformance' });

  await expect(saveEffectArtifact(await readValidBundleArtifact())).rejects.toBeInstanceOf(
    EffectBundlePersistenceError
  );
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.put).not.toHaveBeenCalled();
});

it('revalidates stored source and asset bytes on full read without write-on-read repair', async () => {
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 1234);
  const bytes = new Uint8Array(await entry.assets[0]!.blob.arrayBuffer());
  bytes[0] = bytes[0]! ^ 0xff;
  mocks.db.get.mockResolvedValue({
    ...entry,
    assets: [{ ...entry.assets[0], blob: new Blob([bytes]) }],
  });

  await expect(getEffectBundle(entry.packId)).rejects.toEqual(
    expect.objectContaining({ code: 'catalogIntegrityFailure' })
  );
  expect(mocks.put).toHaveBeenCalledOnce();
});

it('keeps malformed catalog rows visible as typed invalid summaries', async () => {
  mocks.db.getAll.mockResolvedValue([{ packId: 'broken-row' }]);

  await expect(listEffectBundles()).resolves.toEqual([{ packId: 'broken-row', status: 'invalid' }]);
});

it('classifies structurally valid catalog rows with corrupt asset bytes as invalid', async () => {
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 1234);
  const bytes = new Uint8Array(await entry.assets[0]!.blob.arrayBuffer());
  bytes[0] = bytes[0]! ^ 0xff;
  mocks.db.getAll.mockResolvedValue([
    { ...entry, assets: [{ ...entry.assets[0], blob: new Blob([bytes]) }] },
  ]);

  await expect(listEffectBundles()).resolves.toEqual([{ packId: entry.packId, status: 'invalid' }]);
});

it('preserves catalog identity state while replacing the materialized payload', async () => {
  const initial = await saveEffectArtifact(await readValidBundleArtifact(), 1234);
  mocks.get.mockResolvedValue({ ...initial, enabled: false });
  mocks.getAll.mockResolvedValue([{ ...initial, enabled: false }]);

  await expect(saveEffectArtifact(await readValidBundleArtifact(), 5678)).resolves.toMatchObject({
    createdAt: 1234,
    enabled: false,
    updatedAt: 5678,
  });
});

it('fails closed for malformed catalog collection values during save and list', async () => {
  mocks.getAll.mockResolvedValue('invalid');
  await expect(saveEffectArtifact(await readValidBundleArtifact())).rejects.toMatchObject({
    code: 'catalogEntryInvalid',
  });
  expect(mocks.abort).toHaveBeenCalledOnce();

  mocks.db.getAll.mockResolvedValue('invalid');
  await expect(listEffectBundles()).rejects.toMatchObject({ code: 'catalogEntryInvalid' });
});

it('sorts valid summaries by recency without trusting malformed pack identifiers', async () => {
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  mocks.db.getAll.mockResolvedValue([
    { ...entry, packId: 'older', updatedAt: 100 },
    { ...entry, packId: 'newer', updatedAt: 200 },
    null,
  ]);

  await expect(listEffectBundles()).resolves.toMatchObject([
    { packId: 'newer', status: 'ready' },
    { packId: 'older', status: 'ready' },
    { packId: 'invalid', status: 'invalid' },
  ]);
});

it('bounds catalog readiness verification to one retained asset at a time', async () => {
  const first = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  const second = {
    ...first,
    assets: first.assets.map((asset) => ({
      ...asset,
      blob: new Blob([asset.blob], { type: asset.blob.type }),
    })),
    packId: 'second-pack',
    updatedAt: 200,
  };
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstOriginal = first.assets[0]!.blob.arrayBuffer.bind(first.assets[0]!.blob);
  const firstRead = vi.spyOn(first.assets[0]!.blob, 'arrayBuffer').mockImplementation(async () => {
    await firstGate;
    return firstOriginal();
  });
  const secondRead = vi.spyOn(second.assets[0]!.blob, 'arrayBuffer');
  mocks.db.getAll.mockResolvedValue([first, second]);

  const read = listEffectBundles();
  await vi.waitFor(() => expect(firstRead).toHaveBeenCalledOnce());
  expect(secondRead).not.toHaveBeenCalled();
  releaseFirst();

  await expect(read).resolves.toHaveLength(2);
  expect(secondRead).toHaveBeenCalledOnce();
});

it('supports null reads, deletion, missing toggles, and persisted enable state', async () => {
  await expect(getEffectBundle('missing')).resolves.toBeNull();
  await deleteEffectBundle('pack');
  expect(mocks.remove).toHaveBeenCalledWith('video_effect_bundles', 'pack');

  await setEffectBundleEnabled('missing', false);
  expect(mocks.put).not.toHaveBeenCalled();
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  mocks.db.get.mockResolvedValue(entry);
  mocks.get.mockResolvedValue(entry);
  await setEffectBundleEnabled(entry.packId, false);
  expect(mocks.put).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});

it('rejects a malformed enable target before opening a write transaction', async () => {
  mocks.db.get.mockResolvedValue({ packId: 'broken' });

  await expect(setEffectBundleEnabled('broken', false)).rejects.toMatchObject({
    code: 'catalogEntryInvalid',
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it('completes enable integrity verification before opening a write transaction', async () => {
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  const originalArrayBuffer = entry.assets[0]!.blob.arrayBuffer.bind(entry.assets[0]!.blob);
  let releaseIntegrity!: () => void;
  const integrityGate = new Promise<void>((resolve) => {
    releaseIntegrity = resolve;
  });
  const assetBlob = entry.assets[0]!.blob;
  vi.spyOn(assetBlob, 'arrayBuffer').mockImplementation(async () => {
    await integrityGate;
    return originalArrayBuffer();
  });
  mocks.db.get.mockResolvedValue(entry);
  mocks.get.mockResolvedValue(entry);
  mocks.transaction.mockClear();

  const mutation = setEffectBundleEnabled(entry.packId, false);
  await Promise.resolve();
  expect(mocks.transaction).not.toHaveBeenCalled();

  releaseIntegrity();
  await mutation;
  expect(mocks.transaction).toHaveBeenCalledOnce();
});

it('aborts an enable mutation when the stored revision changes after verification', async () => {
  const entry = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  mocks.db.get.mockResolvedValue(entry);
  mocks.get.mockResolvedValue({ ...entry, updatedAt: 200 });
  mocks.put.mockClear();

  await expect(setEffectBundleEnabled(entry.packId, false)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
  expect(mocks.abort).toHaveBeenCalledOnce();
  expect(mocks.put).not.toHaveBeenCalled();
});

it('rejects writes that would consume browser storage headroom', async () => {
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 1, usage: 0 }) },
  });

  await expect(saveEffectArtifact(await readValidBundleArtifact())).rejects.toMatchObject({
    code: 'catalogQuotaExceeded',
  });
  expect(mocks.put).not.toHaveBeenCalled();
});

it('rejects quota arithmetic when a retained row understates its actual bytes', async () => {
  const retained = await saveEffectArtifact(await readValidBundleArtifact(), 100);
  mocks.getAll.mockResolvedValue([{ ...retained, retainedByteLength: 1 }]);
  mocks.put.mockClear();

  await expect(saveEffectArtifact(await readValidBundleArtifact(), 200)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
  expect(mocks.put).not.toHaveBeenCalled();
});

it('resolves the asynchronous storage estimate before opening the mutation transaction', async () => {
  let resolveEstimate!: (estimate: StorageEstimate) => void;
  const estimate = new Promise<StorageEstimate>((resolve) => {
    resolveEstimate = resolve;
  });
  vi.stubGlobal('navigator', { storage: { estimate: vi.fn(() => estimate) } });

  const save = saveEffectArtifact(await readValidBundleArtifact());
  await Promise.resolve();
  expect(mocks.transaction).not.toHaveBeenCalled();

  resolveEstimate({ quota: Number.MAX_SAFE_INTEGER, usage: 0 });
  await save;
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.put).toHaveBeenCalledOnce();
});
