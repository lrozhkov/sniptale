import type { CaptureActionType } from '../../../contracts/settings';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import { executeDownload } from '../download/download-router/index';
import { openEditorWithImage } from '../editor/index';
import { transitionCaptureJob } from '../jobs/state-machine';
import { readCaptureDeliveryPayload, type CaptureDeliveryPayload } from '../application/payload';

async function markCaptureJobTerminal(
  jobId: string | undefined,
  state: 'completed' | 'failed',
  error?: unknown
): Promise<void> {
  if (!jobId) return;

  await transitionCaptureJob(jobId, state, {
    ...(state === 'failed'
      ? { error: error instanceof Error ? error.message : 'Capture delivery failed' }
      : {}),
  });
}

export function respondWithCaptureAction(
  capturePromise: Promise<CaptureDeliveryPayload>,
  context: {
    resolvedTabId: number;
    sendResponse: (response?: unknown) => void;
    captureAction: string;
    filename: string;
    defaultImagePresetId?: string | null | undefined;
  }
): Promise<void> {
  const state = { jobId: undefined as string | undefined };
  const fail = async (error: unknown): Promise<void> => {
    await markCaptureJobTerminal(state.jobId, 'failed', error).catch(() => undefined);
    context.sendResponse(createRouteErrorResponse(error));
  };

  if (context.captureAction === 'edit') {
    return respondWithEditor(capturePromise, context, state).catch(fail);
  }
  if (context.captureAction === 'copy' || context.captureAction === 'ask_preset') {
    return respondWithInlineData(capturePromise, context, state).catch(fail);
  }
  if (context.captureAction === 'scenario') {
    return respondWithCompletedCapture(capturePromise, context, state, 'scenario').catch(fail);
  }
  if (context.captureAction === 'save_to_library') {
    return respondWithCompletedCapture(capturePromise, context, state, 'save_to_library').catch(
      fail
    );
  }
  return respondWithDownload(capturePromise, context, state).catch(fail);
}

async function respondWithCompletedCapture(
  capturePromise: Promise<CaptureDeliveryPayload>,
  context: { sendResponse: (response?: unknown) => void },
  state: { jobId?: string | undefined },
  action: 'save_to_library' | 'scenario'
): Promise<void> {
  state.jobId = readCaptureDeliveryPayload(await capturePromise).jobId;
  await markCaptureJobTerminal(state.jobId, 'completed');
  context.sendResponse({ success: true, action });
}

async function respondWithEditor(
  capturePromise: Promise<CaptureDeliveryPayload>,
  context: { resolvedTabId: number; sendResponse: (response?: unknown) => void },
  state: { jobId?: string | undefined }
): Promise<void> {
  const { assetId, dataUrl, jobId } = readCaptureDeliveryPayload(await capturePromise);
  state.jobId = jobId;
  await openEditorWithImage(dataUrl, {
    ...(assetId ? { assetId } : {}),
    tabId: context.resolvedTabId,
  });
  await markCaptureJobTerminal(jobId, 'completed');
  context.sendResponse({ success: true, result: 'accepted' });
}

async function respondWithInlineData(
  capturePromise: Promise<CaptureDeliveryPayload>,
  context: { captureAction: string; sendResponse: (response?: unknown) => void },
  state: { jobId?: string | undefined }
): Promise<void> {
  const { dataUrl, jobId } = readCaptureDeliveryPayload(await capturePromise);
  state.jobId = jobId;
  await markCaptureJobTerminal(jobId, 'completed');
  context.sendResponse({ success: true, dataUrl, action: context.captureAction });
}

async function respondWithDownload(
  capturePromise: Promise<CaptureDeliveryPayload>,
  context: {
    captureAction: string;
    defaultImagePresetId?: string | null | undefined;
    filename: string;
    sendResponse: (response?: unknown) => void;
  },
  state: { jobId?: string | undefined }
): Promise<void> {
  const { dataUrl, jobId } = readCaptureDeliveryPayload(await capturePromise);
  const presetId =
    context.captureAction === 'download_default'
      ? (context.defaultImagePresetId ?? undefined)
      : undefined;
  state.jobId = jobId;
  await executeDownload(
    dataUrl,
    context.filename,
    context.captureAction as CaptureActionType,
    presetId,
    jobId
  );
  context.sendResponse({ success: true, result: 'accepted' });
}
