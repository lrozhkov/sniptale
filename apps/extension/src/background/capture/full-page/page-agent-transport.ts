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
      preferences: FullPageCapturePreferences
    ): Promise<FullPageCapturePrepareResult> {
      const response = await messaging.sendTabMessage(
        args.tabId,
        { type: MessageType.PREPARE_FULL_PAGE_CAPTURE, ...identity, preferences },
        target
      );
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
    async prepareTile(tile: FullPageCaptureTileIdentity): Promise<FullPageCaptureTileState> {
      const response = await messaging.sendTabMessage(
        args.tabId,
        { type: MessageType.PREPARE_FULL_PAGE_TILE, ...tile },
        target
      );
      return requireResult(response, 'tile preparation');
    },
    async verifyTile(
      tile: FullPageCaptureTileIdentity,
      layoutGeneration: string
    ): Promise<FullPageCaptureTileState> {
      const response = await messaging.sendTabMessage(
        args.tabId,
        { type: MessageType.VERIFY_FULL_PAGE_TILE, ...tile, layoutGeneration },
        target
      );
      return requireResult(response, 'tile verification');
    },
    async restore(identity: FullPageCaptureSessionIdentity): Promise<void> {
      const response = await messaging.sendTabMessage(
        args.tabId,
        { type: MessageType.RESTORE_FULL_PAGE_CAPTURE, ...identity },
        target
      );
      if (!response.success) {
        throw new Error(response.error || 'Full-page capture page restore failed');
      }
    },
  };
}

export type FullPagePageAgentTransport = ReturnType<typeof createFullPagePageAgentTransport>;
