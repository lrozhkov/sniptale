import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import type { InjectedWebSnapshotSaveRequest } from '../../../features/web-snapshot/injected-runner-contract';
import { createBackgroundAutoStartContentActionIntentSource } from '../../platform/privileged-action-intent/client';
import { buildCurrentPageWebSnapshot } from './service';
import { stageWebSnapshotBlobForGallery } from './staged-transfer';
import type { WebSnapshotBuildResult } from './types';

export type ContentWebSnapshotSaveRequest = InjectedWebSnapshotSaveRequest;

export type ContentWebSnapshotSaveResponse = {
  assetId?: string;
  success: boolean;
  warnings: string[];
};

function createWebSnapshotStageError(stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${stage}: ${message}`);
}

function throwIfWebSnapshotSaveAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Web snapshot save was cancelled');
}

async function runWebSnapshotStage<T>(
  stage: string,
  work: () => Promise<T>,
  abortSignal?: AbortSignal | undefined
): Promise<T> {
  throwIfWebSnapshotSaveAborted(abortSignal);
  try {
    const result = await work();
    throwIfWebSnapshotSaveAborted(abortSignal);
    return result;
  } catch (error) {
    throwIfWebSnapshotSaveAborted(abortSignal);
    throw createWebSnapshotStageError(stage, error);
  }
}

function createLinkedWebSnapshotStageAbortController(externalSignal?: AbortSignal | undefined) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    forwardAbort();
  } else {
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  }
  return {
    controller,
    release: () => externalSignal?.removeEventListener('abort', forwardAbort),
  };
}

async function stageWebSnapshotPayloads(
  snapshot: WebSnapshotBuildResult,
  externalSignal?: AbortSignal | undefined
): Promise<[packageStagedBlobId: string, screenshotStagedBlobId: string]> {
  const linkedAbort = createLinkedWebSnapshotStageAbortController(externalSignal);
  const abortOnFailure = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      if (!linkedAbort.controller.signal.aborted) {
        linkedAbort.controller.abort(error);
      }
      throw error;
    }
  };
  const packageStage = abortOnFailure(
    runWebSnapshotStage(
      'stage web snapshot package',
      () =>
        stageWebSnapshotBlobForGallery({
          abortSignal: linkedAbort.controller.signal,
          blob: snapshot.packageBlob,
          blobKind: 'package',
          snapshotSessionId: snapshot.snapshotSessionId,
        }),
      linkedAbort.controller.signal
    )
  );
  const screenshotStage = abortOnFailure(
    runWebSnapshotStage(
      'stage web snapshot screenshot',
      () =>
        stageWebSnapshotBlobForGallery({
          abortSignal: linkedAbort.controller.signal,
          blob: snapshot.screenshotBlob,
          blobKind: 'screenshot',
          snapshotSessionId: snapshot.snapshotSessionId,
        }),
      linkedAbort.controller.signal
    )
  );
  const [packageResult, screenshotResult] = await Promise.allSettled([
    packageStage,
    screenshotStage,
  ]);
  linkedAbort.release();
  if (packageResult.status === 'rejected') throw packageResult.reason;
  if (screenshotResult.status === 'rejected') throw screenshotResult.reason;
  return [packageResult.value, screenshotResult.value];
}

async function saveStagedWebSnapshot(
  snapshot: WebSnapshotBuildResult,
  abortSignal?: AbortSignal | undefined
) {
  try {
    const [packageStagedBlobId, screenshotStagedBlobId] = await stageWebSnapshotPayloads(
      snapshot,
      abortSignal
    );
    throwIfWebSnapshotSaveAborted(abortSignal);
    return await runWebSnapshotStage(
      'save web snapshot to gallery',
      () =>
        getContentRuntimeServices().messaging.sendRuntimeMessage({
          manifest: snapshot.manifest,
          packageStagedBlobId,
          screenshotMimeType: snapshot.screenshotMimeType,
          screenshotStagedBlobId,
          snapshotSessionId: snapshot.snapshotSessionId,
          type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
        }),
      abortSignal
    );
  } catch (error) {
    try {
      const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
        snapshotSessionId: snapshot.snapshotSessionId,
        type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
      });
      if (response.success !== true) {
        throw new Error(response.error || 'Failed to release staged web snapshot payloads.', {
          cause: error,
        });
      }
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Web snapshot staging and rollback failed', {
        cause: cleanupError,
      });
    }
    throw error;
  }
}

export async function saveCurrentPageWebSnapshot(
  request: ContentWebSnapshotSaveRequest & { abortSignal?: AbortSignal | undefined }
): Promise<ContentWebSnapshotSaveResponse> {
  const contentIntentSource = request.contentIntentGrant
    ? createBackgroundAutoStartContentActionIntentSource(request.contentIntentGrant.grantToken)
    : undefined;
  const snapshot = await runWebSnapshotStage(
    'build web snapshot package',
    () =>
      buildCurrentPageWebSnapshot({
        ...request,
        ...(contentIntentSource === undefined ? {} : { contentIntentSource }),
        ...(request.fullPageCaptureAction === undefined
          ? {}
          : {
              fullPageCaptureIdentity: {
                action: request.fullPageCaptureAction,
                exportRunId: request.requestId,
              },
            }),
        ...(request.abortSignal === undefined ? {} : { abortSignal: request.abortSignal }),
      }),
    request.abortSignal
  );
  throwIfWebSnapshotSaveAborted(request.abortSignal);
  const response = await saveStagedWebSnapshot(snapshot, request.abortSignal);
  throwIfWebSnapshotSaveAborted(request.abortSignal);

  if (!response.success) {
    throw createWebSnapshotStageError(
      'save web snapshot to gallery',
      response.error || 'Failed to save web snapshot.'
    );
  }

  return {
    ...(response.assetId ? { assetId: response.assetId } : {}),
    success: true,
    warnings: snapshot.warnings,
  };
}
