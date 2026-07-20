import { parsePopupRuntimeMessage } from '../../../../../contracts/messaging/parsers/boundary';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeMessage } from '../types';

export function parsePopupExportRuntimeMessage(message: unknown): PopupExportRuntimeMessage | null {
  try {
    const parsedMessage = parsePopupRuntimeMessage(message);
    if (
      parsedMessage.type === MessageType.EXPORT_POPUP_PROGRESS ||
      parsedMessage.type === MessageType.EXPORT_POPUP_RESULT
    ) {
      return parsedMessage;
    }
  } catch {
    return null;
  }

  return null;
}
