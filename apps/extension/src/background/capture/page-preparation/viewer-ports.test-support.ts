import { vi } from 'vitest';
import {
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
  type ViewerPreparationPortRequest,
} from '../../../workflows/page-preparation';
import type { WebSnapshotViewerPortRegistration } from './viewer-ports';

export function createViewerPortRegistration(
  port: Partial<chrome.runtime.Port>,
  generation = 'viewer-generation-1'
): WebSnapshotViewerPortRegistration {
  return {
    generation,
    pendingRequests: new Set(),
    port: port as chrome.runtime.Port,
  };
}

function createMessageEvent(
  listeners: Set<(message: unknown, port: chrome.runtime.Port) => void>
): chrome.events.Event<(message: unknown, port: chrome.runtime.Port) => void> {
  return {
    addListener: (listener) => {
      listeners.add(listener);
    },
    addRules: vi.fn(),
    getRules: vi.fn(),
    hasListener: (listener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    removeListener: (listener) => {
      listeners.delete(listener);
    },
    removeRules: vi.fn(),
  };
}

function createDisconnectEvent(): chrome.events.Event<(port: chrome.runtime.Port) => void> {
  const listeners = new Set<(port: chrome.runtime.Port) => void>();
  return {
    addListener: (listener) => {
      listeners.add(listener);
    },
    addRules: vi.fn(),
    getRules: vi.fn(),
    hasListener: (listener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    removeListener: (listener) => {
      listeners.delete(listener);
    },
    removeRules: vi.fn(),
  };
}

export function createAckingViewerPortRegistration(
  generation = 'viewer-generation-1'
): WebSnapshotViewerPortRegistration {
  const listeners = new Set<(message: unknown, port: chrome.runtime.Port) => void>();
  const onMessage = createMessageEvent(listeners);
  const originalAddListener = onMessage.addListener.bind(onMessage);
  const originalRemoveListener = onMessage.removeListener.bind(onMessage);
  onMessage.addListener = (listener) => {
    listeners.add(listener);
    originalAddListener(listener);
  };
  onMessage.removeListener = (listener) => {
    listeners.delete(listener);
    originalRemoveListener(listener);
  };

  const port: chrome.runtime.Port = {
    disconnect: vi.fn(),
    name: 'sniptale:web-snapshot-viewer',
    onDisconnect: createDisconnectEvent(),
    onMessage,
    postMessage: vi.fn((request: ViewerPreparationPortRequest) => {
      queueMicrotask(() => {
        listeners.forEach((listener) =>
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
      });
    }),
  };

  return createViewerPortRegistration(port, generation);
}
