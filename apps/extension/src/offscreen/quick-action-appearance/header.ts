import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { composeWindowHeaderSvg } from '../../features/browser-frame/appearance';
import { acquireWindowHeaderFavicon } from '../../workflows/browser-frame/favicon';
import type { QuickActionHeaderRasterInput } from '../../contracts/messaging/contracts/runtime-message/quick-action-appearance.types';

/** DOM rasterization stays in the existing offscreen document and has no storage effects. */
export async function renderQuickActionHeader(
  input: QuickActionHeaderRasterInput
): Promise<{ dataUrl: string }> {
  const signal = AbortSignal.timeout(15_000);
  let header = input.header;
  if (header.faviconEnabled && !header.faviconDataUrl && input.faviconWebsite) {
    const icon = await acquireWindowHeaderFavicon(input.faviconWebsite, signal).catch(() => null);
    if (icon) header = { ...header, faviconDataUrl: icon, faviconSource: 'site' };
  }
  signal.throwIfAborted();
  const height = Math.ceil(windowHeaderGeometry(header, input.source).height);
  if (input.source.width * height > 16_000_000)
    throw new Error('Quick-action header exceeds raster limits');
  const canvas = document.createElement('canvas');
  canvas.width = input.source.width;
  canvas.height = height;
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([composeWindowHeaderSvg(header, input.source, height)], { type: 'image/svg+xml' })
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        image.src = '';
        reject(signal.reason);
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Quick-action header rasterization failed'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Quick-action header canvas is unavailable');
    context.drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png') };
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
