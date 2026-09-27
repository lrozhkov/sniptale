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

describe('image autosave mode', () => {
  it('skips automatic writes while off and saves the latest document when reenabled', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.scheduleAutosave(createDocument('queued'));
    autosave.setEnabled(false);
    expect(autosave.isEnabled()).toBe(false);
    autosave.scheduleAutosave(createDocument('edited-while-off'));
    expect(autosave.hasUnsavedChanges()).toBe(true);
    const document = vi.fn(() => createDocument('latest'));
    await autosave.flushAutosave(document);
    await autosave.persistSnapshot(document);
    await vi.advanceTimersByTimeAsync(500);
    expect(commitWorkspaceMock).not.toHaveBeenCalled();
    expect(document).not.toHaveBeenCalled();

    autosave.setEnabled(true, document);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document).toHaveBeenCalledOnce();
    expect(commitWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ sourceImageData: 'latest' }) })
    );
    expect(autosave.getDurableRevision()).toBe(1);
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('allows an explicit save while autosave is off and resets the mode for a new document', async () => {
    const { createEditorSessionAutosaveService } = await import('./');
    const autosave = createEditorSessionAutosaveService();
    activate(autosave);
    autosave.setEnabled(false);
    await autosave.saveNow(() => createDocument('explicit'));
    expect(commitWorkspaceMock).toHaveBeenCalledOnce();
    expect(autosave.hasUnsavedChanges()).toBe(false);
    expect(autosave.isEnabled()).toBe(false);
    autosave.activate({
      aggregateId: 'image-2',
      durableRevision: 0,
      renderPresentation: null,
      sourceTitle: null,
      sourceUrl: null,
    });
    expect(autosave.isEnabled()).toBe(true);
  });
});
