// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({
  commitPresentation: vi.fn(async () => undefined),
  commitWorkspace: vi.fn(),
  createThumbnail: vi.fn(async () => new Blob(['thumbnail'], { type: 'image/png' })),
  getWorkspace: vi.fn(),
  replaceAggregateId: vi.fn(),
  saveCopy: vi.fn(async () => undefined),
}));

vi.mock('../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/image-aggregates')>()),
  commitImagePresentation: mocks.commitPresentation,
  commitImageWorkspace: mocks.commitWorkspace,
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

beforeEach(() => vi.clearAllMocks());

afterEach(async () => {
  const { useEditorStore } = await import('../state/useEditorStore');
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSaveState('idle');
  useEditorStore.getState().setSessionId(null);
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
  mocks.getWorkspace.mockResolvedValue({
    aggregateId: 'image-original',
    createdAt: 1,
    document,
    releaseDocumentAssets,
    revision: 4,
    sourceTitle: 'Original',
    sourceUrl: null,
    updatedAt: 2,
  });
  mocks.commitWorkspace.mockImplementation(async (input) => {
    if (released) throw new Error('Editor object URL is unavailable');
    return { aggregateId: input.aggregateId, revision: input.expectedRevision + 1 };
  });

  const { createEditorSessionAutosaveService } = await import('../document/session-autosave');
  const { saveStaleEditorImageCopy } = await import('./save-stale-image-copy');
  const autosaveService = createEditorSessionAutosaveService();
  await autosaveService.restoreDraft('image-original');

  await expect(
    saveStaleEditorImageCopy({
      autosaveService,
      controller: {
        exportDocument: vi.fn(() => document),
        renderForExport: vi.fn(async () => 'data:image/png;base64,cHJldmlldw=='),
      },
      isSourceActive: () => true,
      pageTitle: 'Copy',
      sourceAggregateId: 'image-original',
    })
  ).resolves.toBe('saved');

  expect(mocks.replaceAggregateId).toHaveBeenCalledWith('image-copy');
  expect(releaseDocumentAssets).not.toHaveBeenCalled();
  await expect(autosaveService.persistSnapshot(() => document)).resolves.toBeUndefined();
  expect(mocks.commitWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-copy', document })
  );
  expect(autosaveService.getDurableRevision()).toBe(2);

  autosaveService.dispose();
  expect(releaseDocumentAssets).toHaveBeenCalledOnce();
});
