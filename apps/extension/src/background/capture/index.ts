import { captureFullPage, captureFullPageTransaction } from './full-page/index';
import { downloadFullPageCapture, downloadVisibleCapture } from './download/flow';
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
export { captureFullPage, captureFullPageTransaction } from './full-page/index';

export async function captureAndDownloadVisible(tabId: number): Promise<void> {
  const capture = await captureVisibleTabTransaction(tabId);
  await downloadVisibleCapture(capture.dataUrl, capture.jobId);
}

export async function captureAndDownloadFullPage(
  tabId: number,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const capture = await captureFullPageTransaction(tabId, onProgress);
  await downloadFullPageCapture(capture.dataUrl, capture.jobId);
}

export async function captureFullPageForArchive(tabId: number): Promise<string> {
  return captureFullPage(tabId, undefined, { format: 'png', quality: 1 });
}
