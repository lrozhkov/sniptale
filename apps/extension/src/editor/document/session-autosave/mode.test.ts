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

it('defers document and preview work during a gesture and resumes after the idle delay', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  autosave.scheduleAutosave(createDocument('completed edit'));
  autosave.setInteractionActive(true);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(renderPresentation).not.toHaveBeenCalled();
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(renderPresentation).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('cancels an in-flight preview when input resumes and never publishes its late result', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const autosave = createEditorSessionAutosaveService();
  let finishRender: (value: string) => void = () => undefined;
  const renderPresentation = vi.fn(
    (_signal?: AbortSignal) =>
      new Promise<string>((resolve) => {
        finishRender = resolve;
      })
  );
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  await autosave.saveNow(() => createDocument('saved'));
  await vi.advanceTimersByTimeAsync(3_000);
  const signal = renderPresentation.mock.calls[0]?.[0];
  autosave.setInteractionActive(true);
  expect(signal?.aborted).toBe(true);
  finishRender('data:image/png;base64,cHJldmlldw==');
  await vi.advanceTimersByTimeAsync(0);
  expect(commitPresentationMock).not.toHaveBeenCalled();
  autosave.dispose();
});

it('automatically recovers a temporary preview failure without marking the saved document failed', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const { useEditorStore } = await import('../../state/useEditorStore');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary renderer unavailable'))
    .mockResolvedValue('data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation,
    sourceTitle: null,
    sourceUrl: null,
  });
  await autosave.saveNow(() => createDocument('saved document'));
  await vi.advanceTimersByTimeAsync(3_000);
  expect(renderPresentation).toHaveBeenCalledOnce();
  expect(useEditorStore.getState().saveState).toBe('saved');
  expect(useEditorStore.getState().saveErrorMessage).toBeNull();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(renderPresentation).toHaveBeenCalledTimes(2);
  expect(commitPresentationMock).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  autosave.dispose();
});

it('recovers a restored preview without marking its saved document failed', async () => {
  const { createEditorSessionAutosaveService } = await import('./');
  const { useEditorStore } = await import('../../state/useEditorStore');
  const autosave = createEditorSessionAutosaveService();
  const renderPresentation = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary restore preview failure'))
    .mockResolvedValue('data:image/png;base64,cHJldmlldw==');
  autosave.activate({
    aggregateId: 'restored',
    durableRevision: 4,
    sourceTitle: null,
    sourceUrl: null,
    renderPresentation,
  });
  useEditorStore.getState().setSaveState('saved');
  autosave.schedulePresentation();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(useEditorStore.getState().saveState).toBe('saved');
  expect(useEditorStore.getState().saveErrorMessage).toBeNull();
  await vi.advanceTimersByTimeAsync(6_000);
  expect(commitPresentationMock).toHaveBeenCalledWith(
    expect.objectContaining({ expectedWorkspaceRevision: 4 })
  );
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  autosave.dispose();
});
