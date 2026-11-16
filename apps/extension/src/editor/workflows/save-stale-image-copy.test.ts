// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEditorSessionAutosaveService } from '../document/session-autosave';
import type { CommitImageWorkspaceInput } from '../../composition/persistence/image-aggregates';
import { saveStaleEditorImageCopy } from './save-stale-image-copy';
import { useEditorStore } from '../state/useEditorStore';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({
  commitPresentation: vi.fn(async () => undefined),
  commitWorkspace: vi.fn(),
  createThumbnail: vi.fn(async () => new Blob(['thumbnail'], { type: 'image/png' })),
  getWorkspace: vi.fn(),
  replaceAggregateId: vi.fn(),
  saveCopy: vi.fn(),
}));

vi.mock('../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/image-aggregates')>()),
  commitImagePresentation: mocks.commitPresentation,
  commitImageWorkspace: mocks.commitWorkspace,
  createImageWorkspaceCommit: (input: CommitImageWorkspaceInput) => () =>
    mocks.commitWorkspace(input),
  saveImageAggregateCopyFromDocument: mocks.saveCopy,
}));

vi.mock('../../composition/persistence/image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/image-workspaces')>()),
  recoverAndGetImageWorkspace: mocks.getWorkspace,
}));

vi.mock('../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: mocks.createThumbnail,
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: vi.fn(() => 'image-copy'),
}));

vi.mock('../document/page-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/page-session')>()),
  replaceEditorPageAggregateId: mocks.replaceAggregateId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.saveCopy.mockResolvedValue({
    aggregateId: 'image-copy',
    revision: 1,
    updatedAt: 1,
    sourceGeneration: 'copy-generation',
    documentAssetsByRuntimeUrl: new Map(),
    documentAssetsByVectorDefinitionId: new Map(),
  });
});

afterEach(async () => {
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSaveState('idle');
  useEditorStore.getState().setSessionId(null);
  vi.useRealTimers();
});

it('keeps restored file URLs alive after save-as-copy and through the next autosave', async () => {
  let released = false;
  const releaseDocumentAssets = vi.fn(() => {
    released = true;
  });
  const document = {
    ...createEditorDocumentFixture(),
    sourceImageData: 'blob:restored-source',
  };
  const copyAssets = new Map();
  mocks.saveCopy.mockResolvedValueOnce({
    aggregateId: 'image-copy',
    revision: 1,
    updatedAt: 1,
    sourceGeneration: 'copy-generation',
    documentAssetsByRuntimeUrl: copyAssets,
    documentAssetsByVectorDefinitionId: new Map(),
  });
  mocks.getWorkspace.mockResolvedValue({
    aggregateId: 'image-original',
    createdAt: 1,
    document,
    releaseDocumentAssets,
    revision: 4,
    sourceGeneration: 'source-generation',
    historyAssetsByValue: new Map([
      [
        'old-resource',
        {
          assetId: 'old-resource',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/old-resource' },
          mimeType: 'application/json',
          size: 2,
          sha256: null,
        },
      ],
    ]),
    sourceTitle: 'Original',
    sourceUrl: null,
    updatedAt: 2,
  });
  mocks.commitWorkspace.mockImplementation(async (input) => {
    if (released) throw new Error('Editor object URL is unavailable');
    return {
      aggregateId: input.aggregateId,
      revision: input.expectedRevision + 1,
      sourceGeneration: input.expectedGeneration,
      documentAssetsByRuntimeUrl: new Map(),
      documentAssetsByVectorDefinitionId: new Map(),
    };
  });

  const autosaveService = createEditorSessionAutosaveService();
  const renderForExport = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==');
  await autosaveService.restoreDraft('image-original');

  await expect(
    saveStaleEditorImageCopy({
      autosaveService,
      controller: {
        exportDocument: vi.fn(() => document),
        renderForExport,
      },
      isSourceActive: () => true,
      pageTitle: 'Copy',
      sourceAggregateId: 'image-original',
    })
  ).resolves.toBe('saved');

  expect(mocks.replaceAggregateId).toHaveBeenCalledWith('image-copy');
  expect(renderForExport).toHaveBeenCalledWith({ format: 'png', quality: 1 });
  expect(releaseDocumentAssets).not.toHaveBeenCalled();
  await expect(autosaveService.persistSnapshot(() => document)).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(3_001);
  expect(renderForExport).toHaveBeenCalledTimes(2);
  expect(renderForExport).toHaveBeenLastCalledWith(
    { format: 'png', quality: 1, signal: expect.any(AbortSignal) },
    'committed'
  );
  expect(mocks.commitWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: 'image-copy',
      document,
      expectedGeneration: 'copy-generation',
      reusableAssetsByRuntimeUrl: copyAssets,
    })
  );
  expect(mocks.commitWorkspace.mock.calls[0]![0].reusableHistoryAssetsByValue.size).toBe(0);
  expect(autosaveService.getDurableRevision()).toBe(2);

  autosaveService.dispose();
  expect(releaseDocumentAssets).toHaveBeenCalledOnce();
});

it('includes the same explicit document and history capture in a working copy', async () => {
  const document = {
    ...createEditorDocumentFixture(),
    sourceImageData: 'data:image/png;base64,QUJDRA==',
  };
  const history = {
    version: 1 as const,
    epoch: 'working-copy',
    cursor: 0,
    snapshots: [JSON.stringify(document)],
    values: [],
    actions: [null],
  };
  const prepareHistory = vi.fn(() => () => history);
  const autosaveService = createEditorSessionAutosaveService({ prepareHistory });
  autosaveService.activate({
    aggregateId: 'image-original',
    durableRevision: 4,
    sourceGeneration: 'source-generation',
    sourceTitle: 'Original',
    sourceUrl: null,
    renderPresentation: null,
  });
  await saveStaleEditorImageCopy({
    autosaveService,
    controller: {
      exportDocument: () => document,
      renderForExport: async () => 'data:image/png;base64,QUJDRA==',
    },
    isSourceActive: () => true,
    pageTitle: 'Copy',
    sourceAggregateId: 'image-original',
  });
  expect(prepareHistory).toHaveBeenCalledWith(document, 'explicit');
  expect(mocks.saveCopy).toHaveBeenCalledWith(expect.objectContaining({ document, history }));
  expect(autosaveService.getSourceGeneration()).toBe('copy-generation');
  autosaveService.dispose();
});

it('retains a newer dirty buffer when a copy of the earlier document finishes', async () => {
  const document = {
    ...createEditorDocumentFixture(),
    sourceImageData: 'data:image/png;base64,QUJDRA==',
  };
  const autosaveService = createEditorSessionAutosaveService();
  autosaveService.activate({
    aggregateId: 'image-original',
    durableRevision: 4,
    sourceGeneration: 'source-generation',
    sourceTitle: 'Original',
    sourceUrl: null,
    renderPresentation: null,
  });
  autosaveService.setEnabled(false);
  const done = Promise.withResolvers<unknown>();
  mocks.saveCopy.mockImplementationOnce(() => done.promise);
  const operation = saveStaleEditorImageCopy({
    autosaveService,
    controller: {
      exportDocument: () => document,
      renderForExport: async () => 'data:image/png;base64,QUJDRA==',
    },
    isSourceActive: () => true,
    pageTitle: 'Copy',
    sourceAggregateId: 'image-original',
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.saveCopy).toHaveBeenCalledOnce();
  autosaveService.scheduleAutosave({ ...document, displayName: 'Newer edit' });
  done.resolve({
    aggregateId: 'image-copy',
    revision: 1,
    updatedAt: 1,
    sourceGeneration: 'copy-generation',
    documentAssetsByRuntimeUrl: new Map(),
    documentAssetsByVectorDefinitionId: new Map(),
  });
  expect(await operation).toBe('stale');
  expect(autosaveService.hasUnsavedChanges()).toBe(true);
  expect(autosaveService.getDurableRevision()).toBe(4);
  expect(useEditorStore.getState().sessionId).toBe('image-original');
  autosaveService.dispose();
});
