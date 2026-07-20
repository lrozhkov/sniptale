import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handlePopupExportBuildPackageRuntime } from './package';

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

async function flushTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

it('rejects package builds while another export is already running', () => {
  const sendResponse = vi.fn();

  expect(
    handlePopupExportBuildPackageRuntime({
      exportRunner: {
        buildPackage: vi.fn(),
      } as never,
      request: {
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        options: createExportOptions(),
      },
      sendResponse,
      state: {
        activeExportRequestId: null,
        isExportRunning: true,
      },
    })
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Экспорт уже выполняется',
  });
});

it('returns the built page package and clears the running flag after completion', async () => {
  const sendResponse = vi.fn();
  const state = {
    activeExportRequestId: null,
    isExportRunning: false,
  };

  expect(
    handlePopupExportBuildPackageRuntime({
      exportRunner: {
        buildPackage: vi.fn().mockResolvedValue({
          archiveBaseName: 'page_2026-04-09_12-00-00',
          entries: [{ path: 'page_2026-04-09_12-00-00.json', textContent: '{}' }],
          errors: [],
          stats: {
            sectionsCount: 1,
            rowsCount: 0,
            filesCount: 0,
            filesFailed: 0,
          },
        }),
      } as never,
      request: {
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        options: createExportOptions(),
      },
      sendResponse,
      state,
    })
  ).toBe(true);

  expect(state.isExportRunning).toBe(true);
  await flushTasks();

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    pagePackage: expect.objectContaining({
      archiveBaseName: 'page_2026-04-09_12-00-00',
    }),
  });
  expect(state.isExportRunning).toBe(false);
});

it('returns an error response when package building fails', async () => {
  const sendResponse = vi.fn();
  const state = {
    activeExportRequestId: null,
    isExportRunning: false,
  };

  expect(
    handlePopupExportBuildPackageRuntime({
      exportRunner: {
        buildPackage: vi.fn().mockRejectedValue(new Error('build failed')),
      } as never,
      request: {
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        options: createExportOptions(),
      },
      sendResponse,
      state,
    })
  ).toBe(true);

  await flushTasks();

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'build failed',
  });
  expect(state.isExportRunning).toBe(false);
});
