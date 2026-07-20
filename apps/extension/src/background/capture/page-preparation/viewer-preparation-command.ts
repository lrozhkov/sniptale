import {
  WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
  parseViewerPreparationPortResponse,
  type ViewerPreparationCommand,
  type ViewerPreparationPortRequest,
} from '../../../workflows/page-preparation';
import {
  startViewerPortRequestLifecycle,
  type ViewerPortRegistration,
} from './viewer-port-request-lifecycle';

const VIEWER_PREPARATION_COMMAND_TIMEOUT_MS = 10000;

function createViewerPreparationRequestId(): string {
  return `viewer-preparation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function settleViewerPreparationResponse(
  response: { error?: string; success: boolean },
  cleanup: () => void,
  resolve: () => void,
  reject: (error: Error) => void
): void {
  cleanup();
  if (response.success) {
    resolve();
    return;
  }

  reject(new Error(response.error || 'Web snapshot viewer preparation failed.'));
}

function postViewerPreparationRequest(
  registration: ViewerPortRegistration,
  requestId: string,
  command: ViewerPreparationCommand,
  rejectWithCleanup: (error: Error) => void
): void {
  try {
    registration.port.postMessage({
      type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
      command,
      requestId,
      viewerPortGeneration: registration.generation,
    } satisfies ViewerPreparationPortRequest);
  } catch (error) {
    rejectWithCleanup(
      error instanceof Error ? error : new Error('Web snapshot viewer request failed.')
    );
  }
}

export function waitForViewerPreparationResponse(
  registration: ViewerPortRegistration,
  command: ViewerPreparationCommand
): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = createViewerPreparationRequestId();
    let cleanup: () => void;
    const rejectWithCleanup = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleMessage = (message: unknown) => {
      const response = parseViewerPreparationPortResponse(message, requestId);
      if (response?.viewerPortGeneration === registration.generation) {
        settleViewerPreparationResponse(response, cleanup, resolve, reject);
      }
    };
    const handleDisconnect = () => {
      rejectWithCleanup(
        new Error('Web snapshot viewer disconnected before preparation responded.')
      );
    };
    const handleTimeout = () => {
      rejectWithCleanup(new Error('Web snapshot viewer preparation timed out.'));
    };
    const handleStaleRequest = (error: Error) => rejectWithCleanup(error);

    cleanup = startViewerPortRequestLifecycle(registration, {
      handleDisconnect,
      handleMessage,
      handleStaleRequest,
      handleTimeout,
      timeoutMs: VIEWER_PREPARATION_COMMAND_TIMEOUT_MS,
    });
    postViewerPreparationRequest(registration, requestId, command, rejectWithCleanup);
  });
}
