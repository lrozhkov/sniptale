import { delay } from '@sniptale/foundation/utils/delay';
import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createCapturePart, getTotalCaptureParts, parseCaptureScreenshotResult } from './helpers';
import { scrollPage } from '../page-state/index';
import type { CapturePart, CaptureScreenshotResult } from './types';

const logger = createLogger({ namespace: 'BackgroundFullPageCapture' });

export async function captureViewportParts(
  tabId: number,
  dimensions: {
    devicePixelRatio: number;
    scrollHeight: number;
    viewportHeight: number;
  },
  onProgress?: (current: number, total: number) => void
): Promise<CapturePart[]> {
  const { viewportHeight, scrollHeight, devicePixelRatio } = dimensions;
  const parts: CapturePart[] = [];
  let offsetY = 0;
  let partIndex = 0;
  const totalParts = getTotalCaptureParts(scrollHeight, viewportHeight);
  logger.debug('Capturing viewport parts', {
    devicePixelRatio,
    scrollHeight,
    totalParts,
    viewportHeight,
  });

  while (offsetY < scrollHeight) {
    await scrollPage(tabId, offsetY);
    await delay(350);

    const remainingHeight = scrollHeight - offsetY;
    const captureHeight = Math.min(viewportHeight, remainingHeight);
    const captureResult = await requestCaptureScreenshot(tabId);

    parts.push(
      createCapturePart({
        captureHeight,
        data: captureResult.data,
        offsetY,
      })
    );

    if (onProgress) {
      onProgress(partIndex + 1, totalParts);
    }

    offsetY += viewportHeight;
    partIndex++;
  }

  return parts;
}

async function requestCaptureScreenshot(tabId: number): Promise<CaptureScreenshotResult> {
  const result = await browserDebugger.sendCommand<unknown>({ tabId }, 'Page.captureScreenshot', {
    format: 'png',
    quality: 100,
    fromSurface: true,
  });

  return parseCaptureScreenshotResult(result);
}
