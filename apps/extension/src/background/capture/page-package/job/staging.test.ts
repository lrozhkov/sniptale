import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { MAX_POPUP_EXPORT_JOB_TABS } from '@sniptale/runtime-contracts/export';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  append: vi.fn(),
  discard: vi.fn(),
  finalize: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  createAssetObjectWriter: vi.fn(async () => ({
    abort: mocks.abort,
    append: mocks.append,
    assetId: 'asset-1',
    finalize: mocks.finalize,
  })),
  discardPreparedAsset: mocks.discard,
  readAssetFile: mocks.read,
}));

import { createPagePackageStagingStore, type PagePackageStageBinding } from './staging';
import type { PreparedAssetObject } from '../../../../composition/persistence/assets';

const binding: PagePackageStageBinding = {
  jobId: 'job-1',
  ordinal: 0,
  stagedBlobId: 'stage-1',
  tabId: 7,
};

function base64(value: string): string {
  return btoa(value);
}

function callbacks(
  overrides: Partial<{
    assertBindingActive: (binding: PagePackageStageBinding) => void;
    onFinalized: (binding: PagePackageStageBinding, prepared: PreparedAssetObject) => Promise<void>;
    onReleased: (binding: PagePackageStageBinding) => Promise<void>;
  }> = {}
) {
  return {
    assertBindingActive: overrides.assertBindingActive ?? (() => undefined),
    onFinalized: overrides.onFinalized ?? (async () => undefined),
    onReleased: overrides.onReleased ?? (async () => undefined),
  };
}

describe('Page Package job staging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ref = {
      assetId: 'asset-1',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
      mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
      sha256: 'a'.repeat(64),
      size: 6,
    };
    mocks.finalize.mockResolvedValue({ ref });
    mocks.read.mockResolvedValue(
      new File(['abcdef'], 'stage.page-package', { type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE })
    );
  });

  it('binds ordered chunks to one active job, tab and ordinal', async () => {
    const assertBindingActive = vi.fn();
    const onFinalized = vi.fn<
      (binding: PagePackageStageBinding, prepared: PreparedAssetObject) => Promise<void>
    >(async () => undefined);
    const store = createPagePackageStagingStore(callbacks({ assertBindingActive, onFinalized }));

    await expect(
      store.append({ ...binding, base64: base64('abc'), final: false, sequence: 0 })
    ).resolves.toEqual({ complete: false, stagedBlobId: 'stage-1' });
    await expect(
      store.append({ ...binding, base64: base64('def'), final: true, sequence: 1 })
    ).resolves.toEqual({ complete: true, stagedBlobId: 'stage-1' });
    await expect(store.consume(binding)).resolves.toMatchObject({
      binding,
      prepared: {
        ref: {
          assetId: 'asset-1',
          size: 6,
        },
      },
    });

    expect(assertBindingActive).toHaveBeenCalledTimes(6);
    expect(mocks.append).toHaveBeenCalledTimes(2);
    expect(onFinalized).toHaveBeenCalledOnce();
    expect(onFinalized.mock.calls[0]?.[0]).toEqual(binding);
    expect(Object.keys(onFinalized.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'jobId',
      'ordinal',
      'stagedBlobId',
      'tabId',
    ]);
  });

  it('admits the canonical job ceiling without an eight-page staging cap', async () => {
    const store = createPagePackageStagingStore(callbacks());
    for (let ordinal = 0; ordinal < MAX_POPUP_EXPORT_JOB_TABS; ordinal += 1) {
      await expect(
        store.append({
          ...binding,
          base64: base64('abcdef'),
          final: true,
          ordinal,
          sequence: 0,
          stagedBlobId: `stage-${ordinal}`,
          tabId: ordinal,
        })
      ).resolves.toMatchObject({ complete: true });
    }

    await expect(
      store.append({
        ...binding,
        base64: base64('abcdef'),
        final: true,
        ordinal: MAX_POPUP_EXPORT_JOB_TABS,
        sequence: 0,
        stagedBlobId: 'stage-overflow',
        tabId: MAX_POPUP_EXPORT_JOB_TABS,
      })
    ).rejects.toThrow('Too many Page Package pages');
  });

  it('rejects cross-tab reuse and out-of-order chunks without changing the active record', async () => {
    const store = createPagePackageStagingStore(callbacks());
    await store.append({ ...binding, base64: base64('abc'), final: false, sequence: 0 });

    await expect(
      store.append({ ...binding, tabId: 8, base64: base64('def'), final: true, sequence: 1 })
    ).rejects.toThrow('not writable');
    await expect(
      store.append({ ...binding, base64: base64('def'), final: true, sequence: 2 })
    ).rejects.toThrow('not writable');
    await expect(
      store.append({ ...binding, base64: base64('def'), final: true, sequence: 1 })
    ).resolves.toMatchObject({ complete: true });
  });

  it('compensates the writer when admission is revoked after an append', async () => {
    let admissions = 0;
    const store = createPagePackageStagingStore(
      callbacks({
        assertBindingActive: () => {
          admissions += 1;
          if (admissions === 2) throw new Error('job no longer active');
        },
      })
    );

    await expect(
      store.append({ ...binding, base64: base64('abc'), final: false, sequence: 0 })
    ).rejects.toThrow('job no longer active');
    expect(mocks.abort).toHaveBeenCalledOnce();
  });

  it('releases every prepared object owned by a cancelled job', async () => {
    const onReleased = vi.fn(async () => undefined);
    const store = createPagePackageStagingStore(callbacks({ onReleased }));
    await store.append({ ...binding, base64: base64('abcdef'), final: true, sequence: 0 });

    await store.releaseJob(binding.jobId);

    expect(onReleased).toHaveBeenCalledWith(binding);
    expect(mocks.discard).not.toHaveBeenCalled();
    await expect(store.consume(binding)).rejects.toThrow('missing or incomplete');
  });

  it('keeps durable release authority when physical staged cleanup fails', async () => {
    const onReleased = vi
      .fn()
      .mockRejectedValueOnce(new Error('OPFS busy'))
      .mockResolvedValueOnce(undefined);
    const store = createPagePackageStagingStore(callbacks({ onReleased }));
    await store.append({ ...binding, base64: base64('abcdef'), final: true, sequence: 0 });
    await expect(store.releaseJob(binding.jobId)).rejects.toThrow('staging cleanup failed');

    expect(onReleased).toHaveBeenCalledOnce();
    expect(mocks.discard).not.toHaveBeenCalled();

    await expect(store.releaseJob(binding.jobId)).resolves.toBeUndefined();
    expect(onReleased).toHaveBeenCalledTimes(2);
    await expect(store.consume(binding)).rejects.toThrow('missing or incomplete');
  });

  it('compensates a finalized object when durable admission fails', async () => {
    const onReleased = vi.fn(async () => undefined);
    const store = createPagePackageStagingStore(
      callbacks({
        onFinalized: async () => {
          throw new Error('session write failed');
        },
        onReleased,
      })
    );

    await expect(
      store.append({ ...binding, base64: base64('abcdef'), final: true, sequence: 0 })
    ).rejects.toThrow('session write failed');

    expect(mocks.discard).toHaveBeenCalledWith('asset-1');
    expect(onReleased).not.toHaveBeenCalled();
  });
});
