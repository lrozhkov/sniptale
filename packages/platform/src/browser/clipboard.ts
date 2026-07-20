type BrowserClipboardImageFormat = 'png' | 'jpeg' | 'webp';

type BrowserClipboardImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

function canWriteBrowserClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}

function canReadBrowserClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

export function resolveBrowserClipboardImageMimeType(
  format: BrowserClipboardImageFormat
): BrowserClipboardImageMimeType {
  if (format === 'jpeg') {
    return 'image/jpeg';
  }

  if (format === 'webp') {
    return 'image/webp';
  }

  return 'image/png';
}

function isBrowserClipboardImageFormatAvailable(mimeType: BrowserClipboardImageMimeType): boolean {
  if (!canWriteBrowserClipboard()) {
    return false;
  }

  if (typeof ClipboardItem?.supports === 'function') {
    return ClipboardItem.supports(mimeType);
  }

  return mimeType === 'image/png';
}

export function isBrowserClipboardImageFormatSupported(
  format: BrowserClipboardImageFormat
): boolean {
  return isBrowserClipboardImageFormatAvailable(resolveBrowserClipboardImageMimeType(format));
}

export async function writeBrowserClipboardItems(items: ClipboardItem[]): Promise<void> {
  if (!canWriteBrowserClipboard()) {
    throw new Error('Clipboard write is unavailable.');
  }

  await navigator.clipboard.write(items);
}

export async function readBrowserClipboardImage(): Promise<{
  blob: Blob;
  mimeType: string;
} | null> {
  if (!canReadBrowserClipboard()) {
    throw new Error('Clipboard read is unavailable.');
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const mimeType = item.types.find((type) => type.toLowerCase().startsWith('image/'));
    if (!mimeType) {
      continue;
    }

    return {
      blob: await item.getType(mimeType),
      mimeType,
    };
  }

  return null;
}
