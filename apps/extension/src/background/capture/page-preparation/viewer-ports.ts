import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
  WEB_SNAPSHOT_VIEWER_PORT,
  parseViewerExportPortResponse,
  type ViewerExportPortRequest,
  type ViewerExportPortResponse,
  type ViewerPopupExportMessage,
  type ViewerPreparationCommand,
} from '../../../workflows/page-preparation';
import { isOwnedSnapshotViewerPage } from '../../../features/tab-capabilities/url';
import {
  startViewerPortRequestLifecycle,
  type ViewerPortRegistration,
} from './viewer-port-request-lifecycle';
import { waitForViewerPreparationResponse } from './viewer-preparation-command';

const VIEWER_POPUP_EXPORT_TIMEOUT_MS = 60000;

export type WebSnapshotViewerPortRegistration = ViewerPortRegistration;

export type WebSnapshotViewerPorts = Map<number, WebSnapshotViewerPortRegistration>;

export function createWebSnapshotViewerPorts(): WebSnapshotViewerPorts {
  return new Map();
}

function createViewerExportRequestId(): string {
  return `viewer-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createViewerPortGeneration(port: chrome.runtime.Port): string {
  if (typeof port.sender?.documentId === 'string' && port.sender.documentId.length > 0) {
    return port.sender.documentId;
  }

  return `viewer-port-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rejectPendingViewerPortRequests(
  registration: WebSnapshotViewerPortRegistration,
  error: Error
): void {
  const pendingRequests = [...registration.pendingRequests];
  registration.pendingRequests.clear();
  pendingRequests.forEach((rejectPending) => rejectPending(error));
}

function toViewerPortError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Web snapshot viewer request failed.');
}

export function registerWebSnapshotViewerPorts(ports: WebSnapshotViewerPorts): () => void {
  return browserRuntime.subscribeToConnections((port) => {
    if (
      port.name !== WEB_SNAPSHOT_VIEWER_PORT ||
      typeof port.sender?.tab?.id !== 'number' ||
      !isOwnedSnapshotViewerPage(port.sender.url)
    ) {
      return;
    }

    const tabId = port.sender.tab.id;
    const previousRegistration = ports.get(tabId);
    if (previousRegistration) {
      rejectPendingViewerPortRequests(
        previousRegistration,
        new Error('Web snapshot viewer was replaced before export responded.')
      );
      previousRegistration.port.disconnect();
    }

    const registration: WebSnapshotViewerPortRegistration = {
      generation: createViewerPortGeneration(port),
      pendingRequests: new Set(),
      port,
    };
    ports.set(tabId, registration);
    port.onDisconnect.addListener(() => {
      if (ports.get(tabId) === registration) {
        ports.delete(tabId);
      }
      rejectPendingViewerPortRequests(
        registration,
        new Error('Web snapshot viewer disconnected before export responded.')
      );
    });
  });
}

export function sendViewerPreparationCommand(
  ports: WebSnapshotViewerPorts,
  tabId: number,
  command: ViewerPreparationCommand
): Promise<void> {
  const registration = ports.get(tabId);
  if (!registration) {
    throw new Error('Web snapshot viewer is not ready for page preparation.');
  }

  return waitForViewerPreparationResponse(registration, command);
}

export function sendViewerPopupExportMessage(
  ports: WebSnapshotViewerPorts,
  tabId: number,
  request: ViewerPopupExportMessage
): Promise<ViewerExportPortResponse['response']> {
  const registration = ports.get(tabId);
  if (!registration) {
    return Promise.reject(new Error('Web snapshot viewer is not ready for export.'));
  }

  return waitForViewerPopupExportResponse(registration, request);
}

function waitForViewerPopupExportResponse(
  registration: WebSnapshotViewerPortRegistration,
  request: ViewerPopupExportMessage
): Promise<ViewerExportPortResponse['response']> {
  return new Promise((resolve, reject) => {
    const requestId = createViewerExportRequestId();
    let cleanup: () => void;
    const rejectWithCleanup = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleMessage = (message: unknown) => {
      const response = parseViewerExportPortResponse(message, requestId);
      if (!response || response.viewerPortGeneration !== registration.generation) {
        return;
      }

      cleanup();
      resolveViewerPopupExportMessage(resolve, response);
    };
    const handleDisconnect = () => {
      rejectWithCleanup(new Error('Web snapshot viewer disconnected before export responded.'));
    };
    const handleTimeout = () => {
      rejectWithCleanup(new Error('Web snapshot viewer export timed out.'));
    };
    const handleStaleRequest = (error: Error) => {
      rejectWithCleanup(error);
    };

    cleanup = startViewerPortRequestLifecycle(registration, {
      handleDisconnect,
      handleMessage,
      handleStaleRequest,
      handleTimeout,
      timeoutMs: VIEWER_POPUP_EXPORT_TIMEOUT_MS,
    });
    postViewerPopupExportRequest(registration, requestId, request, rejectWithCleanup);
  });
}

function postViewerPopupExportRequest(
  registration: WebSnapshotViewerPortRegistration,
  requestId: string,
  request: ViewerPopupExportMessage,
  rejectWithCleanup: (error: Error) => void
): void {
  try {
    registration.port.postMessage({
      type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
      requestId,
      viewerPortGeneration: registration.generation,
      request,
    } satisfies ViewerExportPortRequest);
  } catch (error) {
    rejectWithCleanup(toViewerPortError(error));
  }
}

function resolveViewerPopupExportMessage(
  resolve: (response: ViewerExportPortResponse['response']) => void,
  response: ViewerExportPortResponse
) {
  resolve(response.response);
}
