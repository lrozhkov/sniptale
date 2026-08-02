import type { CaptureActionType } from '../../../contracts/settings';
import { executeDownload } from '../download/download-router/index';
import { openEditorWithImage } from '../editor/index';
import { createRenderedCaptureJob } from '../jobs/rendered-job';
import { transitionCaptureJob } from '../jobs/state-machine';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';

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
  dataUrl: string,
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  openEditorWithImage(dataUrl, { tabId: resolvedTabId })
    .then(() => sendResponse({ success: true, result: 'accepted' }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
