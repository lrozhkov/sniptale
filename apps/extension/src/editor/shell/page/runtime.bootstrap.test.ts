import { describe, expect, it, vi } from 'vitest';
const {
  ensureEditorPageSessionIdMock,
  readEditorPageLocationStateMock,
  resolveEditorPageRestoreSourceMock,
  waitForEditorControllerCanvasMock,
} = vi.hoisted(() => ({
  ensureEditorPageSessionIdMock: vi.fn(),
  readEditorPageLocationStateMock: vi.fn(),
  resolveEditorPageRestoreSourceMock: vi.fn(),
  waitForEditorControllerCanvasMock: vi.fn(),
}));

vi.mock('../../controller/canvas-ready', () => ({
  waitForEditorControllerCanvas: waitForEditorControllerCanvasMock,
}));

vi.mock('../../document/page-session', () => ({
  ensureEditorPageSessionId: ensureEditorPageSessionIdMock,
  readEditorPageLocationState: readEditorPageLocationStateMock,
  resolveEditorPageRestoreSource: resolveEditorPageRestoreSourceMock,
}));

import { bootstrapEditorPageSession, openEditorBootstrapPayload } from './runtime';
import {
  createEditorPageAutosaveService,
  createEditorPageController,
  createEditorPageDocument,
  createEditorPageRuntime,
  setupEditorPageRuntimeBootstrapTestScope,
} from './runtime.bootstrap.test-support';

async function verifiesBootstrapPayloadOpen() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();

  await openEditorBootstrapPayload(
    {
      dataUrl: 'data:image/png;base64,1',
      title: 'Example page',
      url: 'https://example.com',
    },
    runtime,
    { autosaveService, controller } as never
  );

  expect(autosaveService.activate).toHaveBeenCalledWith({
    sessionId: 'session-1',
    assetId: 'asset-1',
    sourceUrl: 'https://example.com',
    sourceTitle: 'Example page',
  });
  expect(autosaveService.updateContext).toHaveBeenCalledWith({
    sourceUrl: 'https://example.com',
    sourceTitle: 'Example page',
  });
  expect(runtime.setPageTitle).toHaveBeenCalledWith('Example page');
  expect(waitForEditorControllerCanvasMock).toHaveBeenCalledWith(controller);
  expect(controller.openImage).toHaveBeenCalledWith('data:image/png;base64,1', undefined, {
    browserFrameUrl: 'https://example.com',
    pageTitle: 'Example page',
    sourceFaviconUrl: null,
  });
}

async function verifiesBootstrapPayloadDocumentOpen() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  const document = createEditorPageDocument();

  await openEditorBootstrapPayload(
    {
      dataUrl: 'data:image/png;base64,1',
      document,
      title: 'Example page',
      url: 'https://example.com',
    },
    runtime,
    { autosaveService, controller } as never
  );

  expect(controller.loadDocument).toHaveBeenCalledWith(document);
  expect(controller.openImage).not.toHaveBeenCalled();
}

async function verifiesCancelledBootstrapPayloadOpen() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime({ isCancelled: () => true });

  await openEditorBootstrapPayload(
    {
      dataUrl: 'data:image/png;base64,1',
      title: 'Cancelled page',
    },
    runtime,
    { autosaveService, controller } as never
  );

  expect(controller.openImage).not.toHaveBeenCalled();
}

async function verifiesDraftRestore() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  resolveEditorPageRestoreSourceMock.mockResolvedValue({
    kind: 'draft',
    entry: {
      document: { version: 2 },
      sourceTitle: 'Draft title',
    },
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(autosaveService.activate).toHaveBeenCalledWith({
    sessionId: 'session-1',
    assetId: 'asset-1',
    sourceUrl: null,
    sourceTitle: null,
  });
  expect(runtime.setPageTitle).toHaveBeenCalledWith('Draft title');
  expect(controller.loadDocument).toHaveBeenCalledWith({ version: 2 });
}

async function verifiesBootstrapRestore() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  resolveEditorPageRestoreSourceMock.mockResolvedValue({
    kind: 'bootstrap',
    payload: {
      dataUrl: 'data:image/png;base64,2',
      document: createEditorPageDocument(),
      title: 'Bootstrap title',
      url: 'https://bootstrap.example',
    },
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(controller.loadDocument).toHaveBeenCalledWith(createEditorPageDocument());
  expect(controller.openImage).not.toHaveBeenCalled();
}

async function verifiesAssetRestore() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  resolveEditorPageRestoreSourceMock.mockResolvedValue({
    kind: 'asset',
    assetId: 'asset-2',
    dataUrl: 'data:image/png;base64,3',
    filename: 'capture.png',
    sourceTitle: 'Asset title',
    sourceUrl: 'https://asset.example',
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(autosaveService.updateContext).toHaveBeenCalledWith({
    assetId: 'asset-2',
    sourceUrl: 'https://asset.example',
    sourceTitle: 'Asset title',
  });
  expect(runtime.setPageTitle).toHaveBeenCalledWith('Asset title');
  expect(controller.openImage).toHaveBeenCalledWith('data:image/png;base64,3', 'capture.png', {
    browserFrameUrl: 'https://asset.example',
    pageTitle: 'Asset title',
  });
}

async function verifiesNewerBootstrapPayloadWinsOverLateRestoreResolution() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  const services = { autosaveService, bootstrapRevision: 0, controller };
  let resolveRestore!: (value: unknown) => void;
  resolveEditorPageRestoreSourceMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRestore = resolve;
    })
  );

  const bootstrapPromise = bootstrapEditorPageSession(runtime, services as never);

  await Promise.resolve();

  await openEditorBootstrapPayload(
    {
      dataUrl: 'data:image/png;base64,newer',
      title: 'Newer payload',
      url: 'https://newer.example',
    },
    runtime,
    services as never
  );

  resolveRestore({
    kind: 'asset',
    assetId: 'asset-2',
    dataUrl: 'data:image/png;base64,older',
    filename: 'older.png',
    sourceTitle: 'Older restore',
    sourceUrl: 'https://older.example',
  });
  await bootstrapPromise;

  expect(controller.openImage).toHaveBeenCalledTimes(1);
  expect(controller.openImage).toHaveBeenCalledWith(
    'data:image/png;base64,newer',
    undefined,
    expect.objectContaining({
      browserFrameUrl: 'https://newer.example',
      pageTitle: 'Newer payload',
    })
  );
}

describe('editor-page.runtime bootstrap flows', () => {
  setupEditorPageRuntimeBootstrapTestScope({
    ensureEditorPageSessionIdMock,
    readEditorPageLocationStateMock,
    waitForEditorControllerCanvasMock,
  });

  it(
    'opens bootstrap payloads through autosave activation, canvas readiness, and image open',
    verifiesBootstrapPayloadOpen
  );
  it(
    'loads bootstrap payload documents directly when a persisted editor document exists',
    verifiesBootstrapPayloadDocumentOpen
  );
  it(
    'stops bootstrap payload opening after canvas readiness when the runtime is cancelled',
    verifiesCancelledBootstrapPayloadOpen
  );
  it('restores draft sessions through loadDocument', verifiesDraftRestore);
  it(
    'routes bootstrap restore sources through the bootstrap payload opener',
    verifiesBootstrapRestore
  );
  it(
    'restores asset sessions through autosave context update and image open',
    verifiesAssetRestore
  );
  it(
    'ignores late restore work after a newer bootstrap payload takes ownership',
    verifiesNewerBootstrapPayloadWinsOverLateRestoreResolution
  );
});
