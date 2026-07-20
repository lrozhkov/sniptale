import type {
  AppRecordingChunkMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
} from '../../../contracts/native-app';
import {
  completeNativeTransferSession,
  deleteNativeTransferSession,
  getNativeTransferSession,
  putNativeTransferSession,
} from './persistence/staging';
import {
  saveRecordingSafely,
  saveRecordingTelemetrySafely,
} from '../../../workflows/media-hub/store';
import { openVideoEditorPage } from '../../../platform/navigation/extension-pages';
import {
  hasEnoughNativeStorageBudget,
  verifyNativeTransferChunks,
  stageNativeTransferChunk,
} from './chunks';
import type {
  NativeAppIngestionControllerDeps,
  NativeIngestionOutboundMessage,
} from './ingestion-types';
import type { NativeTransferSessionEntry } from './persistence/contracts';
import { isCurrentLease, sessionMatchesLease } from './lease';
import { recordingReject } from './responses';
import {
  createRecordingCompleteSession,
  createRecordingSession,
  createRecordingStartSession,
  getNextMissingChunkIndex,
} from './sessions';
import { mapNativeRecordingTelemetry } from './telemetry';
import { runNativeBestEffort, tryNativeCommitStep } from './commit-failures';

function createRecordingChunkRequest(
  message: AppRecordingChunkMessage | AppRecordingStoppedMessage,
  chunkIndex: number
): NativeIngestionOutboundMessage {
  return {
    chunkIndex,
    controllerLeaseId: message.controllerLeaseId,
    protocolVersion: message.protocolVersion,
    recordingId: message.recordingId,
    type: 'extension.recording.chunkRequest',
  };
}

async function loadUpdatedRecordingSession(
  message: AppRecordingChunkMessage,
  sessionId: string
): Promise<NativeTransferSessionEntry | NativeIngestionOutboundMessage[]> {
  const updatedSession = await getNativeTransferSession(sessionId);
  if (!updatedSession) {
    return [recordingReject(message, 'storage-failed')];
  }
  const nextMissingChunk = getNextMissingChunkIndex(updatedSession);
  return nextMissingChunk === null
    ? updatedSession
    : [createRecordingChunkRequest(message, nextMissingChunk)];
}

async function loadVerifiedRecordingBlob(session: NativeTransferSessionEntry) {
  const verified = await tryNativeCommitStep(() => verifyNativeTransferChunks(session));
  if (!verified.ok) {
    return { ok: false as const, reason: 'storage-failed' as const };
  }
  return verified.value.ok
    ? { blob: new Blob(verified.value.blobs, { type: session.mimeType }), ok: true as const }
    : { ok: false as const, reason: 'hash-mismatch' as const };
}

async function saveRecordingCommit(session: NativeTransferSessionEntry, blob: Blob) {
  const saved = await tryNativeCommitStep(() =>
    saveRecordingSafely(session.id, blob, session.filename)
  );
  if (!saved.ok) {
    return false;
  }
  const telemetry = mapNativeRecordingTelemetry({
    createdAt: session.createdAt,
    recordingId: session.id,
    sourceMode: session.metadata.sourceMode ?? 'screen',
    telemetry: session.metadata.telemetry ?? null,
    ...(session.metadata.timebase ? { timebase: session.metadata.timebase } : {}),
    updatedAt: Date.now(),
  });
  if (telemetry) {
    await runNativeBestEffort(() => saveRecordingTelemetrySafely(telemetry));
  }
  return true;
}

async function finishRecordingCommit(session: NativeTransferSessionEntry): Promise<boolean> {
  const markedComplete = await tryNativeCommitStep(async () => {
    await completeNativeTransferSession(createRecordingCompleteSession(session));
  });
  if (!markedComplete.ok) {
    return false;
  }
  if (session.metadata.openEditor) {
    await runNativeBestEffort(() => openVideoEditorPage(null, session.id));
  }
  return true;
}

export async function handleNativeRecordingStopped(
  deps: NativeAppIngestionControllerDeps,
  message: AppRecordingStoppedMessage
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, message.controllerLeaseId)) {
    return [recordingReject(message, 'stale-controller-lease')];
  }
  try {
    if (!(await hasEnoughNativeStorageBudget(message.totalBytes))) {
      return [recordingReject(message, 'quota-exceeded')];
    }
    const existing = await getNativeTransferSession(message.recordingId);
    if (existing && existing.controllerLeaseId !== message.controllerLeaseId) {
      await deleteNativeTransferSession(message.recordingId);
    } else if (existing?.kind === 'recording-complete') {
      return [recordingReject(message, 'duplicate-or-replay')];
    } else if (existing && existing.kind === 'recording') {
      const nextMissingChunk = getNextMissingChunkIndex(existing);
      return nextMissingChunk === null
        ? []
        : [createRecordingChunkRequest(message, nextMissingChunk)];
    }
    const started = existing && sessionMatchesLease(existing, message) ? existing : undefined;
    await putNativeTransferSession(createRecordingSession(message, started));
  } catch {
    return [recordingReject(message, 'storage-failed')];
  }
  return [
    {
      ...createRecordingChunkRequest(message, 0),
    },
  ];
}

export async function handleNativeRecordingStarted(
  deps: NativeAppIngestionControllerDeps,
  message: AppRecordingStartedMessage
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, message.controllerLeaseId)) {
    return [recordingReject(message, 'stale-controller-lease')];
  }
  try {
    const existing = await getNativeTransferSession(message.recordingId);
    if (
      (existing?.kind === 'recording' || existing?.kind === 'recording-complete') &&
      sessionMatchesLease(existing, message)
    ) {
      return [];
    }
    if (existing?.kind === 'recording-start' && sessionMatchesLease(existing, message)) {
      return [];
    }
    if (existing && !sessionMatchesLease(existing, message)) {
      return [recordingReject(message, 'stale-controller-lease')];
    }
    await putNativeTransferSession(createRecordingStartSession(message));
  } catch {
    return [recordingReject(message, 'storage-failed')];
  }
  return [];
}

export async function handleNativeRecordingChunk(
  deps: NativeAppIngestionControllerDeps,
  message: AppRecordingChunkMessage
): Promise<NativeIngestionOutboundMessage[]> {
  const session = await getNativeTransferSession(message.recordingId);
  if (session?.kind === 'recording-complete') {
    return [recordingReject(message, 'duplicate-or-replay')];
  }
  if (!session || session.kind !== 'recording') {
    return [recordingReject(message, 'malformed-message')];
  }
  if (!sessionMatchesLease(session, message) || !isCurrentLease(deps, message.controllerLeaseId)) {
    return [recordingReject(message, 'stale-controller-lease')];
  }
  const rejected = await stageNativeTransferChunk({ ...message, session });
  if (rejected) {
    await runNativeBestEffort(() => deleteNativeTransferSession(session.id));
    return [recordingReject(message, rejected)];
  }

  const updated = await loadUpdatedRecordingSession(message, session.id);
  if (Array.isArray(updated)) {
    return updated;
  }

  const verified = await loadVerifiedRecordingBlob(updated);
  if (!verified.ok) {
    if (verified.reason === 'hash-mismatch') {
      await runNativeBestEffort(() => deleteNativeTransferSession(updated.id));
    }
    return [recordingReject(message, verified.reason)];
  }
  if (!(await saveRecordingCommit(updated, verified.blob))) {
    return [recordingReject(message, 'storage-failed')];
  }
  if (!(await finishRecordingCommit(updated))) {
    return [recordingReject(message, 'storage-failed')];
  }

  return [
    {
      controllerLeaseId: message.controllerLeaseId,
      protocolVersion: message.protocolVersion,
      recordingId: message.recordingId,
      type: 'extension.recording.ack',
    },
  ];
}
