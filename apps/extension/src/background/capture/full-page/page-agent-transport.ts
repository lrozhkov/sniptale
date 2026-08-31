import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import type {
  FullPageCapturePreferences,
  FullPageCapturePrepareResult,
  FullPageCaptureSessionIdentity,
  FullPageCaptureTileIdentity,
  FullPageCaptureTileState,
} from '../../../contracts/full-page-capture';

const PAGE_AGENT_PREPARE_TIMEOUT_MS = 35_000;
const PAGE_AGENT_OPERATION_TIMEOUT_MS = 5_000;

function waitForPageAgentResponse<T>(args: {
  request: () => Promise<T>;
  signal?: AbortSignal | undefined;
  stage: string;
  timeoutMs: number;
}): Promise<T> {
  if (args.signal?.aborted) {
    return Promise.reject(args.signal.reason ?? new Error('Full-page capture cancelled'));
  }
  const request = args.request();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener = () => {};
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Full-page capture page agent timed out during ${args.stage}`)),
      args.timeoutMs
    );
  });
  const cancellation = new Promise<never>((_, reject) => {
    const cancel = () => reject(args.signal?.reason ?? new Error('Full-page capture cancelled'));
    args.signal?.addEventListener('abort', cancel, { once: true });
    removeAbortListener = () => args.signal?.removeEventListener('abort', cancel);
  });
  void request.catch(() => undefined);
  return Promise.race([request, timeout, cancellation]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
    removeAbortListener();
  });
}

function requireResult<T>(
  response: {
    error?: string | undefined;
    result?: T | undefined;
    success?: boolean | undefined;
  },
  stage: string
): T {
  if (response.success !== true || !response.result) {
    throw new Error(response.error || `Full-page capture page agent failed during ${stage}`);
  }
  return response.result;
}

export function createFullPagePageAgentTransport(
  args: { documentId: string; tabId: number },
  messaging: Pick<RuntimeMessagingTransport, 'sendTabMessage'> = getBackgroundRuntimeMessaging()
) {
  const target = { documentId: args.documentId };
  return {
    async prepare(
      identity: FullPageCaptureSessionIdentity,
      preferences: FullPageCapturePreferences,
      signal?: AbortSignal
    ): Promise<FullPageCapturePrepareResult> {
      const response = await waitForPageAgentResponse({
        request: () =>
          messaging.sendTabMessage(
            args.tabId,
            { type: MessageType.PREPARE_FULL_PAGE_CAPTURE, ...identity, preferences },
            target
          ),
        signal,
        stage: 'prepare',
        timeoutMs: PAGE_AGENT_PREPARE_TIMEOUT_MS,
      });
      return requireResult(response, 'prepare');
    },
    async heartbeat(identity: FullPageCaptureSessionIdentity): Promise<void> {
      const response = await messaging.sendTabMessage(
        args.tabId,
        { type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE, ...identity },
        target
      );
      if (!response.success) {
        throw new Error(response.error || 'Full-page capture page heartbeat failed');
      }
    },
    async prepareTile(
      tile: FullPageCaptureTileIdentity,
      signal?: AbortSignal
    ): Promise<FullPageCaptureTileState> {
      const response = await waitForPageAgentResponse({
        request: () =>
          messaging.sendTabMessage(
            args.tabId,
            { type: MessageType.PREPARE_FULL_PAGE_TILE, ...tile },
            target
          ),
        signal,
        stage: 'tile preparation',
        timeoutMs: PAGE_AGENT_OPERATION_TIMEOUT_MS,
      });
      return requireResult(response, 'tile preparation');
    },
    async verifyTile(
      tile: FullPageCaptureTileIdentity,
      layoutGeneration: string,
      signal?: AbortSignal
    ): Promise<FullPageCaptureTileState> {
      const response = await waitForPageAgentResponse({
        request: () =>
          messaging.sendTabMessage(
            args.tabId,
            { type: MessageType.VERIFY_FULL_PAGE_TILE, ...tile, layoutGeneration },
            target
          ),
        signal,
        stage: 'tile verification',
        timeoutMs: PAGE_AGENT_OPERATION_TIMEOUT_MS,
      });
      return requireResult(response, 'tile verification');
    },
    async restore(identity: FullPageCaptureSessionIdentity): Promise<void> {
      const response = await waitForPageAgentResponse({
        request: () =>
          messaging.sendTabMessage(
            args.tabId,
            { type: MessageType.RESTORE_FULL_PAGE_CAPTURE, ...identity },
            target
          ),
        stage: 'restore',
        timeoutMs: PAGE_AGENT_OPERATION_TIMEOUT_MS,
      });
      if (!response.success) {
        throw new Error(response.error || 'Full-page capture page restore failed');
      }
    },
  };
}

export type FullPagePageAgentTransport = ReturnType<typeof createFullPagePageAgentTransport>;
