// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const viewportStatusMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: viewportStatusMocks.sendRuntimeMessage,
}));

import { useToolbarViewportStatus } from './viewport-status';
import {
  createDisableScreenshotModeRequest,
  getScreenshotSurfaceCapabilityToken,
  requireScreenshotSurfaceCapabilityToken,
  setScreenshotSurfaceBinding,
} from '../../viewport-selector/capability';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ViewportStatusHarness(props: {
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}) {
  useToolbarViewportStatus(props);
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

async function flushEffects() {
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installContentRuntimeMessagingMock(viewportStatusMocks.sendRuntimeMessage);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useToolbarViewportStatus', () => {
  it('ignores an unbound status after a newer preparation binding', async () => {
    let resolveStatus!: (response: { success: true; enabled: true }) => void;
    viewportStatusMocks.sendRuntimeMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );
    setScreenshotSurfaceBinding({ token: 'startup-token', operationGeneration: 1 });
    const setCurrentViewport = vi.fn();
    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    setScreenshotSurfaceBinding({ token: 'replacement-token', operationGeneration: 8 });
    await act(async () => resolveStatus({ success: true, enabled: true }));
    expect(getScreenshotSurfaceCapabilityToken()).toBe('replacement-token');
    expect(setCurrentViewport).not.toHaveBeenCalled();
  });

  it('preserves the minted binding when enabled status has not bound its document', async () => {
    setScreenshotSurfaceBinding({
      token: 'startup-token',
      leaseGeneration: 3,
      operationGeneration: 4,
    });
    viewportStatusMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      enabled: true,
      viewport: { width: 640, height: 480 },
    });
    const setCurrentViewport = vi.fn();
    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    expect(createDisableScreenshotModeRequest()).toEqual({
      type: MessageType.DISABLE_SCREENSHOT_MODE,
      surfaceCapabilityToken: 'startup-token',
      leaseGeneration: 3,
      operationGeneration: 5,
    });
    expect(setCurrentViewport).toHaveBeenCalledWith({ width: 640, height: 480 });
  });

  it('ignores a status response after its toolbar unmounts', async () => {
    let resolveStatus!: (response: { success: true; enabled: false }) => void;
    viewportStatusMocks.sendRuntimeMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );
    setScreenshotSurfaceBinding({ token: 'active-token' });
    const setCurrentViewport = vi.fn();
    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    act(() => root?.unmount());
    root = null;
    await act(async () => resolveStatus({ success: true, enabled: false }));
    expect(getScreenshotSurfaceCapabilityToken()).toBe('active-token');
    expect(setCurrentViewport).not.toHaveBeenCalled();
  });

  it('applies a current disabled status when no newer binding supersedes it', async () => {
    viewportStatusMocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true, enabled: false });
    setScreenshotSurfaceBinding({ token: 'expired-token' });
    const setCurrentViewport = vi.fn();
    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    expect(getScreenshotSurfaceCapabilityToken()).toBeNull();
    expect(setCurrentViewport).toHaveBeenCalledWith(null);
  });

  it.each(['existing-token', 'replacement-token'])(
    'preserves a newer ENABLE binding from a delayed disabled status: %s',
    async (token) => {
      let resolveStatus!: (response: { success: true; enabled: false }) => void;
      viewportStatusMocks.sendRuntimeMessage.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStatus = resolve;
        })
      );
      setScreenshotSurfaceBinding({ token: 'existing-token', operationGeneration: 1 });
      const setCurrentViewport = vi.fn();
      await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
      setScreenshotSurfaceBinding({ token, operationGeneration: 5 });
      await act(async () => resolveStatus({ success: true, enabled: false }));
      expect(requireScreenshotSurfaceCapabilityToken()).toBe(token);
      expect(createDisableScreenshotModeRequest()).toEqual({
        type: MessageType.DISABLE_SCREENSHOT_MODE,
        surfaceCapabilityToken: token,
        operationGeneration: 6,
      });
      expect(setCurrentViewport).not.toHaveBeenCalled();
    }
  );

  it('requests only screenshot mode status and updates the viewport on success', async () => {
    const setCurrentViewport = vi.fn();
    viewportStatusMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      enabled: true,
      surfaceCapabilityToken: 'surface-token-2',
      viewport: { width: 640, height: 480 },
    });

    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    await act(async () => {
      await flushEffects();
    });

    expect(viewportStatusMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: MessageType.SCREENSHOT_MODE_STATUS,
    });
    expect(viewportStatusMocks.sendRuntimeMessage).toHaveBeenCalledTimes(1);
    expect(setCurrentViewport).toHaveBeenCalledWith({ width: 640, height: 480 });
    expect(requireScreenshotSurfaceCapabilityToken()).toBe('surface-token-2');
  });

  it('logs screenshot status failures without mutating the viewport', async () => {
    const setCurrentViewport = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    viewportStatusMocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('status failed'));

    await renderElement(<ViewportStatusHarness setCurrentViewport={setCurrentViewport} />);
    await act(async () => {
      await flushEffects();
    });

    expect(consoleError).toHaveBeenCalledWith(
      '[ContentToolbarShell]',
      'Failed to check screenshot mode status',
      expect.any(Error)
    );
    expect(setCurrentViewport).not.toHaveBeenCalled();
  });
});
