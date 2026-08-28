import { parsePopupRuntimeMessage } from '../../../../../contracts/messaging/parsers/boundary';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeMessage } from '../types';

export function parsePopupExportRuntimeMessage(message: unknown): PopupExportRuntimeMessage | null {
  try {
    const parsedMessage = parsePopupRuntimeMessage(message);
    if (
      parsedMessage.type === MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED ||
      parsedMessage.type === MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED
    ) {
      return parsedMessage;
    }
  } catch {
    return null;
  }

  return null;
}
