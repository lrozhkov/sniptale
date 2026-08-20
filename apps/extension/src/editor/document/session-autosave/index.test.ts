// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../page-session/document.test-support';

vi.setConfig({ testTimeout: 20_000 });

const {
  commitPresentationMock,
  commitWorkspaceMock,
  createThumbnailMock,
  getWorkspaceMock,
  loggerErrorMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  commitPresentationMock: vi.fn(),
  commitWorkspaceMock: vi.fn(),
  createThumbnailMock: vi.fn(async () => new Blob(['thumbnail'], { type: 'image/png' })),
  getWorkspaceMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-aggregates')>()),
  commitImageWorkspace: commitWorkspaceMock,
  commitImagePresentation: commitPresentationMock,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: createThumbnailMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  })),
}));

vi.mock('../../../composition/persistence/image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-workspaces')>()),
  recoverAndGetImageWorkspace: getWorkspaceMock,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  commitWorkspaceMock.mockImplementation(async (input) => ({
    aggregateId: input.aggregateId,
    documentAssetsByRuntimeUrl: input.reusableAssetsByRuntimeUrl ?? new Map(),
    revision: input.expectedRevision + 1,
  }));
});

afterEach(async () => {
  const { useEditorStore } = await import('../../state/useEditorStore');
  useEditorStore.getState().setSaveState('idle');
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSessionId(null);
  vi.useRealTimers();
  vi.resetModules();
});

function activate(autosave: ReturnType<typeof import('./').createEditorSessionAutosaveService>) {
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation: null,
    sourceTitle: 'Capture',
    sourceUrl: 'https://example.test',
  });
}

function createDocument(sourceImageData: string) {
  return { ...createEditorDocumentFixture(), sourceImageData };
}

describe('image aggregate autosave', () => {
  it('debounces to the latest document and advances the durable revision', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('first'));
    const latest = createDocument('latest');
    autosave.scheduleAutosave(latest);

    await vi.advanceTimersByTimeAsync(400);

    expect(commitWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(commitWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateId: 'image-1', document: latest, expectedRevision: 0 })
    );
    expect(autosave.getDurableRevision()).toBe(1);
  });

  it('restores the same aggregate workspace', async () => {
    const entry = {
      aggregateId: 'image-2',
      document: createDocument('restored'),
      revision: 4,
      sourceTitle: null,
      sourceUrl: null,
      createdAt: 1,
      updatedAt: 2,
    };
    getWorkspaceMock.mockResolvedValue(entry);
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();

    await expect(autosave.restoreDraft('image-2')).resolves.toEqual(entry);
    expect(autosave.getDurableRevision()).toBe(4);
  });

  it('keeps inactive operations inert and reports a missing workspace', async () => {
    getWorkspaceMock.mockResolvedValue(undefined);
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    const getDocument = vi.fn(() => createDocument('unused'));

    autosave.updateContext({ sourceTitle: 'Ignored' });
    autosave.scheduleAutosave(createDocument('unused'));
    await autosave.flushAutosave(getDocument);
    await autosave.persistSnapshot(getDocument);
    await expect(autosave.restoreDraft('missing')).resolves.toBeUndefined();

    expect(getDocument).not.toHaveBeenCalled();
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBeNull();
  });

  it('updates context metadata before a direct snapshot and supports explicit flush', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.updateContext({ sourceTitle: 'Updated', sourceUrl: null });

    await autosave.persistSnapshot(() => createDocument('direct'));
    autosave.scheduleAutosave(createDocument('pending'));
    const fallback = vi.fn(() => createDocument('fallback'));
    await autosave.flushAutosave(fallback);

    expect(commitWorkspaceMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceTitle: 'Updated', sourceUrl: null })
    );
    expect(commitWorkspaceMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ document: expect.objectContaining({ sourceImageData: 'pending' }) })
    );
    expect(fallback).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBe(2);
  });

  it('ends the active autosave context and discards pending UI state', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('queued'));
    await autosave.discardDraft();
    await vi.advanceTimersByTimeAsync(500);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBeNull();
    expect(useEditorStore.getState().sessionId).toBeNull();
  });

  it('surfaces a failed workspace commit without advancing revision', async () => {
    commitWorkspaceMock.mockRejectedValueOnce(new Error('write failed'));
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('queued'));
    await vi.advanceTimersByTimeAsync(400);
    expect(useEditorStore.getState().saveState).toBe('error');
    expect(autosave.getDurableRevision()).toBe(0);
  });

  it('rethrows direct snapshot failures with a fallback message for non-errors', async () => {
    commitWorkspaceMock.mockRejectedValueOnce('write failed');
    const { createEditorSessionAutosaveService } = await import('./');
    const { useEditorStore } = await import('../../state/useEditorStore');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);

    await expect(autosave.persistSnapshot(() => createDocument('direct'))).rejects.toBe(
      'write failed'
    );
    expect(useEditorStore.getState().saveErrorMessage).toBe('Failed to save draft');
  });

  it('updates presentation after a durable commit and tolerates presentation failures', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const { StaleImageWorkspaceError } =
      await import('../../../composition/persistence/image-aggregates');
    const autosave = createEditorSessionAutosaveService();
    const renderPresentation = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==');
    autosave.activate({
      aggregateId: 'image-1',
      durableRevision: 0,
      renderPresentation,
      sourceTitle: null,
      sourceUrl: null,
    });

    await autosave.persistSnapshot(() => createDocument('presentation'));
    await vi.waitFor(() => expect(commitPresentationMock).toHaveBeenCalledOnce());
    expect(commitPresentationMock).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateId: 'image-1', expectedWorkspaceRevision: 1 })
    );

    commitPresentationMock.mockRejectedValueOnce(new Error('render storage failed'));
    await autosave.persistSnapshot(() => createDocument('presentation-failure'));
    await vi.waitFor(() =>
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'Failed to update image presentation',
        expect.any(Error)
      )
    );

    loggerWarnMock.mockClear();
    commitPresentationMock.mockRejectedValueOnce(new StaleImageWorkspaceError('image-1'));
    await autosave.persistSnapshot(() => createDocument('stale-presentation'));
    await vi.waitFor(() => expect(commitPresentationMock).toHaveBeenCalledTimes(3));
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it('clears stale write state and pending work when rebinding to a saved copy', async () => {
    commitWorkspaceMock.mockRejectedValueOnce(new Error('stale workspace'));
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('stale'));
    await vi.advanceTimersByTimeAsync(400);
    expect(autosave.getLastWriteError()).toBeInstanceOf(Error);

    autosave.scheduleAutosave(createDocument('must-not-overwrite-copy'));
    autosave.rebindAggregate({
      aggregateId: 'image-copy',
      durableRevision: 1,
      renderPresentation: null,
      sourceTitle: 'Copy',
      sourceUrl: null,
    });
    await vi.advanceTimersByTimeAsync(500);

    expect(autosave.getLastWriteError()).toBeNull();
    expect(autosave.getDurableRevision()).toBe(1);
    expect(commitWorkspaceMock).toHaveBeenCalledTimes(1);
  });

  it('disposes pending work and detaches the active aggregate', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('must-not-save'));

    autosave.dispose();
    await vi.advanceTimersByTimeAsync(500);

    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBeNull();
  });

  it('safely drains stale internal queue states without persisting empty work', async () => {
    const { activateAutosaveContext } = await import('./lifecycle');
    const { queuePendingAutosave } = await import('./persistence');
    const { createAutosaveState } = await import('./state');
    const context = {
      aggregateId: 'image-internal',
      durableRevision: 0,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    };

    const recoveredChainState = createAutosaveState();
    activateAutosaveContext(recoveredChainState, context);
    const rejectedWrite = Promise.reject(new Error('previous queue failure'));
    void rejectedWrite.catch(() => undefined);
    recoveredChainState.writeChain = rejectedWrite;
    queuePendingAutosave(recoveredChainState, createDocument('after-failure'));
    await vi.advanceTimersByTimeAsync(400);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();

    const detachedState = createAutosaveState();
    activateAutosaveContext(detachedState, context);
    queuePendingAutosave(detachedState, createDocument('detached'));
    detachedState.activeContext = null;
    await vi.advanceTimersByTimeAsync(400);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();

    const emptyState = createAutosaveState();
    activateAutosaveContext(emptyState, context);
    queuePendingAutosave(emptyState, createDocument('cleared'));
    emptyState.pendingDocument = null;
    await vi.advanceTimersByTimeAsync(400);
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  });
});

describe('image workspace hydration freshness', () => {
  it('carries hydrated asset identity across consecutive autosaves', async () => {
    const restoredAssets = new Map([
      [
        'blob:hydrated-source',
        {
          assetId: 'source-asset',
          createdAt: 1,
          location: { kind: 'opfs' as const, objectKey: 'objects/source-asset' },
          mimeType: 'image/png',
          sha256: null,
          size: 6,
        },
      ],
    ]);
    getWorkspaceMock.mockResolvedValue({
      aggregateId: 'image-2',
      createdAt: 1,
      document: createDocument('blob:hydrated-source'),
      documentAssetsByRuntimeUrl: restoredAssets,
      revision: 4,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 2,
    });
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    await autosave.restoreDraft('image-2');

    await autosave.persistSnapshot(() => createDocument('blob:hydrated-source'));
    await autosave.persistSnapshot(() => createDocument('blob:hydrated-source'));

    expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(commitWorkspaceMock.mock.calls[0]?.[0].reusableAssetsByRuntimeUrl).toBe(restoredAssets);
    expect(commitWorkspaceMock.mock.calls[1]?.[0].reusableAssetsByRuntimeUrl).toBe(restoredAssets);
  });

  it('discards a late hydrated draft without revoking the newer active document', async () => {
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    const releaseOlder = vi.fn();
    const releaseNewer = vi.fn();
    getWorkspaceMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNewer = resolve;
        })
      );
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    let generation = 1;
    const older = autosave.restoreDraft('image-older', () => generation === 1);
    generation = 2;
    const newer = autosave.restoreDraft('image-newer', () => generation === 2);

    resolveNewer({
      aggregateId: 'image-newer',
      createdAt: 1,
      document: createDocument('newer'),
      releaseDocumentAssets: releaseNewer,
      revision: 8,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 2,
    });
    await expect(newer).resolves.toEqual(expect.objectContaining({ aggregateId: 'image-newer' }));
    resolveOlder({
      aggregateId: 'image-older',
      createdAt: 1,
      document: createDocument('older'),
      releaseDocumentAssets: releaseOlder,
      revision: 4,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 2,
    });

    await expect(older).resolves.toBeUndefined();
    expect(releaseOlder).toHaveBeenCalledOnce();
    expect(releaseNewer).not.toHaveBeenCalled();
    expect(autosave.getDurableRevision()).toBe(8);

    autosave.dispose();
    expect(releaseNewer).toHaveBeenCalledOnce();
  });
});
