import type {
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import { createNativeTransferExpiry } from './persistence/staging';
import type { NativeTransferSessionEntry } from './persistence/contracts';

export function createScreenshotSession(
  message: AppScreenshotStartMessage
): NativeTransferSessionEntry {
  const now = Date.now();
  return {
    chunkCount: message.chunkCount,
    controllerLeaseId: message.controllerLeaseId,
    createdAt: now,
    expiresAt: createNativeTransferExpiry(now),
    filename: message.filename,
    id: message.captureId,
    kind: 'screenshot',
    metadata: {
      capturedAtEpochMs: message.capturedAtEpochMs,
      height: message.height,
      openEditor: message.openEditor,
      width: message.width,
    },
    mimeType: message.mimeType,
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: message.sha256,
    totalBytes: message.totalBytes,
    updatedAt: now,
  };
}

export function createScreenshotCompleteSession(
  session: NativeTransferSessionEntry
): NativeTransferSessionEntry {
  const now = Date.now();
  return {
    chunkCount: 0,
    controllerLeaseId: session.controllerLeaseId,
    createdAt: session.createdAt,
    expiresAt: createNativeTransferExpiry(now),
    filename: session.filename,
    id: session.id,
    kind: 'screenshot-complete',
    metadata: session.metadata,
    mimeType: session.mimeType,
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: session.sha256,
    totalBytes: 0,
    updatedAt: now,
  };
}

export function createRecordingSession(
  message: AppRecordingStoppedMessage,
  started?: NativeTransferSessionEntry
): NativeTransferSessionEntry {
  const now = Date.now();
  return {
    chunkCount: message.chunkCount,
    controllerLeaseId: message.controllerLeaseId,
    createdAt: now,
    expiresAt: createNativeTransferExpiry(now),
    filename: message.filename,
    id: message.recordingId,
    kind: 'recording',
    metadata: {
      durationMs: message.durationMs,
      fps: message.fps,
      height: message.height,
      openEditor: message.openEditor,
      ...(started?.metadata.settingsRevision
        ? { settingsRevision: started.metadata.settingsRevision }
        : {}),
      sourceMode: started?.metadata.sourceMode ?? 'screen',
      telemetry: message.telemetry,
      ...(started?.metadata.timebase ? { timebase: started.metadata.timebase } : {}),
      width: message.width,
    },
    mimeType: message.mimeType,
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: message.sha256,
    totalBytes: message.totalBytes,
    updatedAt: now,
  };
}

export function createRecordingStartSession(
  message: AppRecordingStartedMessage
): NativeTransferSessionEntry {
  const now = Date.now();
  return {
    chunkCount: 0,
    controllerLeaseId: message.controllerLeaseId,
    createdAt: now,
    expiresAt: createNativeTransferExpiry(now),
    filename: '',
    id: message.recordingId,
    kind: 'recording-start',
    metadata: {
      height: 0,
      openEditor: false,
      settingsRevision: message.requestedSettingsRevision,
      sourceMode: message.source.mode,
      timebase: message.timebase,
      width: 0,
    },
    mimeType: 'video/mp4',
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: '0'.repeat(64),
    totalBytes: 0,
    updatedAt: now,
  };
}

export function createRecordingCompleteSession(
  session: NativeTransferSessionEntry
): NativeTransferSessionEntry {
  const now = Date.now();
  return {
    chunkCount: 0,
    controllerLeaseId: session.controllerLeaseId,
    createdAt: session.createdAt,
    expiresAt: createNativeTransferExpiry(now),
    filename: session.filename,
    id: session.id,
    kind: 'recording-complete',
    metadata: session.metadata,
    mimeType: session.mimeType,
    receivedBytes: 0,
    receivedChunkIndexes: [],
    sha256: session.sha256,
    totalBytes: 0,
    updatedAt: now,
  };
}

export function getNextMissingChunkIndex(session: NativeTransferSessionEntry): number | null {
  const received = new Set(session.receivedChunkIndexes);
  for (let index = 0; index < session.chunkCount; index += 1) {
    if (!received.has(index)) {
      return index;
    }
  }
  return null;
}
