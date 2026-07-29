// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const viewportChangeMocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(async (message: Record<string, unknown>) => ({
    ...message,
    contentIntent: { requestId: 'renew-request-1', token: 'renew-token-1' },
  })),
  sendRuntimeMessage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: viewportChangeMocks.attachContentActionIntent,
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
  translate: (key: string) =>
    key === 'content.toolbar.viewportChangeError'
      ? 'Не удалось изменить размер области страницы'
      : key,
}));

import { handleToolbarViewportChange } from '.';
import { setScreenshotSurfaceBinding } from '../../viewport-selector/capability';

beforeEach(() => {
  installContentRuntimeMessagingMock(viewportChangeMocks.sendRuntimeMessage);
  vi.clearAllMocks();
  setScreenshotSurfaceBinding({
    leaseGeneration: 1,
    operationGeneration: 0,
    token: 'surface-capability-1',
  });
});

describe('toolbar viewport change action', () => {
  it('updates viewport on success and shows targeted conflict errors', async () => {
    const setCurrentViewport = vi.fn();

    viewportChangeMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        enabled: true,
        surfaceCapabilityToken: 'surface-capability-1',
        viewport: { width: 800, height: 600 },
      });
    await handleToolbarViewportChange(
      { height: 600, presetId: 'viewport-800', target: 'viewport', width: 800 },
      setCurrentViewport
    );
    expect(setCurrentViewport).toHaveBeenCalledWith({ width: 800, height: 600 });

    viewportChangeMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: 'background.runtime.debuggerConflictKeywordExtension',
    });
    await handleToolbarViewportChange(
      { height: 700, presetId: 'viewport-900', target: 'viewport', width: 900 },
      setCurrentViewport
    );
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
    await handleToolbarViewportChange(
      { height: 1, presetId: 'viewport-1', target: 'viewport', width: 1 },
      setCurrentViewport
    );

    expect(viewportChangeMocks.showToast).toHaveBeenNthCalledWith(
      1,
      'content.toolbar.viewportErrorPrefix Custom error',
      'error'
    );
    expect(viewportChangeMocks.showToast).toHaveBeenNthCalledWith(
      2,
      'Не удалось изменить размер области страницы',
      'error'
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('resets the toolbar selection when another surface owns the window size', async () => {
    const setCurrentViewport = vi.fn();
    viewportChangeMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: 'surface-busy',
    });

    await handleToolbarViewportChange(
      { height: 1080, presetId: 'window-full-hd', target: 'window', width: 1920 },
      setCurrentViewport
    );

    expect(setCurrentViewport).toHaveBeenLastCalledWith(null);
    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenCalledOnce();
  });

  it('refreshes an expired background capability and retries the mutation once', async () => {
    const setCurrentViewport = vi.fn();
    viewportChangeMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ success: false, error: 'authorization-expired' })
      .mockResolvedValueOnce({
        success: true,
        surfaceCapabilityToken: 'surface-capability-2',
        surfaceLeaseGeneration: 1,
        surfaceOperationGeneration: 0,
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        enabled: true,
        surfaceCapabilityToken: 'surface-capability-2',
        viewport: { width: 1024, height: 768 },
      });

    await handleToolbarViewportChange(
      { height: 768, presetId: 'viewport-1024', target: 'viewport', width: 1024 },
      setCurrentViewport,
      undefined,
      { grantToken: 'trusted-click', kind: 'background-auto-start' }
    );

    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      contentIntent: { requestId: 'renew-request-1', token: 'renew-token-1' },
      type: 'RENEW_SCREENSHOT_SURFACE_SESSION',
    });
    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      type: 'APPLY_VIEWPORT_PRESET',
      operationGeneration: 1,
      presetId: 'viewport-1024',
      surfaceCapabilityToken: 'surface-capability-2',
    });
    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenCalledTimes(4);
    expect(setCurrentViewport).toHaveBeenLastCalledWith({ width: 1024, height: 768 });
  });

  it('recovers a missing worker session only through the trusted selection event', async () => {
    const setCurrentViewport = vi.fn();
    setScreenshotSurfaceBinding({ token: null });
    viewportChangeMocks.sendRuntimeMessage
      .mockResolvedValueOnce({
        success: true,
        surfaceCapabilityToken: 'surface-capability-2',
        surfaceOperationGeneration: 0,
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        enabled: true,
        surfaceCapabilityToken: 'surface-capability-2',
        surfaceLeaseGeneration: 1,
        surfaceOperationGeneration: 1,
        viewport: { height: 720, width: 1280 },
      });

    await handleToolbarViewportChange(
      { height: 720, presetId: 'viewport-1280', target: 'viewport', width: 1280 },
      setCurrentViewport,
      undefined,
      { grantToken: 'trusted-click', kind: 'background-auto-start' }
    );

    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      contentIntent: { requestId: 'renew-request-1', token: 'renew-token-1' },
      type: 'RENEW_SCREENSHOT_SURFACE_SESSION',
    });
    expect(viewportChangeMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationGeneration: 1,
        presetId: 'viewport-1280',
        surfaceCapabilityToken: 'surface-capability-2',
        type: 'APPLY_VIEWPORT_PRESET',
      })
    );
  });

  it('keeps viewer-local rollback authoritative when a local mutation fails', async () => {
    const setCurrentViewport = vi.fn();
    const mutateViewport = vi.fn().mockRejectedValue(new Error('viewer rollback complete'));

    await handleToolbarViewportChange(
      { height: 720, presetId: 'viewer-1280', target: 'viewport', width: 1280 },
      setCurrentViewport,
      mutateViewport
    );

    expect(mutateViewport).toHaveBeenCalledOnce();
    expect(viewportChangeMocks.sendRuntimeMessage).not.toHaveBeenCalled();
    expect(setCurrentViewport).not.toHaveBeenCalled();
  });
});
