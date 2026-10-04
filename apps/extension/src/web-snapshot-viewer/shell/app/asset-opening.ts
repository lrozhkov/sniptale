import { sanitizeWebSnapshotSvgText } from '../../../features/web-snapshot/public';

const PASSIVE_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);

export function isPreviewableAssetImage(mimeType: string): boolean {
  return PASSIVE_IMAGE_MIME_TYPES.has(mimeType);
}

/** Keeps restored package bytes passive when displayed in an extension-owned tab. */
export async function createViewablePackageFileBlob(blob: Blob, mimeType: string): Promise<Blob> {
  if (mimeType === 'image/svg+xml') {
    return new Blob([sanitizeWebSnapshotSvgText(await blob.text())], {
      type: 'image/svg+xml',
    });
  }
  if (PASSIVE_IMAGE_MIME_TYPES.has(mimeType) || mimeType === 'application/pdf') {
    return blob;
  }
  return new Blob([blob], { type: 'text/plain' });
}
