import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ExportResult } from '@sniptale/runtime-contracts/export';
import { handlePopupExportStartRuntime } from './runtime';
import type { PopupExportState } from '../types';

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

function createExportResult(): ExportResult {
  return {
    errors: [],
    filename: 'popup-export.zip',
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: true,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

async function flushControllerTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createBusyStartContext() {
  return {
    runtime: {
      emitMessage: vi.fn(),
      exportRunner: {
        cancel: vi.fn(),
        export: vi.fn(),
        onProgress: vi.fn(),
      },
      parseTree: vi.fn(),
      persistArchive: vi.fn(),
    },
    sendResponse: vi.fn(),
    state: {
      activeExportRequestId: 'req-1',
      isExportRunning: true,
    } satisfies PopupExportState,
  };
}

function createSuccessfulStartContext() {
  const exportDeferred = createDeferred<ExportResult>();
  const progressCallbacks: Array<
    (progress: {
      current: number;
      errors: string[];
      message: string;
      phase: string;
      total: number;
    }) => void
  > = [];
  const emitMessage = vi.fn().mockResolvedValue(undefined);
  const persistArchive = vi.fn().mockResolvedValue([]);

  return {
    emitMessage,
    exportDeferred,
    persistArchive,
    progressCallbacks,
    runtime: {
      emitMessage,
      exportRunner: {
        cancel: vi.fn(),
        export: vi.fn(() => exportDeferred.promise),
        onProgress: vi.fn((callback) => {
          progressCallbacks.push(callback);
        }),
      },
      parseTree: vi.fn(),
      persistArchive,
    },
    sendResponse: vi.fn(),
    state: {
      activeExportRequestId: null,
      isExportRunning: false,
    } as PopupExportState,
  };
}

function startPopupExport(
  runtime: ReturnType<typeof createSuccessfulStartContext>['runtime'],
  sendResponse: ReturnType<typeof createSuccessfulStartContext>['sendResponse'],
  state: PopupExportState
): boolean {
  return handlePopupExportStartRuntime({
    ...runtime,
    request: {
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    },
    sendResponse,
    state,
  });
}

it('rejects a second export when the controller is already busy', () => {
  const { runtime, sendResponse, state } = createBusyStartContext();

  expect(startPopupExport(runtime, sendResponse, state)).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Экспорт уже выполняется',
    success: false,
  });
});

it('runs the export flow and emits the result when the export settles', async () => {
  const {
    emitMessage,
    exportDeferred,
    persistArchive,
    progressCallbacks,
    runtime,
    sendResponse,
    state,
  } = createSuccessfulStartContext();

  expect(startPopupExport(runtime, sendResponse, state)).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  progressCallbacks[0]?.({
    current: 1,
    errors: [],
    message: 'exporting',
    phase: 'running',
    total: 1,
  });
  exportDeferred.resolve(createExportResult());
  await flushControllerTasks();

  expect(emitMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_PROGRESS,
    })
  );
  expect(persistArchive).toHaveBeenCalledTimes(1);
  expect(emitMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_RESULT,
      result: expect.objectContaining({ success: true }),
    })
  );
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});

it('drops a stale export result when the active request changes before settlement', async () => {
  const { emitMessage, exportDeferred, runtime, sendResponse, state } =
    createSuccessfulStartContext();

  expect(startPopupExport(runtime, sendResponse, state)).toBe(true);

  state.activeExportRequestId = 'req-2';
  exportDeferred.resolve(createExportResult());
  await flushControllerTasks();

  expect(emitMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_RESULT,
    })
  );
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});

it('reports a generic failure when the export runner rejects with a non-Error value', async () => {
  const { emitMessage, runtime, sendResponse, state } = createSuccessfulStartContext();

  runtime.exportRunner.export = vi.fn(() => Promise.reject('boom'));

  expect(startPopupExport(runtime, sendResponse, state)).toBe(true);
  await flushControllerTasks();

  expect(emitMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_RESULT,
      result: expect.objectContaining({ success: false }),
    })
  );
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});
