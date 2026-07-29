import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '../validators';

export type PopupExportControlRequest =
  | { type: typeof MessageType.EXPORT_POPUP_PREVIEW }
  | { type: typeof MessageType.EXPORT_POPUP_CANCEL; exportRunId: string };

export function parsePopupExportControlRequest(value: unknown): PopupExportControlRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value['type'] === MessageType.EXPORT_POPUP_PREVIEW) {
    return { type: MessageType.EXPORT_POPUP_PREVIEW };
  }

  return value['type'] === MessageType.EXPORT_POPUP_CANCEL &&
    typeof value['exportRunId'] === 'string'
    ? { type: MessageType.EXPORT_POPUP_CANCEL, exportRunId: value['exportRunId'] }
    : null;
}
