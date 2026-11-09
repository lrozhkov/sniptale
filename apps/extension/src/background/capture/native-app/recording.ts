import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
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
import { getRecording } from '../../../composition/persistence/recordings/index';
import {
  initDB,
  ASSET_OWNERS_STORE,
  STORE_NAME,
} from '../../../composition/persistence/infrastructure/indexed-db/core';
import { parseAssetOwner } from '../../../composition/persistence/assets/guards';
import { calculateSha256Hex } from './hash';

function createRecordingChunkRequest(
  message: Pick<
    AppRecordingStoppedMessage,
    'protocolVersion' | 'controllerLeaseId' | 'recordingId'
  >,
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
  const saved = await tryNativeCommitStep(async () => {
    const existing = await getRecording(session.id);
    if (!existing) {
      const db = await initDB();
      if ((await db.get(STORE_NAME, session.id)) !== undefined)
        throw new Error('Existing Native recording is unavailable.');
      await saveRecordingSafely(session.id, blob, session.filename);
      return;
    }
    const db = await initDB();
    const owner = parseAssetOwner(
      await db.get(ASSET_OWNERS_STORE, ['recording', session.id, 'body'])
    );
    if (
      !owner ||
      owner.ownerKind !== 'recording' ||
      owner.ownerId !== session.id ||
      owner.role !== 'body' ||
      owner.assetId !== existing.assetId ||
      existing.size !== session.totalBytes ||
      existing.mimeType !== session.mimeType ||
      (await calculateSha256Hex(existing.file)) !== session.sha256
    )
      throw new Error('Existing Native recording does not match the retained transfer.');
  });
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

async function commitRetainedRecording(
  deps: NativeAppIngestionControllerDeps,
  session: NativeTransferSessionEntry
): Promise<NativeIngestionOutboundMessage[]> {
  const message = {
    protocolVersion: 2 as const,
    controllerLeaseId: session.controllerLeaseId,
    recordingId: session.id,
  };
  if (!isCurrentLease(deps, session.controllerLeaseId)) return [];
  const verified = await loadVerifiedRecordingBlob(session);
  if (!verified.ok) {
    if (verified.reason === 'hash-mismatch')
      await runNativeBestEffort(() => deleteNativeTransferSession(session.id));
    return [recordingReject(message, verified.reason)];
  }
  if (!isCurrentLease(deps, session.controllerLeaseId)) return [];
  if (!(await saveRecordingCommit(session, verified.blob)))
    return [recordingReject(message, 'storage-failed')];
  if (!isCurrentLease(deps, session.controllerLeaseId)) return [];
  const current = await getNativeTransferSession(session.id);
  if (
    !current ||
    current.kind !== 'recording' ||
    current.controllerLeaseId !== session.controllerLeaseId ||
    current.sha256 !== session.sha256 ||
    current.updatedAt !== session.updatedAt
  )
    return [];
  if (!(await finishRecordingCommit(session, deps)))
    return [recordingReject(message, 'storage-failed')];
  return recoverNativeVideoReceipt(deps, message);
}

/** Resume a retained transfer under the caller's per-recording queue and current lease. */
export async function resumeNativeRecordingTransfer(
  deps: NativeAppIngestionControllerDeps,
  recordingId: string,
  controllerLeaseId: string
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, controllerLeaseId)) return [];
  const session = await getNativeTransferSession(recordingId);
  if (!session || session.controllerLeaseId !== controllerLeaseId) return [];
  const message = { protocolVersion: 2 as const, controllerLeaseId, recordingId };
  if (session.kind === 'recording-complete') return recoverNativeVideoReceipt(deps, message);
  if (session.kind !== 'recording') return [];
  const missing = getNextMissingChunkIndex(session);
  return missing === null
    ? commitRetainedRecording(deps, session)
    : [createRecordingChunkRequest(message, missing)];
}

async function finishRecordingCommit(
  session: NativeTransferSessionEntry,
  deps: NativeAppIngestionControllerDeps
): Promise<boolean> {
  const markedComplete = await tryNativeCommitStep(async () => {
    await completeNativeTransferSession(createRecordingCompleteSession(session));
  });
  if (!markedComplete.ok) {
    return false;
  }
  if (
    session.metadata.openEditor &&
    !(
      (deps.isHistoryEnabled?.('cursor') && session.metadata.cursorTrajectory) ||
      (deps.isHistoryEnabled?.('events') && session.metadata.recordingEvents)
    )
  ) {
    await runNativeBestEffort(() => openVideoEditorPage(null, session.id));
  }
  return true;
}

/** A completed transfer can lose its wire ACK after the durable commit. */
export async function recoverNativeVideoReceipt(
  deps: NativeAppIngestionControllerDeps,
  message: Pick<
    AppRecordingStoppedMessage,
    'controllerLeaseId' | 'protocolVersion' | 'recordingId'
  > &
    Partial<Pick<AppRecordingStoppedMessage, 'sha256' | 'totalBytes' | 'width' | 'height'>>
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, message.controllerLeaseId)) return [];
  try {
    const parent = await getNativeTransferSession(message.recordingId);
    if (
      parent?.kind !== 'recording-complete' ||
      (message.sha256 !== undefined && message.sha256 !== parent.sha256) ||
      (message.width !== undefined && message.width !== parent.metadata.width) ||
      (message.height !== undefined && message.height !== parent.metadata.height)
    )
      return [];
    const receipt = await createNativeRecordingHistoryStore().videoReceipt(message.recordingId);
    if (
      !isCurrentLease(deps, message.controllerLeaseId) ||
      receipt.sha256 !== parent.sha256 ||
      (parent.totalBytes !== 0 && receipt.totalBytes !== parent.totalBytes) ||
      (message.totalBytes !== undefined && message.totalBytes !== receipt.totalBytes)
    )
      return [];
    return [
      {
        type: 'extension.recording.ack',
        protocolVersion: 2,
        controllerLeaseId: message.controllerLeaseId,
        recordingId: message.recordingId,
        receipt,
      },
    ];
  } catch {
    return [];
  }
}

export async function handleNativeRecordingStopped(
  deps: NativeAppIngestionControllerDeps,
  message: AppRecordingStoppedMessage
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, message.controllerLeaseId)) {
    return [recordingReject(message, 'stale-controller-lease')];
  }
  try {
    const existing = await getNativeTransferSession(message.recordingId);
    if (existing?.kind === 'recording-complete') {
      return recoverNativeVideoReceipt(deps, message);
    }
    if (!(await hasEnoughNativeStorageBudget(message.totalBytes))) {
      return [recordingReject(message, 'quota-exceeded')];
    }
    if (existing && existing.controllerLeaseId !== message.controllerLeaseId) {
      if (existing.metadata.history !== undefined)
        return [recordingReject(message, 'stale-controller-lease')];
      await deleteNativeTransferSession(message.recordingId);
    } else if (existing && existing.kind === 'recording') {
      if (
        existing.sha256 !== message.sha256 ||
        existing.totalBytes !== message.totalBytes ||
        existing.chunkCount !== message.chunkCount ||
        existing.metadata.width !== message.width ||
        existing.metadata.height !== message.height
      )
        return [recordingReject(message, 'duplicate-or-replay')];
      const nextMissingChunk = getNextMissingChunkIndex(existing);
      return nextMissingChunk === null
        ? commitRetainedRecording(deps, existing)
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
    return recoverNativeVideoReceipt(deps, message);
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

  return commitRetainedRecording(deps, updated);
}
