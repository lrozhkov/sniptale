import type {
  ExtensionRecordingAckMessage,
  ExtensionRecordingChunkRequestMessage,
  ExtensionRecordingRejectMessage,
  ExtensionScreenshotAckMessage,
  ExtensionScreenshotChunkRequestMessage,
  ExtensionScreenshotRejectMessage,
} from '../../../contracts/native-app';

export type NativeIngestionOutboundMessage =
  | ExtensionScreenshotAckMessage
  | ExtensionScreenshotChunkRequestMessage
  | ExtensionScreenshotRejectMessage
  | ExtensionRecordingChunkRequestMessage
  | ExtensionRecordingAckMessage
  | ExtensionRecordingRejectMessage;

export interface NativeAppIngestionControllerDeps {
  getCurrentControllerLeaseId?: () => string | null;
}
