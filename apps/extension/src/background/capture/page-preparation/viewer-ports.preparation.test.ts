import { afterEach, expect, it, vi } from 'vitest';

import {
  WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PORT,
} from '../../../workflows/page-preparation';
import { sendViewerPreparationCommand, type WebSnapshotViewerPorts } from './viewer-ports';
import { createViewerPortRegistration } from './viewer-ports.test-support';

function createChromeEvent<TListener extends (...args: any) => void>() {
  const listeners = new Set<TListener>();
  return {
    event: {
      addListener: (listener: TListener) => listeners.add(listener),
      addRules: vi.fn(),
      getRules: vi.fn(),
      hasListener: (listener: TListener) => listeners.has(listener),
      hasListeners: () => listeners.size > 0,
      removeListener: (listener: TListener) => listeners.delete(listener),
      removeRules: vi.fn(),
    } as chrome.events.Event<TListener>,
    listeners,
  };
}

function createPreparationPort(args: { postMessage?: chrome.runtime.Port['postMessage'] } = {}) {
  const messages = createChromeEvent<(message: unknown, port: chrome.runtime.Port) => void>();
  const disconnects = createChromeEvent<(port: chrome.runtime.Port) => void>();
  const port: chrome.runtime.Port = {
    disconnect: vi.fn(),
    name: WEB_SNAPSHOT_VIEWER_PORT,
    onDisconnect: disconnects.event,
    onMessage: messages.event,
    postMessage: args.postMessage ?? vi.fn(),
  };
  return { disconnects, messages, port };
}

function createPorts(tabId: number, port: chrome.runtime.Port): WebSnapshotViewerPorts {
  return new Map([[tabId, createViewerPortRegistration(port)]]);
}

afterEach(() => {
  vi.useRealTimers();
});

it('sends preparation commands and resolves correlated responses', async () => {
  const { messages, port } = createPreparationPort();
  const resultPromise = sendViewerPreparationCommand(createPorts(12, port), 12, {
    type: 'DISABLE_SCREENSHOT_MODE',
  });
  const request = vi.mocked(port.postMessage).mock.calls[0]?.[0];

  expect(request).toEqual({
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
    command: { type: 'DISABLE_SCREENSHOT_MODE' },
    requestId: expect.any(String),
    viewerPortGeneration: 'viewer-generation-1',
  });

  messages.listeners.forEach((listener) =>
    listener(
      {
        type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
        requestId: request.requestId,
        success: true,
        viewerPortGeneration: request.viewerPortGeneration,
      },
      port
    )
  );

  await expect(resultPromise).resolves.toBeUndefined();
});

it('rejects preparation commands when the viewer reports failure or is missing', async () => {
  const { messages, port } = createPreparationPort();
  const resultPromise = sendViewerPreparationCommand(createPorts(14, port), 14, {
    type: 'ENABLE_SCREENSHOT_MODE',
  });
  const request = vi.mocked(port.postMessage).mock.calls[0]?.[0];

  messages.listeners.forEach((listener) =>
    listener(
      {
        type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
        error: 'viewer command failed',
        requestId: request.requestId,
        success: false,
        viewerPortGeneration: request.viewerPortGeneration,
      },
      port
    )
  );

  await expect(resultPromise).rejects.toThrow('viewer command failed');
  expect(() =>
    sendViewerPreparationCommand(new Map(), 13, { type: 'ENABLE_SCREENSHOT_MODE' })
  ).toThrow('Web snapshot viewer is not ready');
});

it('rejects preparation commands when posting to the viewer fails', async () => {
  const { port } = createPreparationPort({
    postMessage: vi.fn(() => {
      throw new Error('post failed');
    }),
  });

  await expect(
    sendViewerPreparationCommand(createPorts(15, port), 15, {
      type: 'ENABLE_SCREENSHOT_MODE',
    })
  ).rejects.toThrow('post failed');
});

it('rejects preparation commands when the viewer disconnects before response', async () => {
  const { disconnects, port } = createPreparationPort();
  const resultPromise = sendViewerPreparationCommand(createPorts(16, port), 16, {
    type: 'ENABLE_SCREENSHOT_MODE',
  });

  disconnects.listeners.forEach((listener) => listener(port));

  await expect(resultPromise).rejects.toThrow('disconnected before preparation responded');
});

it('rejects and cleans up preparation commands that time out', async () => {
  vi.useFakeTimers();
  const { disconnects, messages, port } = createPreparationPort();
  const ports = createPorts(18, port);
  const resultPromise = sendViewerPreparationCommand(ports, 18, {
    type: 'ENABLE_SCREENSHOT_MODE',
  });
  const rejection = expect(resultPromise).rejects.toThrow('preparation timed out');

  await vi.advanceTimersByTimeAsync(10_000);

  await rejection;
  expect(ports.get(18)?.pendingRequests.size).toBe(0);
  expect(messages.listeners.size).toBe(0);
  expect(disconnects.listeners.size).toBe(0);
});

it('rejects and cleans up preparation commands invalidated by port replacement', async () => {
  const { disconnects, messages, port } = createPreparationPort();
  const ports = createPorts(19, port);
  const resultPromise = sendViewerPreparationCommand(ports, 19, {
    type: 'ENABLE_SCREENSHOT_MODE',
  });
  const registration = ports.get(19);
  const rejectPending = [...(registration?.pendingRequests ?? [])][0];

  rejectPending?.(new Error('viewer replaced'));

  await expect(resultPromise).rejects.toThrow('viewer replaced');
  expect(registration?.pendingRequests.size).toBe(0);
  expect(messages.listeners.size).toBe(0);
  expect(disconnects.listeners.size).toBe(0);
});

it('ignores stale preparation responses from a replaced viewer generation', async () => {
  const { disconnects, messages, port } = createPreparationPort();
  const resultPromise = sendViewerPreparationCommand(createPorts(17, port), 17, {
    type: 'ENABLE_SCREENSHOT_MODE',
  });
  const request = vi.mocked(port.postMessage).mock.calls[0]?.[0];

  messages.listeners.forEach((listener) =>
    listener(
      {
        type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
        requestId: request.requestId,
        success: true,
        viewerPortGeneration: 'stale-generation',
      },
      port
    )
  );
  disconnects.listeners.forEach((listener) => listener(port));

  await expect(resultPromise).rejects.toThrow('disconnected before preparation responded');
});
