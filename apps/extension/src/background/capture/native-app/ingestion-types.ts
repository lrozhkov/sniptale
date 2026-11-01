import type { NativeHistoryOutboundMessage } from '../../../contracts/native-app/attachment-message-types';
import type {
  ExtensionRecordingAckMessage,
  ExtensionRecordingChunkRequestMessage,
  ExtensionRecordingRejectMessage,
  ExtensionScreenshotAckMessage,
  ExtensionScreenshotChunkRequestMessage,
  ExtensionScreenshotRejectMessage,
} from '../../../contracts/native-app';

export type NativeIngestionOutboundMessage =
  | NativeHistoryOutboundMessage
  | ExtensionScreenshotAckMessage
  | ExtensionScreenshotChunkRequestMessage
  | ExtensionScreenshotRejectMessage
  | ExtensionRecordingChunkRequestMessage
  | ExtensionRecordingAckMessage
  | ExtensionRecordingRejectMessage;

export interface NativeAppIngestionControllerDeps {
  isHistoryEnabled?: (kind: 'cursor' | 'events') => boolean;
  getCurrentControllerLeaseId?: () => string | null;
}
