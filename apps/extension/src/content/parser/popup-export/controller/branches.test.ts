import { beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type ExportResult } from '@sniptale/runtime-contracts/export';
import { createPopupExportController } from './index/create';

type DeferredValue<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
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

async function flushControllerTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('returns false when the request is outside the popup-export contract', () => {
  const controller = createPopupExportController();

  expect(controller.handleRequest({ type: 'NOT_A_POPUP_EXPORT_MESSAGE' }, vi.fn())).toBe(false);
});

it('returns translated preview failure copy when popup preview parsing rejects with a non-error', async () => {
  const controller = createPopupExportController({
    parseTree: vi.fn().mockRejectedValue('preview failed'),
  });
  const sendResponse = vi.fn();

  expect(controller.handleRequest({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse)).toBe(
    true
  );
  await flushControllerTasks();

  expect(sendResponse).toHaveBeenCalledWith({
    error: translate('content.runtime.exportPrepareFailed'),
    success: false,
  });
});

it('cancels the owned export when dispose runs mid-flight', () => {
  const exportDeferred = createDeferred<ExportResult>();
  const exportResult: ExportResult = {
    errors: [],
    filename: 'popup-export.zip',
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
    success: true,
  };
  const exportRunner = {
    buildPackage: vi.fn(),
    cancel: vi.fn(),
    export: vi.fn(() => exportDeferred.promise),
    onProgress: vi.fn(),
  };
  const controller = createPopupExportController({
    exportRunner,
    persistArchive: vi.fn().mockResolvedValue([]),
  });

  controller.handleRequest(
    {
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    },
    vi.fn()
  );
  controller.dispose();
  exportDeferred.resolve(exportResult);

  expect(exportRunner.cancel).toHaveBeenCalledTimes(1);
});
