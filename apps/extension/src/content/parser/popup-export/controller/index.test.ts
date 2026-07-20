import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportController } from './index/create';

it('keeps the popup-export controller facade working for preview requests', async () => {
  const parseTree = vi.fn().mockResolvedValue({
    context: 'ctx',
    structure: [],
    title: 'Popup',
  });
  const sendResponse = vi.fn();

  expect(
    createPopupExportController({ parseTree }).handleRequest(
      { type: MessageType.EXPORT_POPUP_PREVIEW },
      sendResponse
    )
  ).toBe(true);

  await Promise.resolve();

  expect(parseTree).toHaveBeenCalledWith('popup-export-preview');
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
    })
  );
});
