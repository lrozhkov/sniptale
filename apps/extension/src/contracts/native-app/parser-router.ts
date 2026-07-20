// policyStateIds: [] - native parser routing uses static message type tables only.
import { fail, ok, type ParseResult } from './parser-shared';
import { isAppHello } from './parser-platform';
import { isControllerLease, isPong, isSettingsAccepted } from './parser-status';
import { isCommandAccepted, isOpenSettingsRequest, isTrayActionRequest } from './parser-control';
import {
  isOperationFailed,
  isRecordingChunk,
  isRecordingProgress,
  isRecordingStarted,
  isRecordingStopped,
  isScreenshotChunk,
  isScreenshotCommit,
  isScreenshotStart,
} from './parser-media';
import type {
  AppCommandAcceptedMessage,
  AppControllerLeaseMessage,
  AppHelloMessage,
  AppOpenSettingsRequestedMessage,
  AppOperationFailedMessage,
  AppPongMessage,
  AppRecordingChunkMessage,
  AppRecordingProgressMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
  AppSettingsAcceptedMessage,
  AppTrayActionRequestedMessage,
  NativeAppInboundMessage,
} from './types';

const statusMessageTypes = new Set([
  'app.hello',
  'app.controller.lease',
  'app.settings.accepted',
  'app.pong',
]);
const controlMessageTypes = new Set([
  'app.tray.actionRequested',
  'app.openSettings.requested',
  'app.command.accepted',
]);

function validateStatusMessageByType(
  value: Record<string, unknown>
): ParseResult<NativeAppInboundMessage> {
  switch (value['type']) {
    case 'app.hello':
      return isAppHello(value)
        ? ok(value as unknown as AppHelloMessage)
        : fail('malformed-message', 'Invalid app.hello');
    case 'app.controller.lease':
      return isControllerLease(value)
        ? ok(value as unknown as AppControllerLeaseMessage)
        : fail('malformed-message', 'Invalid app.controller.lease');
    case 'app.settings.accepted':
      return isSettingsAccepted(value)
        ? ok(value as unknown as AppSettingsAcceptedMessage)
        : fail('malformed-message', 'Invalid app.settings.accepted');
    case 'app.pong':
      return isPong(value)
        ? ok(value as unknown as AppPongMessage)
        : fail('malformed-message', 'Invalid app.pong');
    default:
      return fail('malformed-message', 'Unknown native app message type');
  }
}

function validateControlMessageByType(
  value: Record<string, unknown>
): ParseResult<NativeAppInboundMessage> {
  switch (value['type']) {
    case 'app.tray.actionRequested':
      return isTrayActionRequest(value)
        ? ok(value as unknown as AppTrayActionRequestedMessage)
        : fail('malformed-message', 'Invalid app.tray.actionRequested');
    case 'app.openSettings.requested':
      return isOpenSettingsRequest(value)
        ? ok(value as unknown as AppOpenSettingsRequestedMessage)
        : fail('malformed-message', 'Invalid app.openSettings.requested');
    case 'app.command.accepted':
      return isCommandAccepted(value)
        ? ok(value as unknown as AppCommandAcceptedMessage)
        : fail('malformed-message', 'Invalid app.command.accepted');
    default:
      return fail('malformed-message', 'Unknown native app message type');
  }
}

function validateTransferMessageByType(
  value: Record<string, unknown>
): ParseResult<NativeAppInboundMessage> {
  switch (value['type']) {
    case 'app.screenshot.start':
      return isScreenshotStart(value)
        ? ok(value as unknown as AppScreenshotStartMessage)
        : fail('malformed-message', 'Invalid app.screenshot.start');
    case 'app.screenshot.chunk':
      return isScreenshotChunk(value)
        ? ok(value as unknown as AppScreenshotChunkMessage)
        : fail('malformed-message', 'Invalid app.screenshot.chunk');
    case 'app.screenshot.commit':
      return isScreenshotCommit(value)
        ? ok(value as unknown as AppScreenshotCommitMessage)
        : fail('malformed-message', 'Invalid app.screenshot.commit');
    case 'app.recording.started':
      return isRecordingStarted(value)
        ? ok(value as unknown as AppRecordingStartedMessage)
        : fail('malformed-message', 'Invalid app.recording.started');
    case 'app.recording.progress':
      return isRecordingProgress(value)
        ? ok(value as unknown as AppRecordingProgressMessage)
        : fail('malformed-message', 'Invalid app.recording.progress');
    case 'app.recording.stopped':
      return isRecordingStopped(value)
        ? ok(value as unknown as AppRecordingStoppedMessage)
        : fail('malformed-message', 'Invalid app.recording.stopped');
    case 'app.recording.chunk':
      return isRecordingChunk(value)
        ? ok(value as unknown as AppRecordingChunkMessage)
        : fail('malformed-message', 'Invalid app.recording.chunk');
    case 'app.operation.failed':
      return isOperationFailed(value)
        ? ok(value as unknown as AppOperationFailedMessage)
        : fail('malformed-message', 'Invalid app.operation.failed');
    default:
      return fail('malformed-message', 'Unknown native app message type');
  }
}

export function validateMessageByType(
  value: Record<string, unknown>
): ParseResult<NativeAppInboundMessage> {
  const type = value['type'];
  if (statusMessageTypes.has(type as string)) {
    return validateStatusMessageByType(value);
  }
  if (controlMessageTypes.has(type as string)) {
    return validateControlMessageByType(value);
  }
  return validateTransferMessageByType(value);
}
