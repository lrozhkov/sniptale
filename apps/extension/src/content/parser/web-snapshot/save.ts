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

async function runWebSnapshotStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw createWebSnapshotStageError(stage, error);
  }
}

async function saveStagedWebSnapshot(snapshot: WebSnapshotBuildResult) {
  const [packageStagedBlobId, screenshotStagedBlobId] = await Promise.all([
    runWebSnapshotStage('stage web snapshot package', () =>
      stageWebSnapshotBlobForGallery({
        blob: snapshot.packageBlob,
        blobKind: 'package',
        snapshotSessionId: snapshot.snapshotSessionId,
      })
    ),
    runWebSnapshotStage('stage web snapshot screenshot', () =>
      stageWebSnapshotBlobForGallery({
        blob: snapshot.screenshotBlob,
        blobKind: 'screenshot',
        snapshotSessionId: snapshot.snapshotSessionId,
      })
    ),
  ]);
  return runWebSnapshotStage('save web snapshot to gallery', () =>
    getContentRuntimeServices().messaging.sendRuntimeMessage({
      manifest: snapshot.manifest,
      packageStagedBlobId,
      screenshotMimeType: snapshot.screenshotMimeType,
      screenshotStagedBlobId,
      snapshotSessionId: snapshot.snapshotSessionId,
      type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
    })
  );
}

export async function saveCurrentPageWebSnapshot(
  request: ContentWebSnapshotSaveRequest
): Promise<ContentWebSnapshotSaveResponse> {
  const contentIntentSource = request.contentIntentGrant
    ? createBackgroundAutoStartContentActionIntentSource(request.contentIntentGrant.grantToken)
    : undefined;
  const snapshot = await runWebSnapshotStage('build web snapshot package', () =>
    buildCurrentPageWebSnapshot({
      ...request,
      ...(contentIntentSource === undefined ? {} : { contentIntentSource }),
    })
  );
  const response = await saveStagedWebSnapshot(snapshot);

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
