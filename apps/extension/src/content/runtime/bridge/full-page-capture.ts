import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { FullPageCaptureAgent } from '../../application/full-page-capture';
import type { ContentRuntimeMessage } from './types';

export function handleFullPageCaptureMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender,
  agent: FullPageCaptureAgent
): boolean | null {
  if (
    message.type !== MessageType.PREPARE_FULL_PAGE_CAPTURE &&
    message.type !== MessageType.HEARTBEAT_FULL_PAGE_CAPTURE &&
    message.type !== MessageType.PREPARE_FULL_PAGE_TILE &&
    message.type !== MessageType.VERIFY_FULL_PAGE_TILE &&
    message.type !== MessageType.RESTORE_FULL_PAGE_CAPTURE
  ) {
    return null;
  }
  void agent
    .handle(message)
    .then(sendResponse)
    .catch((error: unknown) =>
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Full-page capture page agent failed',
      })
    );
  return true;
}
