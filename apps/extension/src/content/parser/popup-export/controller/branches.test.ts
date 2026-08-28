import { beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ArchiveArtifact } from '../../export-manager/archive';
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
    includePageDiagnostics: false,
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

it('cancels the owned package build when dispose runs mid-flight', () => {
  const exportDeferred = createDeferred<ArchiveArtifact>();
  const exportRunner = {
    buildBlobPackage: vi.fn(() => exportDeferred.promise),
    buildPackage: vi.fn(),
    cancel: vi.fn(),
  };
  const controller = createPopupExportController({ exportRunner });

  controller.handleRequest(
    {
      options: createExportOptions(),
      batchRequestId: 'req-1',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    vi.fn()
  );
  controller.dispose();
  exportDeferred.resolve({} as ArchiveArtifact);

  expect(exportRunner.cancel).toHaveBeenCalledTimes(1);
});
