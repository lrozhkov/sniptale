import type { CaptureActionType } from '../../../contracts/settings';
import { executeDownload } from '../download/download-router/index';
import { openEditorWithImage } from '../editor/index';
import { createRenderedCaptureJob } from '../jobs/rendered-job';
import { transitionCaptureJob } from '../jobs/state-machine';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import type { RecentCaptureEditorAssetCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { consumeRecentCaptureEditorAssetCapability } from '../editor/recent-asset-capability';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';

function isDownloadAction(actionType: CaptureActionType): boolean {
  return actionType !== 'copy' && actionType !== 'edit' && actionType !== 'scenario';
}

async function markRouteCaptureJobFailed(jobId: string | undefined, error: unknown): Promise<void> {
  if (!jobId) {
    return;
  }

  await transitionCaptureJob(jobId, 'failed', {
    error: error instanceof Error ? error.message : 'Capture download route failed',
  }).catch(() => undefined);
}

async function executeSaveWithCaptureJob(
  message: {
    dataUrl: string;
    filename: string;
    actionType: CaptureActionType;
    presetId?: string | null;
  },
  resolvedTabId: number
): Promise<void> {
  const jobId = await createRenderedCaptureJob(resolvedTabId);

  try {
    await executeDownload(
      message.dataUrl,
      message.filename,
      message.actionType,
      message.presetId,
      jobId
    );
    if (!isDownloadAction(message.actionType)) {
      await transitionCaptureJob(jobId, 'completed');
    }
  } catch (error) {
    await markRouteCaptureJobFailed(jobId, error);
    throw error;
  }
}

export function handleExecuteSave(
  message: {
    dataUrl: string;
    filename: string;
    actionType: CaptureActionType;
    presetId?: string | null;
  },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  executeSaveWithCaptureJob(message, resolvedTabId)
    .then(() => sendResponse({ success: true, result: 'accepted' }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleOpenEditorWithImage(
  message: {
    assetId?: string;
    dataUrl: string;
    editorAssetCapability?: RecentCaptureEditorAssetCapability;
  },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  const senderBinding = getPreauthorizedContentActionRouteMessage(message);
  if (
    message.assetId &&
    (!message.editorAssetCapability ||
      !senderBinding ||
      !consumeRecentCaptureEditorAssetCapability({
        assetId: message.assetId,
        capability: message.editorAssetCapability,
        senderBinding,
      }))
  ) {
    sendResponse(createRouteErrorResponse('Editor asset capability is invalid or expired'));
    return true;
  }
  openEditorWithImage(message.dataUrl, {
    ...(message.assetId ? { assetId: message.assetId } : {}),
    tabId: resolvedTabId,
  })
    .then(() => sendResponse({ success: true, result: 'accepted' }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
