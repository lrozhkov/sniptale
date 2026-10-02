import { describe, expect, it, vi } from 'vitest';
const {
  ensureEditorPageAggregateIdMock,
  readEditorPageLocationStateMock,
  resolveEditorPageRestoreSourceMock,
  waitForEditorControllerCanvasMock,
  getMediaLibraryEntryMock,
  restoreImageAggregateOriginalMock,
  getAggregatePresentationMock,
} = vi.hoisted(() => ({
  ensureEditorPageAggregateIdMock: vi.fn(),
  readEditorPageLocationStateMock: vi.fn(),
  resolveEditorPageRestoreSourceMock: vi.fn(),
  waitForEditorControllerCanvasMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  restoreImageAggregateOriginalMock: vi.fn(),
  getAggregatePresentationMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/aggregate-presentations')
  >()),
  getAggregatePresentation: getAggregatePresentationMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaLibraryEntry: getMediaLibraryEntryMock,
  })
);

vi.mock('../../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-aggregates')>()),
  restoreImageAggregateOriginal: restoreImageAggregateOriginalMock,
}));

vi.mock('../../controller/canvas-ready', () => ({
  waitForEditorControllerCanvas: waitForEditorControllerCanvasMock,
}));

vi.mock('../../document/page-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/page-session')>()),
  ensureEditorPageAggregateId: ensureEditorPageAggregateIdMock,
  readEditorPageLocationState: readEditorPageLocationStateMock,
  resolveEditorPageRestoreSource: resolveEditorPageRestoreSourceMock,
}));

import {
  createEditorPageServices,
  bootstrapEditorPageSession,
  openEditorBootstrapPayload,
  recoverMissingEditorPageDocument,
} from './runtime';
import {
  createEditorPageAutosaveService,
  createEditorPageController,
  createEditorPageDocument,
  createEditorPageRuntime,
  setupEditorPageRuntimeBootstrapTestScope,
} from './runtime.bootstrap.test-support';
import { useEditorStore } from '../../state/useEditorStore';

async function verifiesBootstrapPayloadOpen() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();

  await openEditorBootstrapPayload(
    {
      dataUrl: 'data:image/png;base64,1',
      title: 'Example page',
      url: 'https://example.com',
      capturedAt: 111,
    },
    runtime,
    { autosaveService, controller } as never
  );

  expect(autosaveService.activate).toHaveBeenCalledWith({
    aggregateId: 'session-1',
    capturedAt: 111,
    durableRevision: 0,
    renderPresentation: expect.any(Function),
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
  expect(autosaveService.saveNow).toHaveBeenCalledWith(expect.any(Function));
  expect(useEditorStore.getState().capturedAt).toBe(111);
  expect(controller.openImage.mock.invocationCallOrder[0]).toBeLessThan(
    autosaveService.saveNow.mock.invocationCallOrder[0]!
  );
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
  expect(autosaveService.saveNow).toHaveBeenCalledWith(expect.any(Function));
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
      createdAt: 222,
    },
    capturedAt: 222,
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(autosaveService.activate).toHaveBeenCalledWith({
    aggregateId: 'session-1',
    durableRevision: 0,
    renderPresentation: expect.any(Function),
    sourceUrl: null,
    sourceTitle: null,
  });
  expect(runtime.setPageTitle).toHaveBeenCalledWith('Draft title');
  expect(controller.loadDocument).toHaveBeenCalledWith({ version: 2 });
  expect(useEditorStore.getState().capturedAt).toBe(222);
}

async function verifiesDraftPreviewRetryAfterHydration() {
  const controller = createEditorPageController();
  const autosaveService = createEditorPageAutosaveService();
  const runtime = createEditorPageRuntime();
  autosaveService.getDurableRevision.mockReturnValue(4);
  getAggregatePresentationMock.mockResolvedValue({ presentationRevision: 3 });
  resolveEditorPageRestoreSourceMock.mockResolvedValue({
    kind: 'draft',
    entry: { document: { version: 2 }, sourceTitle: 'Draft' },
    capturedAt: 1,
  });
  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);
  expect(autosaveService.retryPresentation).toHaveBeenCalledOnce();
  expect(controller.loadDocument.mock.invocationCallOrder[0]).toBeLessThan(
    getAggregatePresentationMock.mock.invocationCallOrder[0]!
  );
  expect(controller.loadDocument.mock.invocationCallOrder[0]).toBeLessThan(
    autosaveService.retryPresentation.mock.invocationCallOrder[0]!
  );
  expect(autosaveService.saveNow).not.toHaveBeenCalled();
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
    capturedAt: 444,
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(controller.loadDocument).toHaveBeenCalledWith(createEditorPageDocument());
  expect(controller.openImage).not.toHaveBeenCalled();
  expect(useEditorStore.getState().capturedAt).toBe(444);
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
    capturedAt: 333,
  });

  await bootstrapEditorPageSession(runtime, { autosaveService, controller } as never);

  expect(autosaveService.updateContext).toHaveBeenCalledWith({
    requireExistingRoot: true,
    sourceUrl: 'https://asset.example',
    sourceTitle: 'Asset title',
  });
  expect(runtime.setPageTitle).toHaveBeenCalledWith('Asset title');
  expect(controller.openImage).toHaveBeenCalledWith('data:image/png;base64,3', 'capture.png', {
    browserFrameUrl: 'https://asset.example',
    pageTitle: 'Asset title',
  });
  expect(useEditorStore.getState().capturedAt).toBe(333);
}

async function verifiesExplicitRecovery() {
  readEditorPageLocationStateMock.mockReturnValue({ assetId: 'image-1', bootstrapId: null });
  getMediaLibraryEntryMock.mockResolvedValue({ id: 'image-1', workspaceRevision: 4 });
  restoreImageAggregateOriginalMock.mockResolvedValue({ revision: 5 });

  await recoverMissingEditorPageDocument();

  expect(restoreImageAggregateOriginalMock).toHaveBeenCalledOnce();
  expect(restoreImageAggregateOriginalMock).toHaveBeenCalledWith('image-1', 4);
}

async function verifiesRecoveryRequiresExistingLibraryEntry() {
  readEditorPageLocationStateMock.mockReturnValue({ assetId: 'image-1', bootstrapId: null });
  getMediaLibraryEntryMock.mockResolvedValue(undefined);

  await expect(recoverMissingEditorPageDocument()).rejects.toThrow();
  expect(restoreImageAggregateOriginalMock).not.toHaveBeenCalled();
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
    ensureEditorPageAggregateIdMock,
    readEditorPageLocationStateMock,
    waitForEditorControllerCanvasMock,
  });

  it(
    'restores a damaged document only after an explicit recovery action',
    verifiesExplicitRecovery
  );
  it(
    'preserves a damaged document when its library entry is absent',
    verifiesRecoveryRequiresExistingLibraryEntry
  );

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
  it.each(['image', 'document'] as const)(
    'does not publish a %s bootstrap after cancellation during opening',
    async (kind) => {
      const controller = createEditorPageController();
      const autosaveService = createEditorPageAutosaveService();
      let cancelled = false;
      const cancelDuringOpen = async () => {
        cancelled = true;
        return undefined;
      };
      controller.openImage.mockImplementation(cancelDuringOpen);
      controller.loadDocument.mockImplementation(cancelDuringOpen);
      await openEditorBootstrapPayload(
        {
          dataUrl: 'data:image/png;base64,1',
          ...(kind === 'document' ? { document: createEditorPageDocument() } : {}),
          capturedAt: 222,
        },
        createEditorPageRuntime({ isCancelled: () => cancelled }),
        { autosaveService, controller } as never
      );
      expect(controller.exportDocument).not.toHaveBeenCalled();
      expect(autosaveService.saveNow).not.toHaveBeenCalled();
    }
  );
  it.each(['image', 'document'] as const)(
    'does not commit the %s capture timestamp after cancellation during saving',
    async (kind) => {
      const controller = createEditorPageController();
      const autosaveService = createEditorPageAutosaveService();
      let cancelled = false;
      const capturedAt = useEditorStore.getState().capturedAt;
      autosaveService.saveNow.mockImplementation(async (produceDocument) => {
        produceDocument();
        cancelled = true;
      });
      await openEditorBootstrapPayload(
        {
          dataUrl: 'data:image/png;base64,1',
          ...(kind === 'document' ? { document: createEditorPageDocument() } : {}),
          capturedAt: 222,
        },
        createEditorPageRuntime({ isCancelled: () => cancelled }),
        { autosaveService, controller } as never
      );
      expect(autosaveService.saveNow).toHaveBeenCalledOnce();
      expect(useEditorStore.getState().capturedAt).toBe(capturedAt);
    }
  );
  it('restores draft sessions through loadDocument', verifiesDraftRestore);
  it(
    'retries a stale restored preview only after document hydration',
    verifiesDraftPreviewRetryAfterHydration
  );
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

it('attaches document autosave only to the standalone controller', () => {
  const embedded = createEditorPageServices('scenario');
  expect(embedded.controller.autosaveService).toBeNull();
  embedded.autosaveService.dispose();
  const standalone = createEditorPageServices();
  expect(standalone.controller.autosaveService).toBe(standalone.autosaveService);
  standalone.autosaveService.dispose();
});
