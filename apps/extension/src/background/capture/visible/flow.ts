import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import { parseCaptureScreenshotResult } from '../full-page/helpers';
import { createCaptureJob, transitionCaptureJob } from '../jobs/state-machine';
import {
  buildViewportCaptureScreenshotOptions,
  createDebuggerCaptureDataUrl,
  finalizeCapturedDataUrl,
  resolveVisibleCaptureApiFormat,
  withHiddenFixedElements,
} from './helpers';

const logger = createLogger({ namespace: 'BackgroundVisibleCapture' });

type VisibleCaptureTransaction = {
  dataUrl: string;
  jobId: string;
};

async function runVisibleCaptureTransaction(
  tabId: number,
  capture: () => Promise<string>,
  failureMessage: string
): Promise<VisibleCaptureTransaction> {
  const job = await createCaptureJob(tabId);

  try {
    await transitionCaptureJob(job.jobId, 'capturing');
    const dataUrl = await capture();
    await transitionCaptureJob(job.jobId, 'rendering');
    return { dataUrl, jobId: job.jobId };
  } catch (error) {
    await transitionCaptureJob(job.jobId, 'failed', {
      error: error instanceof Error ? error.message : failureMessage,
    }).catch((transitionError) => {
      logger.warn('Failed to mark visible capture job as failed', transitionError);
    });
    throw error;
  }
}

async function convertPngToWebp(pngDataUrl: string, quality: number): Promise<string> {
  const response = await fetch(pngDataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageBitmap, 0, 0);

  const webpBlob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: quality / 100,
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(webpBlob);
  });
}

async function captureVisibleTabNative(tabId: number): Promise<string> {
  const settings = await loadSettings();
  const apiFormat = resolveVisibleCaptureApiFormat(settings.imageFormat);
  const tab = await browserTabs.get(tabId);
  if (typeof tab.windowId !== 'number') {
    throw new Error('Visible capture target window is unavailable.');
  }
  logger.log('Starting visible-tab capture', { format: settings.imageFormat, tabId });

  const { hiddenCount, result } = await withHiddenFixedElements(tabId, async () => {
    await assertVisibleCaptureTargetIsActive(tabId, tab.windowId);
    const capturedDataUrl = await browserTabs.captureVisibleTab(tab.windowId, {
      format: apiFormat,
      quality: settings.imageQuality,
    });

    return finalizeCapturedDataUrl({
      dataUrl: capturedDataUrl,
      settings,
      convertPngToWebp,
    });
  });

  logger.debug('Visible-tab capture masked fixed elements', { hiddenCount, tabId });
  logger.log('Completed visible-tab capture', { format: settings.imageFormat, tabId });
  return result;
}

async function assertVisibleCaptureTargetIsActive(tabId: number, windowId: number): Promise<void> {
  const [activeTab] = await browserTabs.query({ active: true, windowId });
  if (activeTab?.id !== tabId) {
    throw new Error('Visible capture target is not the active tab.');
  }
}

export async function captureVisibleTab(tabId: number): Promise<string> {
  const transaction = await captureVisibleTabTransaction(tabId);
  await transitionCaptureJob(transaction.jobId, 'completed');
  return transaction.dataUrl;
}

export async function captureVisibleTabForCrop(tabId: number): Promise<string> {
  const transaction = await captureVisibleTabForCropTransaction(tabId);
  await transitionCaptureJob(transaction.jobId, 'completed');
  return transaction.dataUrl;
}

export async function captureVisibleTabTransaction(
  tabId: number
): Promise<VisibleCaptureTransaction> {
  return runVisibleCaptureTransaction(
    tabId,
    () => captureVisibleTabNative(tabId),
    'Visible capture failed'
  );
}

export async function captureVisibleTabForCropTransaction(
  tabId: number
): Promise<VisibleCaptureTransaction> {
  return captureVisibleTabTransaction(tabId);
}

async function captureViewportWithClipNative(
  tabId: number,
  viewport: { width: number; height: number }
): Promise<string> {
  const settings = await loadSettings();
  logger.log('Starting viewport capture', { tabId, viewport });

  const { hiddenCount, result } = await withHiddenFixedElements(tabId, async () => {
    const rawResult = await browserDebugger.sendCommand<unknown>(
      { tabId },
      'Page.captureScreenshot',
      buildViewportCaptureScreenshotOptions(viewport, settings)
    );
    const parsedResult = parseCaptureScreenshotResult(rawResult);
    const capturedDataUrl = createDebuggerCaptureDataUrl(parsedResult.data, settings.imageFormat);

    return finalizeCapturedDataUrl({
      dataUrl: capturedDataUrl,
      settings,
      convertPngToWebp,
    });
  });

  logger.debug('Viewport capture masked fixed elements', {
    hiddenCount,
    tabId,
    viewport,
  });
  logger.log('Completed viewport capture', { format: settings.imageFormat, tabId, viewport });
  return result;
}

export async function captureViewportWithClip(
  tabId: number,
  viewport: { width: number; height: number }
): Promise<string> {
  const transaction = await captureViewportWithClipTransaction(tabId, viewport);
  await transitionCaptureJob(transaction.jobId, 'completed');
  return transaction.dataUrl;
}

export async function captureViewportWithClipTransaction(
  tabId: number,
  viewport: { width: number; height: number }
): Promise<VisibleCaptureTransaction> {
  return runVisibleCaptureTransaction(
    tabId,
    () => captureViewportWithClipNative(tabId, viewport),
    'Viewport capture failed'
  );
}
