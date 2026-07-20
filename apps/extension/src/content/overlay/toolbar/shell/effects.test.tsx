// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const shellMocks = vi.hoisted(() => ({
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: shellMocks.sendRuntimeMessage,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: shellMocks.showToast,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  disableNavigationLock: shellMocks.disableNavigationLock,
  enableNavigationLock: shellMocks.enableNavigationLock,
}));

import { useToolbarButtonFocusBlur, useToolbarNavigationLock, useToolbarViewportStatus } from '.';

type NavigationState = ReturnType<typeof useToolbarNavigationLock>;

let container: HTMLDivElement | null = null;
let latestNavigationState: NavigationState | null = null;
let root: Root | null = null;

function createViewportStatusHarnessProps() {
  return {
    setCurrentViewport: vi.fn(),
  };
}

function ViewportStatusHarness(props: ReturnType<typeof createViewportStatusHarnessProps>) {
  useToolbarViewportStatus(props);
  return null;
}

function NavigationHarness(props: Parameters<typeof useToolbarNavigationLock>[0]) {
  const state = useToolbarNavigationLock(props);

  useEffect(() => {
    latestNavigationState = state;
  });

  return null;
}

function FocusBlurHarness(props: Parameters<typeof useToolbarButtonFocusBlur>[0]) {
  useToolbarButtonFocusBlur(props);
  return null;
}

async function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

function getNavigationState() {
  if (!latestNavigationState) {
    throw new Error('Navigation state is not ready');
  }

  return latestNavigationState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installContentRuntimeMessagingMock(shellMocks.sendRuntimeMessage);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestNavigationState = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function registerToolbarViewportStatusTests() {
  it('requests runtime statuses and updates the current viewport on success', async () => {
    const props = createViewportStatusHarnessProps();
    shellMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      viewport: { width: 640, height: 480 },
    });

    await renderElement(<ViewportStatusHarness {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(shellMocks.sendRuntimeMessage.mock.calls).toEqual([
      [{ type: MessageType.SCREENSHOT_MODE_STATUS }],
    ]);
    expect(props.setCurrentViewport).toHaveBeenCalledWith({ width: 640, height: 480 });
  });

  it('falls back to null viewport and logs status errors', async () => {
    const props = createViewportStatusHarnessProps();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    shellMocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('status failed'));

    await renderElement(<ViewportStatusHarness {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleError).toHaveBeenCalledWith(
      '[ContentToolbarShell]',
      'Failed to check screenshot mode status',
      expect.any(Error)
    );
    expect(props.setCurrentViewport).not.toHaveBeenCalled();
  });
}

describe('toolbar viewport status hook', () => {
  registerToolbarViewportStatusTests();
});

async function renderNavigationHarness(
  overrides: Partial<Parameters<typeof useToolbarNavigationLock>[0]> = {}
) {
  await renderElement(
    <NavigationHarness
      aiPickMode={false}
      highlighterMode={false}
      isCursorMode={false}
      quickEditMode={false}
      scenarioCaptureMode="manual"
      scenarioEnabled={false}
      screenshotMode={true}
      {...overrides}
    />
  );
}

function registerManagedNavigationLockTests() {
  it('enables managed locking for interactive modes and toggles the manual lock state', async () => {
    const onToggleNavigationLock = vi.fn();

    await renderNavigationHarness({ onToggleNavigationLock });

    expect(shellMocks.enableNavigationLock).toHaveBeenCalledWith(false);
    expect(getNavigationState().lockDisabled).toBe(false);
    expect(getNavigationState().lockTitle).toBe('content.toolbar.navigationUnlock');

    act(() => {
      getNavigationState().toggleNavigationLock();
    });

    expect(shellMocks.disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(onToggleNavigationLock).toHaveBeenCalledWith(false);

    await renderNavigationHarness({ aiPickMode: true });

    expect(shellMocks.enableNavigationLock).toHaveBeenLastCalledWith(true);
    expect(getNavigationState().lockDisabled).toBe(true);
    expect(getNavigationState().lockTitle).toBe('content.toolbar.navigationLockManaged');
  });
}

function registerScreenshotNavigationLockTests() {
  it('restores links-only locking for plain screenshot mode after leaving cursor mode', async () => {
    await renderNavigationHarness({ screenshotMode: false });

    expect(shellMocks.disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(getNavigationState().navigationLockEnabled).toBe(false);

    await renderNavigationHarness({ screenshotMode: true });

    expect(shellMocks.enableNavigationLock).toHaveBeenLastCalledWith(false);
    expect(getNavigationState().navigationLockEnabled).toBe(true);
    expect(getNavigationState().lockDisabled).toBe(false);
  });

  it('keeps navigation unlocked in standard cursor mode even while screenshot mode is active', async () => {
    await renderNavigationHarness({
      isCursorMode: true,
      screenshotMode: true,
    });

    expect(shellMocks.disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(shellMocks.enableNavigationLock).not.toHaveBeenCalled();
    expect(getNavigationState().navigationLockEnabled).toBe(false);
    expect(getNavigationState().lockDisabled).toBe(true);
  });

  it('keeps navigation unlocked while scenario by-click capture is active', async () => {
    await renderNavigationHarness({
      scenarioCaptureMode: 'by-click',
      scenarioEnabled: true,
    });

    expect(shellMocks.disableNavigationLock).toHaveBeenCalledTimes(1);
    expect(getNavigationState().lockDisabled).toBe(true);
    expect(getNavigationState().lockTitle).toBe('content.toolbar.navigationLockManaged');
  });
}

describe('toolbar navigation lock hook', () => {
  registerManagedNavigationLockTests();
  registerScreenshotNavigationLockTests();
});

describe('toolbar button focus blur hook', () => {
  it('blurs inactive toolbar buttons when their modes are turned off', async () => {
    const aiButton = document.createElement('button');
    const highlighterButton = document.createElement('button');
    const quickEditButton = document.createElement('button');
    const aiBlur = vi.spyOn(aiButton, 'blur');
    const highlighterBlur = vi.spyOn(highlighterButton, 'blur');
    const quickEditBlur = vi.spyOn(quickEditButton, 'blur');
    const aiButtonRef = { current: aiButton };
    const highlighterButtonRef = { current: highlighterButton };
    const quickEditButtonRef = { current: quickEditButton };

    await renderElement(
      <FocusBlurHarness
        aiPickMode={false}
        highlighterMode={false}
        quickEditMode={false}
        aiButtonRef={aiButtonRef}
        highlighterButtonRef={highlighterButtonRef}
        quickEditButtonRef={quickEditButtonRef}
      />
    );

    expect(aiBlur).toHaveBeenCalledTimes(1);
    expect(highlighterBlur).toHaveBeenCalledTimes(1);
    expect(quickEditBlur).toHaveBeenCalledTimes(1);
  });
});
