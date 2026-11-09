import type {
  NativeHistoryInboundMessage,
  NativeHistoryOutboundMessage,
} from './attachment-message-types';
import type {
  AppConnectionClosedMessage,
  AppControllerLeaseMessage,
  AppHelloMessage,
  AppPongMessage,
  AppSettingsAcceptedMessage,
  ExtensionControllerAcquireMessage,
  ExtensionHelloMessage,
  ExtensionPingMessage,
} from '@sniptale/runtime-contracts/native-app/handshake-message-types';
import type {
  AppCommandAcceptedMessage,
  AppOpenSettingsRequestedMessage,
  AppOperationFailedMessage,
  AppTrayActionRequestedMessage,
  ExtensionTrayActionResultMessage,
} from './control-message-types';
import type {
  AppRecordingChunkMessage,
  AppRecordingProgressMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
  ExtensionRecordingAckMessage,
  ExtensionRecordingChunkRequestMessage,
  ExtensionRecordingRejectMessage,
  ExtensionScreenshotAckMessage,
  ExtensionScreenshotChunkRequestMessage,
  ExtensionScreenshotRejectMessage,
} from './transfer-message-types';

export type * from './attachment-message-types';
export type * from './control-message-types';
export type * from '@sniptale/runtime-contracts/native-app/handshake-message-types';
export type * from './transfer-message-types';

export type NativeAppInboundMessage =
  | NativeHistoryInboundMessage
  | AppConnectionClosedMessage
  | AppHelloMessage
  | AppControllerLeaseMessage
  | AppSettingsAcceptedMessage
  | AppPongMessage
  | AppTrayActionRequestedMessage
  | AppOpenSettingsRequestedMessage
  | AppCommandAcceptedMessage
  | AppScreenshotStartMessage
  | AppScreenshotChunkMessage
  | AppScreenshotCommitMessage
  | AppRecordingStartedMessage
  | AppRecordingProgressMessage
  | AppRecordingStoppedMessage
  | AppRecordingChunkMessage
  | AppOperationFailedMessage;

export type NativeAppOutboundMessage =
  | NativeHistoryOutboundMessage
  | ExtensionHelloMessage
  | ExtensionControllerAcquireMessage
  | ExtensionPingMessage
  | ExtensionTrayActionResultMessage
  | ExtensionScreenshotAckMessage
  | ExtensionScreenshotChunkRequestMessage
  | ExtensionScreenshotRejectMessage
  | ExtensionRecordingChunkRequestMessage
  | ExtensionRecordingAckMessage
  | ExtensionRecordingRejectMessage;
