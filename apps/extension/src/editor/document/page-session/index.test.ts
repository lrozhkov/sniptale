// @vitest-environment jsdom

import { legacyImageProjectId } from '../../../composition/persistence/media-library/legacy-projects';
import { MissingAssetObjectError } from '../../../composition/persistence/assets';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from './document.test-support';

vi.setConfig({ testTimeout: 20_000 });

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  createId: vi.fn(),
  getBlob: vi.fn(),
  getEntry: vi.fn(),
  ensureNative: vi.fn(),
  readLocalDraft: vi.fn(),
  inspectRecovery: vi.fn(),
  readAssetId: vi.fn(),
  restore: vi.fn(),
  stored: vi.fn(),
  toDataUrl: vi.fn(),
}));

vi.mock('../../../composition/persistence/media-library/index.library.ts', async (original) => ({
  ...(await original()),
  getMediaAssetBlob: mocks.getBlob,
  getMediaLibraryEntry: mocks.getEntry,
}));
vi.mock('../../../composition/persistence/image-workspaces/read', async (original) => ({
  ...(await original()),
  readImageWorkspace: mocks.readLocalDraft,
  readImageOriginalSource: async (id: string, options?: { includeBlob?: boolean }) => {
    if (options?.includeBlob === false) return mocks.inspectRecovery(id);
    const [blob, asset] = await Promise.all([
      mocks.getBlob().catch((error: unknown) => {
        if (error instanceof Error && error.name === 'NotFoundError')
          throw new MissingAssetObjectError('original');
        throw error;
      }),
      mocks.getEntry(),
    ]);
    return { blob, asset, sourceGeneration: 'observed-generation' };
  },
}));
vi.mock('../../../composition/persistence/image-workspaces', async (original) => ({
  ...(await original()),
  recoverAndGetStoredImageWorkspace: mocks.stored,
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
vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: ({ assetId }: { assetId: string }) =>
    new URL(`/editor?assetId=${assetId}`, window.location.origin).toString(),
}));
vi.mock('../../../platform/media-utils/data-url', async (original) => ({
  ...(await original()),
  blobToDataUrl: mocks.toDataUrl,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stored.mockReset().mockResolvedValue(undefined);
  mocks.ensureNative.mockReset().mockResolvedValue(undefined);
  mocks.inspectRecovery.mockReset().mockResolvedValue({ asset: undefined, sourceGeneration: null });
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

  it('clears session restore parameters while preserving unrelated page state', async () => {
    window.history.replaceState(
      {},
      '',
      '/apps/extension/src/editor/index.html?assetId=image-7&bootstrap=boot-7&session=legacy&theme=dark'
    );
    const { clearEditorPageSession } = await import('./');

    clearEditorPageSession();

    expect(window.location.search).toBe('?theme=dark');
  });

  it('assigns a local project URL only after publication is acknowledged', async () => {
    window.history.replaceState(
      {},
      '',
      '/apps/extension/src/editor/index.html?assetId=library-1&bootstrap=boot-1&session=legacy&theme=dark'
    );
    mocks.createId.mockReturnValueOnce('local-project').mockReturnValueOnce('local-original');
    const renderPresentation = vi.fn();
    let onFirstPublication: (() => void) | undefined;
    const activate = vi.fn((value: { onFirstPublication?: () => void }) => {
      onFirstPublication = value.onFirstPublication;
    });
    const source = { dataUrl: 'data:image/png;base64,YQ==', width: 1, height: 1 };
    const { beginEditorPageLocalDraft } = await import('./');
    expect(
      beginEditorPageLocalDraft({
        autosaveService: { activate },
        renderPresentation,
        sourceTitle: 'local.png',
        source,
      })
    ).toBe('local-project');
    expect(window.location.search).toBe('?theme=dark');
    expect(activate).toHaveBeenCalledWith({
      aggregateId: 'local-project',
      newOriginal: { ...source, mediaId: 'local-original', filename: 'local.png' },
      onFirstPublication: expect.any(Function),
      durableRevision: 0,
      renderPresentation,
      sourceTitle: 'local.png',
      sourceUrl: '',
    });
    onFirstPublication?.();
    expect(new URLSearchParams(window.location.search).get('assetId')).toBe('local-project');
    expect(new URLSearchParams(window.location.search).get('theme')).toBe('dark');
  });
});

describe('editor aggregate restore', () => {
  it('keeps a damaged workspace blocked even when the immutable original exists', async () => {
    mocks.getEntry.mockResolvedValue({
      id: 'image-1',
      kind: 'image',
      workspaceRevision: 3,
      blob: new Blob(['original'], { type: 'image/png' }),
    });
    mocks.getBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
    mocks.restore.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NotFoundError' }));
    const { resolveEditorPageRestoreSource } = await import('./');

    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: null }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).rejects.toMatchObject({ name: 'MissingEditorDraftAssetError' });
    expect(mocks.getEntry).not.toHaveBeenCalled();
    expect(mocks.getBlob).not.toHaveBeenCalled();
  });
  it('classifies absent OPFS objects and broken draft refs as missing local files', async () => {
    const { MissingAssetObjectError } = await import('../../../composition/persistence/assets');
    const { MissingEditorDocumentAssetError } =
      await import('../../../composition/persistence/document-assets');
    const { resolveEditorPageRestoreSource } = await import('./');
    const restore = { restoreDraft: mocks.restore };
    for (const error of [
      new MissingAssetObjectError('asset-1'),
      new MissingEditorDocumentAssetError('asset-1'),
    ]) {
      mocks.restore.mockRejectedValueOnce(error);
      await expect(
        resolveEditorPageRestoreSource(
          { assetId: 'image-1', bootstrapId: null },
          'image-1',
          restore
        )
      ).rejects.toMatchObject({ name: 'MissingEditorDraftAssetError' });
    }
    expect(mocks.getBlob).not.toHaveBeenCalled();
  });

  it('does not overwrite a draft when one of its stored files is missing', async () => {
    mocks.restore.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NotFoundError' }));
    const { resolveEditorPageRestoreSource } = await import('./');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: null }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).rejects.toMatchObject({ name: 'MissingEditorDraftAssetError' });
    expect(mocks.getBlob).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it('classifies a missing stored original without replacing or deleting its library entry', async () => {
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValue(null);
    mocks.getEntry.mockResolvedValue({ filename: 'original.png' });
    mocks.getBlob.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NotFoundError' }));
    const { resolveEditorPageRestoreSource } = await import('./');

    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: null }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).rejects.toMatchObject({ name: 'MissingEditorOriginalError' });
  });
  it('classifies a missing OPFS objects directory for an original', async () => {
    const { MissingAssetObjectError } = await import('../../../composition/persistence/assets');
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValue(null);
    mocks.getEntry.mockResolvedValue({ filename: 'original.png' });
    mocks.getBlob.mockRejectedValue(new MissingAssetObjectError('asset-1'));
    const { resolveEditorPageRestoreSource } = await import('./');

    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: null }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).rejects.toMatchObject({ name: 'MissingEditorOriginalError' });
  });
  it('does not label a library metadata failure as a missing image file', async () => {
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValue(null);
    mocks.getBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    mocks.getEntry.mockRejectedValue(
      Object.assign(new Error('store unavailable'), { name: 'NotFoundError' })
    );
    const { resolveEditorPageRestoreSource } = await import('./');

    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-1', bootstrapId: null }, 'image-1', {
        restoreDraft: mocks.restore,
      })
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });
  it('prefers the workspace for the aggregate', async () => {
    const entry = {
      aggregateId: 'image-1',
      createdAt: 200,
      document: createEditorDocumentFixture(),
      revision: 2,
    };
    mocks.restore.mockResolvedValue(entry);
    mocks.getEntry.mockResolvedValue({ createdAt: 100 });
    const { resolveEditorPageRestoreSource } = await import('./');
    const isCurrent = vi.fn(() => true);
    await expect(
      resolveEditorPageRestoreSource(
        { assetId: 'image-1', bootstrapId: 'boot' },
        'image-1',
        { restoreDraft: mocks.restore },
        isCurrent
      )
    ).resolves.toEqual({ kind: 'draft', entry, capturedAt: 100 });
    expect(mocks.restore).toHaveBeenCalledWith('image-1', isCurrent);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it('opens a legacy immutable original without a workspace revision at native revision zero', async () => {
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValue(null);
    mocks.getBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
    mocks.getEntry.mockResolvedValue({ filename: 'legacy.png', createdAt: 150 });
    mocks.toDataUrl.mockResolvedValue('data:image/png;base64,b3JpZ2luYWw=');
    const { resolveEditorPageRestoreSource } = await import('./');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'legacy', bootstrapId: null }, 'legacy', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toMatchObject({
      kind: 'asset',
      assetId: 'legacy',
      nativeRevision: 0,
      filename: 'legacy.png',
    });
  });

  it('uses bootstrap for a new image and the native original for an asset URL', async () => {
    mocks.restore.mockResolvedValue(undefined);
    mocks.bootstrap.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,YQ==',
      capturedAt: 300,
    });
    mocks.getEntry.mockResolvedValueOnce({ createdAt: 250 });
    const { resolveEditorPageRestoreSource } = await import('./');
    await expect(
      resolveEditorPageRestoreSource({ assetId: null, bootstrapId: 'boot' }, 'image-2', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toEqual({
      kind: 'bootstrap',
      payload: { dataUrl: 'data:image/png;base64,YQ==', capturedAt: 300 },
      capturedAt: 250,
    });

    mocks.bootstrap.mockResolvedValueOnce(null);
    mocks.getBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
    mocks.getEntry.mockResolvedValue({
      filename: 'original.png',
      createdAt: 150,
      workspaceRevision: 7,
    });
    mocks.toDataUrl.mockResolvedValue('data:image/png;base64,b3JpZ2luYWw=');
    await expect(
      resolveEditorPageRestoreSource({ assetId: 'image-2', bootstrapId: null }, 'image-2', {
        restoreDraft: mocks.restore,
      })
    ).resolves.toMatchObject({
      kind: 'asset',
      assetId: 'image-2',
      filename: 'original.png',
      nativeRevision: 7,
      sourceGeneration: 'observed-generation',
      capturedAt: 150,
    });
  });
});

vi.mock('../../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: mocks.ensureNative,
}));

it('replaces the library URL without bootstrap state and can restore the exact source location', async () => {
  const { replaceEditorPageImageLocation } = await import('./');
  window.history.replaceState(
    { retained: true },
    '',
    '/editor?assetId=old&editorBootstrap=boot&session=legacy#view'
  );
  const before = window.location.href;
  const undo = replaceEditorPageImageLocation('selected');
  expect(location.search).toBe('?assetId=selected');
  undo();
  expect(location.href).toBe(before);
  expect(history.state).toEqual({ retained: true });
});
it('does not restore an older switch URL over a newer navigation owner', async () => {
  const { replaceEditorPageImageLocation } = await import('./');
  const undo = replaceEditorPageImageLocation('selected');
  history.replaceState({}, '', '/editor?assetId=newer');
  undo();
  expect(location.search).toBe('?assetId=newer');
});

it('uses the native lifetime and source instead of a stale bootstrap for an existing asset URL', async () => {
  mocks.restore.mockResolvedValue(undefined);
  mocks.bootstrap.mockResolvedValue({
    dataUrl: 'data:image/png;base64,b2xk',
    title: 'Old bootstrap',
  });
  mocks.getEntry.mockResolvedValue({
    id: 'native-capture',
    filename: 'capture.png',
    workspaceRevision: 0,
    createdAt: 100,
    sourceTitle: 'Native capture',
  });
  mocks.getBlob.mockResolvedValue(new Blob(['native'], { type: 'image/png' }));
  mocks.toDataUrl.mockResolvedValue('data:image/png;base64,bmF0aXZl');
  const { resolveEditorPageRestoreSource } = await import('./');
  await expect(
    resolveEditorPageRestoreSource(
      { assetId: 'native-capture', bootstrapId: 'old' },
      'native-capture',
      { restoreDraft: mocks.restore }
    )
  ).resolves.toMatchObject({
    kind: 'asset',
    assetId: 'native-capture',
    nativeRevision: 0,
    sourceGeneration: 'observed-generation',
    sourceTitle: 'Native capture',
    dataUrl: 'data:image/png;base64,bmF0aXZl',
  });
});

it('does not resurrect a removed native asset from its obsolete bootstrap', async () => {
  mocks.restore.mockResolvedValue(undefined);
  mocks.bootstrap.mockResolvedValue({ dataUrl: 'data:image/png;base64,b2xk' });
  mocks.getEntry.mockResolvedValue(undefined);
  mocks.getBlob.mockResolvedValue(undefined);
  const { resolveEditorPageRestoreSource } = await import('./');
  await expect(
    resolveEditorPageRestoreSource({ assetId: 'removed', bootstrapId: 'old' }, 'removed', {
      restoreDraft: mocks.restore,
    })
  ).resolves.toEqual({ kind: 'empty' });
});

it('loads a new independent editor session from its original', async () => {
  mocks.readAssetId.mockReturnValue('new-project');
  mocks.restore.mockResolvedValue(undefined);
  mocks.getBlob.mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
  mocks.getEntry.mockResolvedValue({ filename: 'original.png', workspaceRevision: 7 });
  mocks.toDataUrl.mockResolvedValue('data:image/png;base64,b3JpZ2luYWw=');
  const { readEditorPageLocationState, resolveEditorPageRestoreSource } = await import('./');
  const location = readEditorPageLocationState('?assetId=new-project&originalId=original');
  expect(location).toMatchObject({ assetId: 'new-project', originalId: 'original' });
  await expect(
    resolveEditorPageRestoreSource(location, 'new-project', { restoreDraft: mocks.restore })
  ).resolves.toMatchObject({
    kind: 'asset',
    assetId: 'new-project',
    nativeRevision: 0,
    sourceGeneration: null,
    original: { mediaId: 'original', generation: 'observed-generation' },
  });
  expect(mocks.restore).toHaveBeenCalledWith('new-project', undefined);
  expect(mocks.bootstrap).not.toHaveBeenCalled();
});

it('refuses a missing native original instead of replacing it from bootstrap pixels', async () => {
  mocks.restore.mockResolvedValue(undefined);
  mocks.bootstrap.mockResolvedValue({ dataUrl: 'data:image/png;base64,b2xk' });
  mocks.getEntry.mockResolvedValue({ id: 'native-capture', workspaceRevision: 0 });
  mocks.getBlob.mockResolvedValue(undefined);
  const { resolveEditorPageRestoreSource } = await import('./');
  await expect(
    resolveEditorPageRestoreSource(
      { assetId: 'native-capture', bootstrapId: 'old' },
      'native-capture',
      { restoreDraft: mocks.restore }
    )
  ).rejects.toMatchObject({ name: 'MissingEditorOriginalError' });
});

it.each([null, 'consumed-bootstrap'])(
  'resumes the migrated Image project with bootstrap=%s',
  async (bootstrapId) => {
    const sourceMediaId = 'legacy-image';
    const id = legacyImageProjectId(sourceMediaId);
    mocks.stored.mockImplementation(async () => {
      expect(mocks.restore).not.toHaveBeenCalled();
      return { aggregateId: id, sourceMediaId };
    });
    const entry = {
      aggregateId: id,
      sourceMediaId,
      revision: 5,
      document: createEditorDocumentFixture(),
    };
    mocks.restore.mockResolvedValue(entry);
    mocks.getEntry.mockResolvedValue({ createdAt: 40 });
    const { resolveEditorPageRestoreSource } = await import('./');
    const result = await resolveEditorPageRestoreSource(
      { assetId: sourceMediaId, bootstrapId },
      sourceMediaId,
      { restoreDraft: mocks.restore }
    );
    expect(result).toEqual({ kind: 'draft', entry, capturedAt: 40 });
    expect(mocks.restore).toHaveBeenCalledExactlyOnceWith(id, undefined);
    expect(mocks.getEntry).toHaveBeenCalledExactlyOnceWith(sourceMediaId);
  }
);

it('offers original recovery when migrated project admission finds a missing document file', async () => {
  const sourceMediaId = 'legacy-image';
  const id = legacyImageProjectId(sourceMediaId);
  mocks.stored.mockResolvedValue({ aggregateId: id, sourceMediaId });
  mocks.inspectRecovery.mockResolvedValue({
    asset: { id, workspaceRevision: 8 },
    sourceMediaId,
    sourceGeneration: 'before-opening',
  });
  mocks.ensureNative.mockRejectedValueOnce(new Error('Native editing resources are unavailable.'));
  mocks.readLocalDraft.mockRejectedValueOnce(new MissingAssetObjectError('history-object'));
  const { resolveEditorPageRestoreSource } = await import('./');
  await expect(
    resolveEditorPageRestoreSource({ assetId: sourceMediaId, bootstrapId: null }, sourceMediaId, {
      restoreDraft: mocks.restore,
    })
  ).rejects.toMatchObject({
    name: 'MissingEditorDraftAssetError',
    recovery: {
      routeAssetId: sourceMediaId,
      aggregateId: id,
      sourceMediaId,
      revision: 8,
      generation: 'before-opening',
    },
  });
  expect(mocks.inspectRecovery.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.ensureNative.mock.invocationCallOrder[0]!
  );
  expect(mocks.ensureNative).toHaveBeenCalledExactlyOnceWith({
    rootKind: 'image-project',
    rootId: id,
  });
  expect(mocks.readLocalDraft).toHaveBeenCalledExactlyOnceWith(id);
  expect(mocks.restore).not.toHaveBeenCalled();
});
