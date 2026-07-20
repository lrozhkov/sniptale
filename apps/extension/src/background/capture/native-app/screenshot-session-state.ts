import type {
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
} from '../../../contracts/native-app';
import { deleteNativeTransferSession, getNativeTransferSession } from './persistence/staging';
import type { NativeTransferSessionEntry } from './persistence/contracts';
import type { NativeIngestionOutboundMessage } from './ingestion-types';
import { screenshotReject } from './responses';
import { getNextMissingChunkIndex } from './sessions';
import { runNativeBestEffort } from './commit-failures';

interface ScreenshotChunkRequestSource {
  captureId: string;
  controllerLeaseId: string;
  protocolVersion: number;
}

export function createScreenshotChunkRequest(
  message: AppScreenshotChunkMessage | ScreenshotChunkRequestSource,
  chunkIndex: number
): NativeIngestionOutboundMessage {
  return {
    captureId: message.captureId,
    chunkIndex,
    controllerLeaseId: message.controllerLeaseId,
    protocolVersion: message.protocolVersion,
    type: 'extension.screenshot.chunkRequest',
  };
}

export async function loadScreenshotSessionForMessage(
  message: AppScreenshotChunkMessage | AppScreenshotCommitMessage
): Promise<NativeTransferSessionEntry | NativeIngestionOutboundMessage[]> {
  try {
    const session = await getNativeTransferSession(message.captureId);
    if (!session || session.kind !== 'screenshot') {
      return [screenshotReject(message, 'malformed-message')];
    }
    return session;
  } catch {
    await runNativeBestEffort(() => deleteNativeTransferSession(message.captureId));
    return [screenshotReject(message, 'storage-failed')];
  }
}

export async function loadUpdatedScreenshotSession(
  message: AppScreenshotChunkMessage,
  sessionId: string
): Promise<NativeTransferSessionEntry | NativeIngestionOutboundMessage[]> {
  let updatedSession: NativeTransferSessionEntry | undefined;
  try {
    updatedSession = await getNativeTransferSession(sessionId);
  } catch {
    await runNativeBestEffort(() => deleteNativeTransferSession(sessionId));
    return [screenshotReject(message, 'storage-failed')];
  }
  if (!updatedSession) {
    await runNativeBestEffort(() => deleteNativeTransferSession(sessionId));
    return [screenshotReject(message, 'storage-failed')];
  }
  const nextMissingChunk = getNextMissingChunkIndex(updatedSession);
  return nextMissingChunk === null
    ? updatedSession
    : [createScreenshotChunkRequest(message, nextMissingChunk)];
}
