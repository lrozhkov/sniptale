import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBaseDocumentMock: vi.fn(),
  setBrowserFrameMock: vi.fn(),
  setImageDataMock: vi.fn(),
  setInspectorMock: vi.fn(),
  setPageTitleMock: vi.fn(),
  traceEditorImageDocumentAppliedMock: vi.fn(),
  traceEditorImageDocumentCreatedMock: vi.fn(),
  traceEditorImageOpenStartMock: vi.fn(),
}));

vi.mock('../../..', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../..')>()),
  createBaseDocument: mocks.createBaseDocumentMock,
}));

vi.mock('./trace/events', () => ({
  traceEditorImageDocumentApplied: mocks.traceEditorImageDocumentAppliedMock,
  traceEditorImageDocumentCreated: mocks.traceEditorImageDocumentCreatedMock,
}));

vi.mock('./trace/start', () => ({
  traceEditorImageOpenStart: mocks.traceEditorImageOpenStartMock,
}));

vi.mock('../../../../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../state/useEditorStore')>()),
  useEditorStore: {
    getState: () => ({
      setBrowserFrame: mocks.setBrowserFrameMock,
      setImageData: mocks.setImageDataMock,
      setInspector: mocks.setInspectorMock,
      setPageTitle: mocks.setPageTitleMock,
    }),
  },
}));

import { syncLoadedDocumentState } from '../store';
import { applyOpenedEditorDocument } from './apply';
import { completeOpenedEditorDocument } from './complete';
import { createOpenedEditorDocument } from './create';

function createOpenImageContext() {
  return {
    browserFrame: {
      title: 'Stored title',
      url: 'https://stored.example',
      faviconDataUrl: 'data:image/png;base64,stored',
      canvasMode: 'resize' as const,
      contentMode: 'push-down' as const,
    },
    browserFrameUrl: 'https://opened.example',
    frame: { layoutMode: 'fit-image' } as never,
    pageTitle: 'Opened page',
    sourceFaviconUrl: 'https://opened.example/favicon.ico',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createBaseDocumentMock.mockResolvedValue({
    version: 1,
    browserFrame: null,
  });
});

async function expectCreatedOpenDocument(): Promise<void> {
  const document = await createOpenedEditorDocument({
    context: createOpenImageContext(),
    dataUrl: 'data:image/png;base64,opened',
    sourceName: 'capture.png',
  });

  expect(mocks.traceEditorImageOpenStartMock).toHaveBeenCalledOnce();
  expect(mocks.createBaseDocumentMock).toHaveBeenCalledWith(
    'data:image/png;base64,opened',
    'capture.png',
    createOpenImageContext().frame,
    {
      ...createOpenImageContext().browserFrame,
      faviconDataUrl: null,
      title: 'Opened page',
      url: 'https://opened.example',
    }
  );
  expect(mocks.traceEditorImageDocumentCreatedMock).toHaveBeenCalledWith(document);
}

async function expectAppliedOpenDocumentSync(): Promise<void> {
  const applyDocument = vi.fn(async () => undefined);
  const scheduleZoomToFit = vi.fn();

  await applyOpenedEditorDocument({
    applyDocument,
    browserFrameUrl: 'https://opened.example',
    dataUrl: 'data:image/png;base64,opened',
    document: { version: 1 } as never,
    faviconDataUrl: 'data:image/png;base64,favicon',
    pageTitle: 'Opened page',
    scheduleZoomToFit,
  });

  expect(applyDocument).toHaveBeenCalledWith(
    { version: 1 },
    {
      resetHistory: true,
      updateOriginal: true,
    }
  );
  expect(mocks.traceEditorImageDocumentAppliedMock).toHaveBeenCalledWith({ version: 1 });
  expect(scheduleZoomToFit).toHaveBeenCalledOnce();
  expect(mocks.setInspectorMock).toHaveBeenCalledWith('file');
  expect(mocks.setImageDataMock).toHaveBeenCalledWith('data:image/png;base64,opened');
  expect(mocks.setPageTitleMock).toHaveBeenCalledWith('Opened page');
  expect(mocks.setBrowserFrameMock).toHaveBeenCalledWith({
    faviconDataUrl: 'data:image/png;base64,favicon',
    title: 'Opened page',
    url: 'https://opened.example',
  });
}

async function expectLoadedDocumentSync(): Promise<void> {
  syncLoadedDocumentState('data:image/png;base64,loaded');

  expect(mocks.setInspectorMock).toHaveBeenCalledWith('file');
  expect(mocks.setImageDataMock).toHaveBeenCalledWith('data:image/png;base64,loaded');
  expect(mocks.setPageTitleMock).not.toHaveBeenCalled();
  expect(mocks.setBrowserFrameMock).not.toHaveBeenCalled();
}

async function expectNullFaviconStateSync(): Promise<void> {
  const scheduleZoomToFit = vi.fn();

  completeOpenedEditorDocument({
    browserFrameUrl: 'https://opened.example',
    dataUrl: 'data:image/png;base64,opened',
    document: { version: 1 } as never,
    pageTitle: 'Opened page',
    scheduleZoomToFit,
  });

  expect(mocks.setBrowserFrameMock).toHaveBeenCalledWith({
    faviconDataUrl: null,
    title: 'Opened page',
    url: 'https://opened.example',
  });
}

describe('open image document flow', () => {
  it('creates a base document with the opened title, url, and a reset favicon payload', async () => {
    await expectCreatedOpenDocument();
  });

  it('applies the document, schedules zoom, and syncs reopened browser-frame state', async () => {
    await expectAppliedOpenDocumentSync();
  });

  it('syncs loaded-document state without mutating browser-frame metadata', async () => {
    await expectLoadedDocumentSync();
  });

  it('normalizes missing favicon payloads to null when open state sync completes', async () => {
    await expectNullFaviconStateSync();
  });
});
