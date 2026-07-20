// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const viewportChangeMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: viewportChangeMocks.sendRuntimeMessage,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: viewportChangeMocks.showToast,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { handleToolbarViewportChange } from '.';

beforeEach(() => {
  installContentRuntimeMessagingMock(viewportChangeMocks.sendRuntimeMessage);
  vi.clearAllMocks();
});

describe('toolbar viewport change action', () => {
  it('updates viewport on success and shows targeted conflict errors', async () => {
    const setCurrentViewport = vi.fn();

    viewportChangeMocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true });
    await handleToolbarViewportChange({ width: 800, height: 600 }, setCurrentViewport);
    expect(setCurrentViewport).toHaveBeenCalledWith({ width: 800, height: 600 });

    viewportChangeMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: 'background.runtime.debuggerConflictKeywordExtension',
    });
    await handleToolbarViewportChange({ width: 900, height: 700 }, setCurrentViewport);
    expect(viewportChangeMocks.showToast).toHaveBeenCalledWith(
      'content.toolbar.viewportConflictError',
      'error',
      5000
    );
  });

  it('shows generic viewport errors for failed responses and thrown exceptions', async () => {
    const setCurrentViewport = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    viewportChangeMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: 'Custom error',
    });
    await handleToolbarViewportChange(null, setCurrentViewport);

    viewportChangeMocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('boom'));
    await handleToolbarViewportChange({ width: 1, height: 1 }, setCurrentViewport);

    expect(viewportChangeMocks.showToast).toHaveBeenNthCalledWith(
      1,
      'content.toolbar.viewportErrorPrefix Custom error',
      'error'
    );
    expect(viewportChangeMocks.showToast).toHaveBeenNthCalledWith(
      2,
      'content.toolbar.viewportChangeError',
      'error'
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
