import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

describe('runtime-message-bridge-passive-popup-export', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('recognizes popup export message variants', async () => {
    const { isPopupExportMessage } = await import('./passive-popup-export');

    expect(isPopupExportMessage(MessageType.EXPORT_POPUP_PREVIEW)).toBe(true);
    expect(isPopupExportMessage(MessageType.EXPORT_POPUP_START)).toBe(true);
    expect(isPopupExportMessage(MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT)).toBe(true);
    expect(isPopupExportMessage(MessageType.EXPORT_POPUP_CANCEL)).toBe(true);
    expect(isPopupExportMessage(MessageType.COPY_TEXT_TO_CLIPBOARD)).toBe(false);
  });

  it('reports an error when the popup export controller declines the request', async () => {
    const handleRequest = vi.fn(() => false);

    vi.doMock('../../../parser/popup-export', () => ({
      createPopupExportController: () => ({
        handleRequest,
      }),
    }));

    const { handlePopupExportMessage } = await import('./passive-popup-export');
    const sendResponse = vi.fn();
    const request = { type: MessageType.EXPORT_POPUP_PREVIEW };

    handlePopupExportMessage(request, sendResponse);

    await vi.waitFor(() => {
      expect(handleRequest).toHaveBeenCalledWith(request, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: translate('content.runtime.exportRequestHandlingFailed'),
      });
    });
  });
});
