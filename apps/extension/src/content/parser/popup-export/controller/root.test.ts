import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportController } from './index/create';

type ExportSuccessResult = {
  errors: string[];
  filename: string;
  stats: {
    filesCount: number;
    filesFailed: number;
    rowsCount: number;
    sectionsCount: number;
  };
  success: true;
};

type DeferredValue<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function createDeferred<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createExportSuccessResult(
  filename: string,
  stats: ExportSuccessResult['stats']
): ExportSuccessResult {
  return {
    success: true,
    filename,
    errors: [],
    stats,
  };
}

function createExportRunner(resultPromise: Promise<ExportSuccessResult>) {
  return {
    buildPackage: vi.fn(),
    cancel: vi.fn(),
    export: vi.fn(() => resultPromise),
    onProgress: vi.fn(),
  };
}

async function flushControllerTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('returns preview data through the controller-owned request handler', async () => {
  const parseTree = vi.fn().mockResolvedValue({
    context: 'ctx',
    structure: [],
    title: 'Page',
  });
  const controller = createPopupExportController({ parseTree });
  const sendResponse = vi.fn();

  expect(controller.handleRequest({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse)).toBe(
    true
  );
  await Promise.resolve();

  expect(parseTree).toHaveBeenCalledWith('popup-export-preview');
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    preview: expect.objectContaining({
      context: 'ctx',
      title: 'Page',
    }),
  });
});

it('rejects a second start request while the controller still owns an active export', () => {
  const exportDeferred = createDeferred<ExportSuccessResult>();
  const exportRunner = createExportRunner(exportDeferred.promise);
  const controller = createPopupExportController({
    exportRunner,
    persistArchive: vi.fn().mockResolvedValue([]),
  });
  const sendResponse = vi.fn();
  const secondResponse = vi.fn();
  const request = {
    type: MessageType.EXPORT_POPUP_START,
    requestId: 'req-1',
    options: createExportOptions(),
  };

  expect(controller.handleRequest(request, sendResponse)).toBe(true);
  expect(controller.handleRequest(request, secondResponse)).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  expect(secondResponse).toHaveBeenCalledWith({
    success: false,
    error: expect.any(String),
  });

  exportDeferred.resolve({
    ...createExportSuccessResult('archive.zip', {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    }),
  });
});

it('forwards cancel only while the controller instance owns an active export', () => {
  const exportDeferred = createDeferred<ExportSuccessResult>();
  const exportRunner = createExportRunner(exportDeferred.promise);
  const controller = createPopupExportController({
    exportRunner,
    persistArchive: vi.fn().mockResolvedValue([]),
  });

  controller.handleRequest(
    {
      type: MessageType.EXPORT_POPUP_START,
      requestId: 'req-1',
      options: createExportOptions(),
    },
    vi.fn()
  );
  controller.handleRequest({ type: MessageType.EXPORT_POPUP_CANCEL }, vi.fn());

  expect(exportRunner.cancel).toHaveBeenCalledTimes(1);
});

function createResolvedExportRunner() {
  const emitMessage = vi.fn().mockResolvedValue(undefined);
  const persistArchive = vi.fn().mockResolvedValue([]);
  const exportRunner = {
    buildPackage: vi.fn(),
    cancel: vi.fn(),
    export: vi
      .fn()
      .mockResolvedValueOnce(
        createExportSuccessResult('archive-1.zip', {
          sectionsCount: 1,
          rowsCount: 2,
          filesCount: 3,
          filesFailed: 0,
        })
      )
      .mockResolvedValueOnce(
        createExportSuccessResult('archive-2.zip', {
          sectionsCount: 4,
          rowsCount: 5,
          filesCount: 6,
          filesFailed: 0,
        })
      ),
    onProgress: vi.fn(),
  };

  return {
    controller: createPopupExportController({
      emitMessage,
      exportRunner,
      persistArchive,
    }),
    emitMessage,
    exportRunner,
    persistArchive,
  };
}

function startPopupExportRequest(
  controller: ReturnType<typeof createPopupExportController>,
  requestId: string
): void {
  controller.handleRequest(
    {
      type: MessageType.EXPORT_POPUP_START,
      requestId,
      options: createExportOptions(),
    },
    vi.fn()
  );
}

it('resets request ownership after the export result so the next request can start', async () => {
  const { controller, emitMessage, exportRunner, persistArchive } = createResolvedExportRunner();

  startPopupExportRequest(controller, 'req-1');
  await flushControllerTasks();

  startPopupExportRequest(controller, 'req-2');
  await flushControllerTasks();

  expect(exportRunner.export).toHaveBeenCalledTimes(2);
  expect(persistArchive).toHaveBeenCalledTimes(2);
  expect(emitMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_RESULT,
      requestId: 'req-1',
    })
  );
  expect(emitMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_RESULT,
      requestId: 'req-2',
    })
  );
});
