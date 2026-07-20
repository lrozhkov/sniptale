import type {
  AppControllerLeaseMessage,
  AppHelloMessage,
  AppPongMessage,
  AppSettingsAcceptedMessage,
  ExtensionControllerAcquireMessage,
  ExtensionHelloMessage,
  ExtensionPingMessage,
  ExtensionSettingsSyncMessage,
} from '@sniptale/runtime-contracts/native-app/handshake-message-types';
import type {
  AppCommandAcceptedMessage,
  AppOpenSettingsRequestedMessage,
  AppOperationFailedMessage,
  AppTrayActionRequestedMessage,
  ExtensionRecordingControlCommandMessage,
  ExtensionRecordingStartCommandMessage,
  ExtensionScreenshotCaptureCommandMessage,
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

export type * from './control-message-types';
export type * from '@sniptale/runtime-contracts/native-app/handshake-message-types';
export type * from './transfer-message-types';

export type NativeAppInboundMessage =
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
  | ExtensionHelloMessage
  | ExtensionControllerAcquireMessage
  | ExtensionSettingsSyncMessage
  | ExtensionPingMessage
  | ExtensionTrayActionResultMessage
  | ExtensionScreenshotCaptureCommandMessage
  | ExtensionRecordingStartCommandMessage
  | ExtensionRecordingControlCommandMessage
  | ExtensionScreenshotAckMessage
  | ExtensionScreenshotChunkRequestMessage
  | ExtensionScreenshotRejectMessage
  | ExtensionRecordingChunkRequestMessage
  | ExtensionRecordingAckMessage
  | ExtensionRecordingRejectMessage;
