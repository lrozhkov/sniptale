// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickActionOverlay } from '../../../../contracts/settings';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const storageMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(async () => ({})),
  sendRuntimeMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),

  loadSettings: storageMocks.loadSettings,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: storageMocks.sendRuntimeMessage,
}));

import { useContentAppModeState } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useContentAppModeState> | null = null;

function Harness() {
  latestState = useContentAppModeState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

function getLatestState() {
  expect(latestState).not.toBeNull();
  return latestState as ReturnType<typeof useContentAppModeState>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installContentRuntimeMessagingMock(storageMocks.sendRuntimeMessage);
  storageMocks.loadSettings.mockClear();
  storageMocks.sendRuntimeMessage.mockReset();
  storageMocks.sendRuntimeMessage.mockResolvedValue({
    pinToTab: false,
    pinToTabAvailable: true,
    restored: false,
    success: true,
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

function registerStableOverlayStateTests() {
  it('keeps pending auto-start handlers stable across rerenders', async () => {
    await renderHarness();
    const firstState = getLatestState();

    await renderHarness();
    const secondState = getLatestState();

    expect(secondState.clearPendingAutoStartCapture).toBe(firstState.clearPendingAutoStartCapture);
    expect(secondState.queueAutoStartCapture).toBe(firstState.queueAutoStartCapture);
  });

  it('updates the quick-action overlay ref through the canonical setter', async () => {
    const overlay: QuickActionOverlay = {
      afterCapture: 'copy',
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 100,
    };

    await renderHarness();

    act(() => {
      getLatestState().setQuickActionOverlay(overlay);
    });

    expect(getLatestState().quickActionOverlayRef.current).toEqual(overlay);

    act(() => {
      getLatestState().setQuickActionOverlay(null);
    });

    expect(getLatestState().quickActionOverlayRef.current).toBeNull();
  });
}

function registerPinnedToolbarWindowStorageRestoreTest() {
  it('does not restore screenshot mode from page-owned window session storage', async () => {
    window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

    await renderHarness();
    await act(async () => {
      await Promise.resolve();
    });

    expect(storageMocks.sendRuntimeMessage).not.toHaveBeenCalledWith({
      type: 'SCREENSHOT_MODE_STATUS',
    });
    expect(getLatestState().pinToTab).toBe(false);
    expect(getLatestState().screenshotMode).toBe(false);
    expect(getLatestState().isToolbarVisible).toBe(false);
    expect(getLatestState().currentViewport).toBeNull();
  });
}

function registerPinnedToolbarBackgroundRestoreTest() {
  it('hydrates pin-to-tab through background and makes the restored toolbar visible', async () => {
    storageMocks.sendRuntimeMessage
      .mockResolvedValueOnce({
        pinToTab: true,
        pinToTabAvailable: true,
        reason: 'pin-to-tab',
        restored: true,
        success: true,
      })
      .mockResolvedValueOnce({
        success: true,
        documentId: 'content-document-7',
        enabled: true,
        tabId: 7,
        viewport: { width: 1440, height: 900 },
      });

    await renderHarness();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storageMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'CONTENT_RUNTIME_WAKEUP',
    });
    expect(storageMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'SCREENSHOT_MODE_STATUS',
    });
    expect(getLatestState().pinToTab).toBe(true);
    expect(getLatestState().screenshotMode).toBe(true);
    expect(getLatestState().isToolbarVisible).toBe(true);
    expect(getLatestState().currentViewport).toEqual({ width: 1440, height: 900 });
  });
}

function registerPinnedToolbarLifecycleTest() {
  it('keeps the user pin when background lifecycle cleanup disables screenshot mode', async () => {
    storageMocks.sendRuntimeMessage.mockResolvedValueOnce({
      pinToTab: true,
      pinToTabAvailable: true,
      restored: true,
      success: true,
    });

    await renderHarness();
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      getLatestState().setScreenshotMode(true);
    });
    act(() => {
      getLatestState().setScreenshotMode(false);
    });

    expect(getLatestState().pinToTab).toBe(true);
    expect(storageMocks.sendRuntimeMessage).not.toHaveBeenCalledWith({
      pinToTab: false,
      type: 'CONTENT_RUNTIME_WAKEUP',
    });
  });
}

async function verifyStalePinHydrationIsIgnored() {
  let resolveHydration: (value: unknown) => void = () => undefined;
  storageMocks.sendRuntimeMessage
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHydration = resolve;
      })
    )
    .mockResolvedValue({
      pinToTab: true,
      pinToTabAvailable: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    });

  await renderHarness();

  act(() => {
    getLatestState().setPinToTab(true);
  });
  await act(async () => {
    resolveHydration({
      pinToTab: false,
      pinToTabAvailable: true,
      restored: false,
      success: true,
    });
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(getLatestState().pinToTab).toBe(true);
}

async function verifyDelayedPreferenceDoesNotOverwriteScenarioRestore() {
  let resolveSettings: (value: { captureAction: 'download_default' }) => void = () => undefined;
  storageMocks.loadSettings.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSettings = resolve;
    })
  );

  await renderHarness();

  act(() => {
    getLatestState().setCaptureAction('scenario');
    getLatestState().setScreenshotMode(true);
    getLatestState().setIsToolbarVisible(true);
  });
  await act(async () => {
    resolveSettings({ captureAction: 'download_default' });
    await Promise.resolve();
  });

  expect(getLatestState().captureAction).toBe('scenario');
  expect(getLatestState().screenshotMode).toBe(true);
  expect(getLatestState().isToolbarVisible).toBe(true);
}

describe('useContentAppModeState', () => {
  it('projects the Design Review flag and control through the grouped mode owner', async () => {
    await renderHarness();

    expect(getLatestState().designReviewMode).toBe(false);
    act(() => getLatestState().setDesignReviewMode(true));
    expect(getLatestState().designReviewMode).toBe(true);
  });

  registerStableOverlayStateTests();
  registerPinnedToolbarWindowStorageRestoreTest();
  registerPinnedToolbarBackgroundRestoreTest();
  registerPinnedToolbarLifecycleTest();
  it(
    'does not let stale pin-to-tab hydration overwrite a newer toggle',
    verifyStalePinHydrationIsIgnored
  );
  it(
    'does not let delayed capture preferences overwrite scenario restore',
    verifyDelayedPreferenceDoesNotOverwriteScenarioRestore
  );
});
