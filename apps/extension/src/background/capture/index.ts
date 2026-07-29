import { captureFullPageTransaction } from './full-page/workflow';
import { downloadFullPageCapture, downloadVisibleCapture } from './download/flow';
import { transitionCaptureJob } from './jobs/state-machine';
import type { FullPageCaptureTransaction } from './full-page/types';
import { registerFullPageExportRun, throwIfFullPageCaptureAborted } from './full-page/cancellation';
import {
  captureViewportWithClip,
  captureViewportWithClipTransaction,
  captureVisibleTab,
  captureVisibleTabForCrop,
  captureVisibleTabForCropTransaction,
  captureVisibleTabTransaction,
} from './visible/flow';

export {
  captureVisibleTab,
  captureVisibleTabForCrop,
  captureVisibleTabForCropTransaction,
  captureVisibleTabTransaction,
  captureViewportWithClip,
  captureViewportWithClipTransaction,
};
export { captureFullPage, captureFullPageTransaction } from './full-page/workflow';

export async function captureAndDownloadVisible(tabId: number): Promise<void> {
  const capture = await captureVisibleTabTransaction(tabId);
  await downloadVisibleCapture(capture.dataUrl, capture.jobId);
}

export async function captureAndDownloadFullPage(
  tabId: number,
  documentId: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const capture = await captureFullPageTransaction(tabId, onProgress, {
    backendKind: 'native',
    documentId,
  });
  await downloadFullPageCapture(capture.dataUrl, capture.jobId);
}

export async function captureFullPageForArchive(
  tabId: number,
  context: {
    backendKind: 'native' | 'unattended-cdp';
    documentId: string;
    abortSignal?: AbortSignal;
    exportRunId?: string;
  }
): Promise<FullPageCaptureTransaction> {
  const ownedExportRun = context.abortSignal
    ? null
    : registerFullPageExportRun(context.exportRunId);
  const abortSignal = context.abortSignal ?? ownedExportRun?.signal;
  try {
    const transaction = await captureFullPageTransaction(tabId, undefined, {
      ...context,
      ...(abortSignal === undefined ? {} : { abortSignal }),
      format: 'png',
      quality: 1,
    });
    throwIfFullPageCaptureAborted(abortSignal);
    await transitionCaptureJob(transaction.jobId, 'completed');
    throwIfFullPageCaptureAborted(abortSignal);
    return transaction;
  } finally {
    ownedExportRun?.release();
  }
}
