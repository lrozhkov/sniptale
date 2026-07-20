import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { waitForContentDocumentFocus } from '../../platform/page-context/focus';

const logger = createLogger({ namespace: 'ContentClipboard' });
const CLIPBOARD_FOCUS_TIMEOUT_MS = 3000;

type CopyImageToClipboardOptions = {
  assertFresh?: (() => void) | undefined;
  shouldRethrowError?: ((error: unknown) => boolean) | undefined;
};

function assertFresh(options: CopyImageToClipboardOptions): void {
  options.assertFresh?.();
}

async function convertBlobToPng(blob: Blob): Promise<Blob> {
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas context is unavailable');
    }

    context.drawImage(image, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error('Failed to convert to PNG'));
      }, 'image/png');
    });
  } finally {
    image.close();
  }
}

async function resolvePngClipboardBlob(
  dataUrl: string,
  options: CopyImageToClipboardOptions
): Promise<Blob> {
  const response = await fetch(dataUrl);
  assertFresh(options);
  const blob = await response.blob();
  assertFresh(options);

  if (blob.type === 'image/png') {
    return blob;
  }

  // Clipboard writes are much more reliable when the payload is normalized to PNG.
  const pngBlob = await convertBlobToPng(blob);
  assertFresh(options);
  logger.log('Converted image to PNG for clipboard', blob.type);
  return pngBlob;
}

export async function copyImageToClipboard(
  dataUrl: string,
  options: CopyImageToClipboardOptions = {}
): Promise<void> {
  try {
    const focused = await waitForContentDocumentFocus({
      timeoutMs: CLIPBOARD_FOCUS_TIMEOUT_MS,
    });
    assertFresh(options);
    if (!focused) {
      throw new Error('Clipboard write skipped because the document is not focused.');
    }

    const pngBlob = await resolvePngClipboardBlob(dataUrl, options);
    assertFresh(options);
    await writeBrowserClipboardItems([new ClipboardItem({ 'image/png': pngBlob })]);

    logger.log('Image copied to clipboard as PNG');
  } catch (error) {
    if (options.shouldRethrowError?.(error)) {
      throw error;
    }
    logger.error('Failed to copy image to clipboard', error);
    throw new Error(translate('content.runtime.copyImageFailed'));
  }
}
