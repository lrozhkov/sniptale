// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modeToggleMocks = vi.hoisted(() => ({
  attachContentActionIntent: vi.fn(),
  createTrustedContentActionIntentSource: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  attachContentActionIntent: modeToggleMocks.attachContentActionIntent,
  createTrustedContentActionIntentSource: modeToggleMocks.createTrustedContentActionIntentSource,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: modeToggleMocks.sendRuntimeMessage,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: modeToggleMocks.showToast,
}));

import { useToolbarModeToggles } from './mode-toggles';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';
import { setScreenshotSurfaceBinding } from '../../viewport-selector/capability';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferredResponse() {
  let resolvePromise: ((value: { success: boolean }) => void) | null = null;
  const promise = new Promise<{ success: boolean }>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: { success: boolean }) => resolvePromise?.(value),
  };
}

function ModeToggleHarness(props: {
  aiPickMode: boolean;
  onDisableAiPickMode?: () => void;
  onToggleScreenshotMode?: (enabled: boolean) => void;
  screenshotMode?: boolean;
}) {
  const { pendingInteractionMode, toggleMode } = useToolbarModeToggles({
    aiPickMode: props.aiPickMode,
    screenshotMode: props.screenshotMode ?? true,
    highlighterMode: false,
    quickEditDocumentMode: false,
    quickEditMode: false,
    onAiPickContentStart: vi.fn(),
    onToggleScreenshotMode: props.onToggleScreenshotMode ?? vi.fn(),
    onToggleHighlighterMode: vi.fn(),
    onToggleQuickEditDocumentMode: vi.fn(),
    onToggleQuickEditMode: vi.fn(),
    onClearHighlights: vi.fn(),
    setIsLoading: vi.fn(),
    ...(props.onDisableAiPickMode === undefined
      ? {}
      : { onDisableAiPickMode: props.onDisableAiPickMode }),
  });

  return (
    <>
      <button
        type="button"
        data-ui="test.screenshot-toggle"
        onClick={(event) => {
          void toggleMode('screenshot', event.nativeEvent);
        }}
      />
      <button
        type="button"
        data-ui="test.quickedit-toggle"
        onClick={() => {
          void toggleMode('quickedit');
        }}
      />
      <div data-ui="test.pending-mode">{pendingInteractionMode ?? 'none'}</div>
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installContentRuntimeMessagingMock(modeToggleMocks.sendRuntimeMessage);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  modeToggleMocks.createTrustedContentActionIntentSource.mockReturnValue({
    kind: 'trusted-content-event',
  });
  modeToggleMocks.attachContentActionIntent.mockImplementation(async (message) => ({
    ...message,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
  }));
  setScreenshotSurfaceBinding({ token: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('useToolbarModeToggles', () => {
  it('attaches trusted one-shot intent before content-originated screenshot enable', async () => {
    modeToggleMocks.sendRuntimeMessage.mockResolvedValue({ success: true });
    await act(async () => {
      root?.render(<ModeToggleHarness aiPickMode={false} screenshotMode={false} />);
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.createTrustedContentActionIntentSource).toHaveBeenCalledOnce();
    expect(modeToggleMocks.attachContentActionIntent).toHaveBeenCalledWith(
      { type: 'ENABLE_SCREENSHOT_MODE' },
      { kind: 'trusted-content-event' }
    );
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      type: 'ENABLE_SCREENSHOT_MODE',
    });
  });

  it('recovers a missing surface binding before confirmed screenshot exit', async () => {
    const onToggleScreenshotMode = vi.fn();
    modeToggleMocks.sendRuntimeMessage
      .mockResolvedValueOnce({
        enabled: true,
        success: true,
        surfaceCapabilityToken: 'recovered-surface-token',
        surfaceOperationGeneration: 4,
      })
      .mockResolvedValueOnce({ success: true });
    await act(async () => {
      root?.render(
        <ModeToggleHarness aiPickMode={false} onToggleScreenshotMode={onToggleScreenshotMode} />
      );
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'SCREENSHOT_MODE_STATUS',
    });
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      operationGeneration: 5,
      surfaceCapabilityToken: 'recovered-surface-token',
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(onToggleScreenshotMode).toHaveBeenCalledWith(false);
  });

  it('uses the recovered capability snapshot when a late status result clears local binding', async () => {
    const onToggleScreenshotMode = vi.fn();
    const renewedSurface = {
      success: true,
      surfaceOperationGeneration: 7,
      get surfaceCapabilityToken() {
        queueMicrotask(() => {
          setScreenshotSurfaceBinding({ token: null });
        });
        return 'renewed-surface-token';
      },
    };
    modeToggleMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ enabled: true, success: true })
      .mockResolvedValueOnce(renewedSurface)
      .mockResolvedValueOnce({ success: true });
    await act(async () => {
      root?.render(
        <ModeToggleHarness aiPickMode={false} onToggleScreenshotMode={onToggleScreenshotMode} />
      );
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      operationGeneration: 8,
      surfaceCapabilityToken: 'renewed-surface-token',
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(onToggleScreenshotMode).toHaveBeenCalledWith(false);
    expect(modeToggleMocks.showToast).not.toHaveBeenCalled();
  });

  it('refreshes an expired surface binding and retries screenshot exit once', async () => {
    const onToggleScreenshotMode = vi.fn();
    setScreenshotSurfaceBinding({ operationGeneration: 1, token: 'expired-surface-token' });
    modeToggleMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ success: false, error: 'authorization-expired' })
      .mockResolvedValueOnce({
        enabled: true,
        success: true,
        surfaceCapabilityToken: 'refreshed-surface-token',
        surfaceOperationGeneration: 5,
      })
      .mockResolvedValueOnce({ success: true });
    await act(async () => {
      root?.render(
        <ModeToggleHarness aiPickMode={false} onToggleScreenshotMode={onToggleScreenshotMode} />
      );
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      operationGeneration: 2,
      surfaceCapabilityToken: 'expired-surface-token',
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'SCREENSHOT_MODE_STATUS',
    });
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      operationGeneration: 6,
      surfaceCapabilityToken: 'refreshed-surface-token',
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(onToggleScreenshotMode).toHaveBeenCalledWith(false);
  });

  it('refreshes a compensated surface generation before retrying screenshot exit', async () => {
    const onToggleScreenshotMode = vi.fn();
    setScreenshotSurfaceBinding({
      leaseGeneration: 1,
      operationGeneration: 1,
      token: 'surface-token',
    });
    modeToggleMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ success: false, error: 'stale-generation' })
      .mockResolvedValueOnce({
        enabled: true,
        success: true,
        surfaceCapabilityToken: 'surface-token',
        surfaceLeaseGeneration: 2,
        surfaceOperationGeneration: 2,
      })
      .mockResolvedValueOnce({ success: true });
    await act(async () => {
      root?.render(
        <ModeToggleHarness aiPickMode={false} onToggleScreenshotMode={onToggleScreenshotMode} />
      );
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'SCREENSHOT_MODE_STATUS',
    });
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      leaseGeneration: 2,
      operationGeneration: 3,
      surfaceCapabilityToken: 'surface-token',
      type: 'DISABLE_SCREENSHOT_MODE',
    });
    expect(onToggleScreenshotMode).toHaveBeenCalledWith(false);
  });

  it('preserves local mode state and surfaces failure when secure recovery is denied', async () => {
    const onToggleScreenshotMode = vi.fn();
    modeToggleMocks.sendRuntimeMessage
      .mockResolvedValueOnce({ enabled: true, success: true })
      .mockResolvedValueOnce({ success: false, error: 'authorization-expired' });
    await act(async () => {
      root?.render(
        <ModeToggleHarness aiPickMode={false} onToggleScreenshotMode={onToggleScreenshotMode} />
      );
    });

    const toggleButton = document.querySelector('[data-ui="test.screenshot-toggle"]');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(modeToggleMocks.attachContentActionIntent).toHaveBeenCalledWith(
      { type: 'RENEW_SCREENSHOT_SURFACE_SESSION' },
      { kind: 'trusted-content-event' }
    );
    expect(onToggleScreenshotMode).not.toHaveBeenCalled();
    expect(modeToggleMocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(modeToggleMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps the target editing mode pending before AI mode is cleared', async () => {
    const deferred = createDeferredResponse();
    const disableAiPickMode = vi.fn();
    modeToggleMocks.sendRuntimeMessage.mockReturnValue(deferred.promise);

    await act(async () => {
      root?.render(<ModeToggleHarness aiPickMode={true} onDisableAiPickMode={disableAiPickMode} />);
    });

    const toggleButton = document.querySelector('[data-ui="test.quickedit-toggle"]');

    act(() => {
      toggleButton?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(document.querySelector('[data-ui="test.pending-mode"]')?.textContent).toBe('quick-edit');
    expect(disableAiPickMode).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ success: true });
      await deferred.promise;
    });

    expect(disableAiPickMode).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-ui="test.pending-mode"]')?.textContent).toBe('none');
  });
});
