import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

describe('runtime-message-bridge-passive-popup-export errors', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prefixes controller load failures', async () => {
    vi.doMock('../../../parser/popup-export', () => ({
      createPopupExportController: () => {
        throw new Error('window is not defined');
      },
    }));

    const { handlePopupExportMessage } = await import('./passive-popup-export');
    const sendResponse = vi.fn();

    handlePopupExportMessage({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'load popup export controller: window is not defined',
        success: false,
      });
    });
  });

  it('prefixes synchronous controller request failures', async () => {
    vi.doMock('../../../parser/popup-export', () => ({
      createPopupExportController: () => ({
        handleRequest: () => {
          throw new Error('window is not defined');
        },
      }),
    }));

    const { handlePopupExportMessage } = await import('./passive-popup-export');
    const sendResponse = vi.fn();

    handlePopupExportMessage({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'handle popup export request: window is not defined',
        success: false,
      });
    });
  });
});
