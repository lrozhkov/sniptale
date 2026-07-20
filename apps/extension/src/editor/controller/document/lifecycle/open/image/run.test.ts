import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyOpenedEditorDocumentMock: vi.fn(async () => undefined),
  createOpenedEditorDocumentMock: vi.fn(),
  resolveBrowserFrameFaviconDataUrlMock: vi.fn(),
  resolveEditorOpenImageContextMock: vi.fn(),
}));

vi.mock('./apply', () => ({
  applyOpenedEditorDocument: mocks.applyOpenedEditorDocumentMock,
}));

vi.mock('./context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./context')>()),
  resolveEditorOpenImageContext: mocks.resolveEditorOpenImageContextMock,
}));

vi.mock('./create', () => ({
  createOpenedEditorDocument: mocks.createOpenedEditorDocumentMock,
}));

vi.mock('./favicon', () => ({
  resolveBrowserFrameFaviconDataUrl: mocks.resolveBrowserFrameFaviconDataUrlMock,
}));

interface BrowserFrameDocument {
  browserFrame: Record<string, unknown> | null;
  id?: string;
  version?: number;
}

function createOpenContext(overrides: Partial<ReturnType<typeof createContext>> = {}) {
  return {
    ...createContext(),
    ...overrides,
  };
}

function createContext() {
  return {
    browserFrame: {
      title: '',
      url: '',
      faviconDataUrl: null,
      canvasMode: 'resize' as const,
      contentMode: 'push-down' as const,
    },
    browserFrameUrl: 'https://opened.example',
    frame: { layoutMode: 'fit-image' } as never,
    pageTitle: 'Opened page',
    sourceFaviconUrl: 'https://opened.example/favicon.ico',
  };
}

async function importRunModule() {
  vi.resetModules();
  return import('./run');
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function expectAppliedRunWithFavicon(): Promise<void> {
  const document: BrowserFrameDocument = { version: 1, browserFrame: null };
  const applyDocument = vi.fn(async () => undefined);
  const scheduleZoomToFit = vi.fn();
  mocks.resolveEditorOpenImageContextMock.mockResolvedValue(createContext());
  mocks.createOpenedEditorDocumentMock.mockResolvedValue(document);
  mocks.resolveBrowserFrameFaviconDataUrlMock.mockResolvedValue('data:image/png;base64,favicon');
  const { openEditorControllerImage } = await importRunModule();

  await openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,opened',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'capture.png',
  });

  expect(mocks.resolveBrowserFrameFaviconDataUrlMock).toHaveBeenCalledWith(
    'https://opened.example/favicon.ico'
  );
  expect(document.browserFrame).toEqual({
    title: 'Opened page',
    url: 'https://opened.example',
    faviconDataUrl: 'data:image/png;base64,favicon',
    canvasMode: 'resize',
    contentMode: 'push-down',
  });
  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledWith({
    applyDocument,
    browserFrameUrl: 'https://opened.example',
    dataUrl: 'data:image/png;base64,opened',
    document,
    faviconDataUrl: 'data:image/png;base64,favicon',
    pageTitle: 'Opened page',
    scheduleZoomToFit,
  });
}

function createDeferredFavicon() {
  let release: () => void = () => {};
  let requestedResolve: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    requestedResolve = resolve;
  });
  const value = new Promise<string>((resolve) => {
    release = () => resolve('data:image/png;base64,first-favicon');
  });

  return {
    release,
    requested,
    signalRequested: requestedResolve,
    value,
  };
}

function configureStaleRunMocks(args: {
  firstDocument: BrowserFrameDocument;
  secondDocument: BrowserFrameDocument;
  deferredFavicon: ReturnType<typeof createDeferredFavicon>;
}): void {
  mocks.resolveEditorOpenImageContextMock
    .mockResolvedValueOnce(createContext())
    .mockResolvedValueOnce(
      createOpenContext({
        browserFrameUrl: 'https://newer.example',
        pageTitle: 'Newer page',
        sourceFaviconUrl: 'https://newer.example/favicon.ico',
      })
    );
  mocks.createOpenedEditorDocumentMock
    .mockResolvedValueOnce(args.firstDocument)
    .mockResolvedValueOnce(args.secondDocument);
  mocks.resolveBrowserFrameFaviconDataUrlMock
    .mockImplementationOnce(() => {
      args.deferredFavicon.signalRequested();
      return args.deferredFavicon.value;
    })
    .mockResolvedValueOnce('data:image/png;base64,second-favicon');
}

async function expectStaleRunIgnored(): Promise<void> {
  const deferredFavicon = createDeferredFavicon();
  const firstDocument: BrowserFrameDocument = { id: 'first', browserFrame: null };
  const secondDocument: BrowserFrameDocument = { id: 'second', browserFrame: null };
  const applyDocument = vi.fn(async () => undefined);
  const scheduleZoomToFit = vi.fn();
  configureStaleRunMocks({ firstDocument, secondDocument, deferredFavicon });
  const { openEditorControllerImage } = await importRunModule();

  const firstRun = openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,first',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'first.png',
  });
  await deferredFavicon.requested;
  await openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,second',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'second.png',
  });
  deferredFavicon.release();
  await firstRun;

  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledTimes(1);
  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrameUrl: 'https://newer.example',
      dataUrl: 'data:image/png;base64,second',
      document: secondDocument,
      faviconDataUrl: 'data:image/png;base64,second-favicon',
      pageTitle: 'Newer page',
    })
  );
  expect(firstDocument.browserFrame).toBeNull();
}

describe('openEditorControllerImage', () => {
  it('resolves favicon data and applies the opened document with the baked browser-frame state', async () => {
    await expectAppliedRunWithFavicon();
  });

  it('drops stale favicon results so an older open cannot overwrite a newer document', async () => {
    await expectStaleRunIgnored();
  });
});
