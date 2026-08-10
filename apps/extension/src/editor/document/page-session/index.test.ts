// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from './document.test-support';

vi.setConfig({ testTimeout: 20_000 });

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  createId: vi.fn(),
  getBlob: vi.fn(),
  getEntry: vi.fn(),
  readAssetId: vi.fn(),
  restore: vi.fn(),
  toDataUrl: vi.fn(),
}));

vi.mock('../../../composition/persistence/media-library/index.library.ts', async (original) => ({
  ...(await original()),
  getMediaAssetBlob: mocks.getBlob,
  getMediaLibraryEntry: mocks.getEntry,
}));
vi.mock('../../../workflows/editor/bootstrap', async (original) => ({
  ...(await original()),
  consumePendingEditorBootstrapPayload: mocks.bootstrap,
}));
vi.mock('@sniptale/runtime-contracts/editor/session', async (original) => ({
  ...(await original()),
  readEditorAssetId: mocks.readAssetId,
}));
vi.mock('@sniptale/platform/security/secure-random-id', async (original) => ({
  ...(await original()),
  createSecureRandomUuid: mocks.createId,
}));
vi.mock('../../../platform/media-utils/data-url', async (original) => ({
  ...(await original()),
  blobToDataUrl: mocks.toDataUrl,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/apps/extension/src/editor/index.html');
});

describe('stable editor aggregate identity', () => {
  it('reuses an existing aggregate id', async () => {
    const { ensureEditorPageAggregateId } = await import('./');
    expect(ensureEditorPageAggregateId({ assetId: 'image-1', bootstrapId: null })).toBe('image-1');
  });

  it('creates one aggregate id and writes it as assetId without a session id', async () => {
    mocks.createId.mockReturnValue('image-new');
    const { ensureEditorPageAggregateId } = await import('./');
    expect(ensureEditorPageAggregateId({ assetId: null, bootstrapId: 'boot' })).toBe('image-new');
    expect(window.location.search).toBe('?assetId=image-new');
  });

  it('reads only aggregate and bootstrap location state', async () => {
    mocks.readAssetId.mockReturnValue('image-7');
    const { readEditorPageLocationState } = await import('./');
    expect(readEditorPageLocationState('?assetId=image-7&bootstrap=boot-7&session=legacy')).toEqual(
      {
        assetId: 'image-7',
        bootstrapId: 'boot-7',
      }
    );
  });
});

describe('editor aggregate restore', () => {
  it('prefers the workspace for the aggregate', async () => {
    const entry = { aggregateId: 'image-1', document: createEditorDocumentFixture(), revision: 2 };
    mocks.restore.mockResolvedValue(entry);
    const { resolveEditorPageRestoreSource } = await import('./');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: 'boot' }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toEqual({ kind: 'draft', entry });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it('falls back to bootstrap and then immutable original', async () => {
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValueOnce({ dataUrl: 'data:image/png;base64,YQ==' });
    const { resolveEditorPageRestoreSource } = await import('./');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-2', bootstrapId: 'boot' }, 'image-2', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toEqual({ kind: 'bootstrap', payload: { dataUrl: 'data:image/png;base64,YQ==' } });

    mocks.bootstrap.mockResolvedValueOnce(null);
    mocks.getBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
    mocks.getEntry.mockResolvedValue({ filename: 'original.png' });
    mocks.toDataUrl.mockResolvedValue('data:image/png;base64,b3JpZ2luYWw=');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-2', bootstrapId: null }, 'image-2', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toMatchObject({ kind: 'asset', assetId: 'image-2', filename: 'original.png' });
  });
});
