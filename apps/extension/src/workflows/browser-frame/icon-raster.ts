import { isWindowHeaderFavicon } from '@sniptale/runtime-contracts/window-header';

/** Normalize icon pixels once; projects retain only bounded PNG, never an object URL. */
export async function rasterizeWindowHeaderIcon(
  blob: Blob,
  signal: AbortSignal
): Promise<string | null> {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const abort = () => {
    image.src = '';
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth > 4096 ||
      image.naturalHeight > 4096
    )
      return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const scale = Math.min(64 / image.naturalWidth, 64 / image.naturalHeight);
    const width = image.naturalWidth * scale,
      height = image.naturalHeight * scale;
    context.drawImage(image, (64 - width) / 2, (64 - height) / 2, width, height);
    const result = canvas.toDataURL('image/png');
    return isWindowHeaderFavicon(result) ? result : null;
  } finally {
    signal.removeEventListener('abort', abort);
    image.src = '';
    URL.revokeObjectURL(url);
  }
}
