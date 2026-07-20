import type { CaptureActionType } from '../../../contracts/settings';
import { executeDownload } from '../download/download-router/index';
import { openEditorWithImage } from '../editor/index';
import { createRenderedCaptureJob } from '../jobs/rendered-job';
import { transitionCaptureJob } from '../jobs/state-machine';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import { saveRecordingBlobForDownload } from '../../media-hub/recording-download';
import {
  consumeRecordingDownload,
  releaseRecordingDownload,
  stageRecordingDownloadChunk,
} from './recording-download/staged-recordings';
import {
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import { isRecordingDownloadStageId } from '@sniptale/runtime-contracts/messaging/recording-download';
import type { ContentSenderBinding } from './authorization/content-action';
import type { SendResponse } from './types';

function isValidStagedRecordingDownloadPayload(payload: {
  filename: string;
  mimeType: string;
  recordingSessionId: string;
  stagedRecordingId: string;
}): boolean {
  return (
    isSafeDownloadFilename(payload.filename) &&
    isSafeDownloadMimeType(payload.mimeType) &&
    isRecordingDownloadStageId(payload.recordingSessionId) &&
    isRecordingDownloadStageId(payload.stagedRecordingId)
  );
}

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

export function handleSaveRecordingForDownload(
  payload: {
    filename: string;
    mimeType: string;
    recordingSessionId: string;
    stagedRecordingId: string;
  },
  owner: ContentSenderBinding,
  sendResponse: SendResponse
): boolean {
  if (!isValidStagedRecordingDownloadPayload(payload)) {
    sendResponse(createRouteErrorResponse('Invalid recording download payload'));
    return true;
  }

  Promise.resolve()
    .then(() => {
      const blob = consumeRecordingDownload({
        mimeType: payload.mimeType,
        owner,
        recordingSessionId: payload.recordingSessionId,
        stagedRecordingId: payload.stagedRecordingId,
      });
      return saveRecordingBlobForDownload({
        blob,
        filename: payload.filename,
        mimeType: payload.mimeType,
      });
    })
    .then((result) => sendResponse({ success: true, result: 'accepted', ...result }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleStageRecordingDownloadChunk(
  payload: {
    base64: string;
    chunkIndex: number;
    recordingSessionId: string;
    stagedRecordingId: string;
    totalBytes: number;
    totalChunks: number;
  },
  owner: ContentSenderBinding,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() => stageRecordingDownloadChunk({ ...payload, owner }))
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleReleaseRecordingDownload(
  payload: {
    recordingSessionId: string;
    stagedRecordingId: string;
  },
  owner: ContentSenderBinding,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() => releaseRecordingDownload({ ...payload, owner }))
    .then(() => sendResponse({ success: true, result: 'released' }))
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
