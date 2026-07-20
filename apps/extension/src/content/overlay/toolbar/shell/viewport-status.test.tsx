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
  it('requests only screenshot mode status and updates the viewport on success', async () => {
    const setCurrentViewport = vi.fn();
    viewportStatusMocks.sendRuntimeMessage.mockResolvedValueOnce({
      success: true,
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
