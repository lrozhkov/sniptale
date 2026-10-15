import { afterEach, beforeEach, vi } from 'vitest';
import { createEditorDocumentFixture } from '../page-session/document.test-support';

vi.setConfig({ testTimeout: 20_000 });

const {
  commitPresentationMock,
  commitWorkspaceMock,
  createThumbnailMock,
  getWorkspaceMock,
  loggerErrorMock,
  loggerWarnMock,
  publishLibraryChangedMock,
} = vi.hoisted(() => ({
  commitPresentationMock: vi.fn(),
  commitWorkspaceMock: vi.fn(),
  createThumbnailMock: vi.fn(async () => new Blob(['thumbnail'], { type: 'image/png' })),
  getWorkspaceMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  publishLibraryChangedMock: vi.fn(),
}));

export {
  commitPresentationMock,
  commitWorkspaceMock,
  createThumbnailMock,
  getWorkspaceMock,
  loggerWarnMock,
  publishLibraryChangedMock,
};

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: publishLibraryChangedMock,
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

export function activate(
  autosave: ReturnType<typeof import('./').createEditorSessionAutosaveService>
) {
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation: null,
    sourceTitle: 'Capture',
    sourceUrl: 'https://example.test',
  });
}

export function createDocument(sourceImageData: string) {
  return { ...createEditorDocumentFixture(), sourceImageData };
}
