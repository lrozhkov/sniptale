import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyOpenedEditorDocumentMock: vi.fn(async () => undefined),
  createOpenedEditorDocumentMock: vi.fn(),
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

async function expectAppliedRunWithoutNetwork(): Promise<void> {
  const document: BrowserFrameDocument = { version: 1, browserFrame: null };
  const applyDocument = vi.fn(async () => undefined);
  const scheduleZoomToFit = vi.fn();
  mocks.resolveEditorOpenImageContextMock.mockResolvedValue(createContext());
  mocks.createOpenedEditorDocumentMock.mockResolvedValue(document);
  const fetch = vi.spyOn(globalThis, 'fetch');
  const { openEditorControllerImage } = await importRunModule();

  await openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,opened',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'capture.png',
  });

  expect(mocks.resolveEditorOpenImageContextMock).toHaveBeenCalledWith({}, 'capture.png');
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
  expect(document.browserFrame).toEqual({
    title: 'Opened page',
    url: 'https://opened.example',
    faviconDataUrl: null,
    faviconEnabled: false,
    canvasMode: 'resize',
    contentMode: 'push-down',
  });
  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledWith({
    applyDocument,
    browserFrameUrl: 'https://opened.example',
    dataUrl: 'data:image/png;base64,opened',
    document,
    faviconDataUrl: null,
    pageTitle: 'Opened page',
    scheduleZoomToFit,
  });
}

function createDeferredImage() {
  let release: () => void = () => {};
  let requestedResolve: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    requestedResolve = resolve;
  });
  const value = new Promise<BrowserFrameDocument>((resolve) => {
    release = () => resolve({ id: 'first', browserFrame: null });
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
  deferredImage: ReturnType<typeof createDeferredImage>;
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
    .mockImplementationOnce(async () => {
      args.deferredImage.signalRequested();
      await args.deferredImage.value;
      return args.firstDocument;
    })
    .mockResolvedValueOnce(args.secondDocument);
}

async function expectStaleRunIgnored(): Promise<void> {
  const deferredImage = createDeferredImage();
  const firstDocument: BrowserFrameDocument = { id: 'first', browserFrame: null };
  const secondDocument: BrowserFrameDocument = { id: 'second', browserFrame: null };
  const applyDocument = vi.fn(async () => undefined);
  const scheduleZoomToFit = vi.fn();
  configureStaleRunMocks({ firstDocument, secondDocument, deferredImage });
  const { openEditorControllerImage } = await importRunModule();

  const firstRun = openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,first',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'first.png',
  });
  await deferredImage.requested;
  await openEditorControllerImage({
    applyDocument,
    dataUrl: 'data:image/png;base64,second',
    openOptions: {},
    scheduleZoomToFit,
    sourceName: 'second.png',
  });
  deferredImage.release();
  await firstRun;

  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledTimes(1);
  expect(mocks.applyOpenedEditorDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrameUrl: 'https://newer.example',
      dataUrl: 'data:image/png;base64,second',
      document: secondDocument,
      faviconDataUrl: null,
      pageTitle: 'Newer page',
    })
  );
  expect(firstDocument.browserFrame).toBeNull();
}

describe('openEditorControllerImage', () => {
  it('opens the image without automatic favicon network acquisition', async () => {
    await expectAppliedRunWithoutNetwork();
  });

  it('drops stale image creation so an older open cannot overwrite a newer document', async () => {
    await expectStaleRunIgnored();
  });
});
