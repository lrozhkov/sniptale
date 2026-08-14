import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportController } from './index/create';

it('returns preview data through the controller-owned request handler', async () => {
  const parseTree = vi.fn().mockResolvedValue({ context: 'ctx', structure: [], title: 'Page' });
  const controller = createPopupExportController({ parseTree });
  const sendResponse = vi.fn();

  expect(controller.handleRequest({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse)).toBe(
    true
  );
  await Promise.resolve();

  expect(parseTree).toHaveBeenCalledWith('popup-export-preview');
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    preview: expect.objectContaining({ context: 'ctx', title: 'Page' }),
  });
});

it('rejects requests outside the native popup-export contract', () => {
  const controller = createPopupExportController();

  expect(controller.handleRequest({ type: 'RETIRED_EXPORT_MESSAGE' }, vi.fn())).toBe(false);
});
