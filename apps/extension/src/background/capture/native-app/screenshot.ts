import type {
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import {
  completeNativeTransferSession,
  deleteNativeTransferSession,
  getNativeTransferSession,
  putNativeTransferSession,
} from './persistence/staging';
import { saveScreenshotMediaAssetSafely } from '../../../workflows/media-hub/store';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import {
  loadOrderedNativeChunkBlobs,
  stageNativeTransferChunk,
  verifyNativeTransferBlob,
} from './chunks';
import type {
  NativeAppIngestionControllerDeps,
  NativeIngestionOutboundMessage,
} from './ingestion-types';
import type { NativeTransferSessionEntry } from './persistence/contracts';
import { isCurrentLease, sessionMatchesLease } from './lease';
import { screenshotReject } from './responses';
import {
  createScreenshotCompleteSession,
  createScreenshotSession,
  getNextMissingChunkIndex,
} from './sessions';
import { runNativeBestEffort, tryNativeCommitStep } from './commit-failures';
import {
  createScreenshotChunkRequest,
  loadScreenshotSessionForMessage,
  loadUpdatedScreenshotSession,
} from './screenshot-session-state';

async function loadVerifiedScreenshotBlob(session: NativeTransferSessionEntry) {
  const blobResult = await tryNativeCommitStep(async () => {
    const chunks = await loadOrderedNativeChunkBlobs(session);
    return new Blob(chunks, { type: session.mimeType });
  });
  if (!blobResult.ok) {
    return { ok: false as const, reason: 'storage-failed' as const };
  }
  const verified = await tryNativeCommitStep(() =>
    verifyNativeTransferBlob(session, blobResult.value)
  );
  if (!verified.ok) {
    return { ok: false as const, reason: 'storage-failed' as const };
  }
  return verified.value
    ? { blob: blobResult.value, ok: true as const }
    : { ok: false as const, reason: 'hash-mismatch' as const };
}

async function saveScreenshotCommit(session: NativeTransferSessionEntry, blob: Blob) {
  return tryNativeCommitStep(() =>
    saveScreenshotMediaAssetSafely({
      blob,
      filename: session.filename,
      id: session.id,
      tags: ['native-app'],
      ...(session.metadata.capturedAtEpochMs === undefined
        ? {}
        : { createdAt: session.metadata.capturedAtEpochMs }),
    })
  );
}

async function openScreenshotEditorIfNeeded(
  session: NativeTransferSessionEntry,
  assetId: string
): Promise<void> {
  if (!session.metadata.openEditor) {
    return;
  }
  await runNativeBestEffort(() =>
    browserTabs.create({
      url: buildEditorUrl({ assetId, sessionId: createEditorSessionId() }),
    })
  );
}

async function finishScreenshotCommit(session: NativeTransferSessionEntry): Promise<boolean> {
  const markedComplete = await tryNativeCommitStep(async () => {
    await completeNativeTransferSession(createScreenshotCompleteSession(session));
  });
  return markedComplete.ok;
}

export async function handleNativeScreenshotStart(
  deps: NativeAppIngestionControllerDeps,
  message: AppScreenshotStartMessage
): Promise<NativeIngestionOutboundMessage[]> {
  if (!isCurrentLease(deps, message.controllerLeaseId)) {
    return [screenshotReject(message, 'stale-controller-lease')];
  }
  try {
    const existing = await getNativeTransferSession(message.captureId);
    if (existing?.kind === 'screenshot-complete' && sessionMatchesLease(existing, message)) {
      return [screenshotReject(message, 'duplicate-or-replay')];
    }
    if (existing?.kind === 'screenshot' && sessionMatchesLease(existing, message)) {
      const nextMissingChunk = getNextMissingChunkIndex(existing);
      return nextMissingChunk === null
        ? []
        : [createScreenshotChunkRequest(message, nextMissingChunk)];
    }
    if (existing) {
      await deleteNativeTransferSession(message.captureId);
    }
    await putNativeTransferSession(createScreenshotSession(message));
  } catch {
    return [screenshotReject(message, 'storage-failed')];
  }
  return [createScreenshotChunkRequest(message, 0)];
}

export async function handleNativeScreenshotChunk(
  deps: NativeAppIngestionControllerDeps,
  message: AppScreenshotChunkMessage
): Promise<NativeIngestionOutboundMessage[]> {
  const loaded = await loadScreenshotSessionForMessage(message);
  if (Array.isArray(loaded)) {
    return loaded;
  }
  const session = loaded;
  if (!sessionMatchesLease(session, message) || !isCurrentLease(deps, message.controllerLeaseId)) {
    return [screenshotReject(message, 'stale-controller-lease')];
  }
  const rejected = await stageNativeTransferChunk({ ...message, session });
  if (rejected) {
    await runNativeBestEffort(() => deleteNativeTransferSession(session.id));
    return [screenshotReject(message, rejected)];
  }
  const updated = await loadUpdatedScreenshotSession(message, session.id);
  if (Array.isArray(updated)) {
    return updated;
  }
  return [];
}

export async function handleNativeScreenshotCommit(
  deps: NativeAppIngestionControllerDeps,
  message: AppScreenshotCommitMessage
): Promise<NativeIngestionOutboundMessage[]> {
  const loaded = await loadScreenshotSessionForMessage(message);
  if (Array.isArray(loaded)) {
    return loaded;
  }
  const session = loaded;
  if (!sessionMatchesLease(session, message) || !isCurrentLease(deps, message.controllerLeaseId)) {
    return [screenshotReject(message, 'stale-controller-lease')];
  }
  if (getNextMissingChunkIndex(session) !== null) {
    return [screenshotReject(message, 'malformed-message')];
  }

  const verified = await loadVerifiedScreenshotBlob(session);
  if (!verified.ok) {
    if (verified.reason === 'hash-mismatch') {
      await runNativeBestEffort(() => deleteNativeTransferSession(session.id));
    }
    return [screenshotReject(message, verified.reason)];
  }

  const saved = await saveScreenshotCommit(session, verified.blob);
  if (!saved.ok) {
    return [screenshotReject(message, 'storage-failed')];
  }
  const entry = saved.value;
  if (!(await finishScreenshotCommit(session))) {
    return [screenshotReject(message, 'storage-failed')];
  }
  await openScreenshotEditorIfNeeded(session, entry.id);

  return [
    {
      assetId: entry.id,
      captureId: message.captureId,
      controllerLeaseId: message.controllerLeaseId,
      protocolVersion: message.protocolVersion,
      type: 'extension.screenshot.ack',
    },
  ];
}
