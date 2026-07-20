export const MAX_EDITOR_RASTER_IMAGE_FILE_BYTES = 25 * 1024 * 1024;

const EDITOR_RASTER_IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

const EDITOR_RASTER_IMAGE_MIME_TYPES = new Set([
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/ico',
  'image/jpg',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
  'image/x-ms-bmp',
]);

function getLowercaseExtension(filename: string): string {
  const extensionStart = filename.lastIndexOf('.');
  return extensionStart < 0 ? '' : filename.slice(extensionStart).toLowerCase();
}

function throwInvalidRasterImageFile(): never {
  throw new Error('Invalid editor raster image file');
}

function isRasterImageMimeType(mimeType: string): boolean {
  return EDITOR_RASTER_IMAGE_MIME_TYPES.has(mimeType);
}

function getMimeTypeEssence(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function assertEditorRasterImageBlobCanBeRead(blob: Blob, mimeType = blob.type): void {
  const normalizedMimeType = getMimeTypeEssence(mimeType);
  if (!isRasterImageMimeType(normalizedMimeType)) {
    throwInvalidRasterImageFile();
  }
  if (blob.size <= 0 || blob.size > MAX_EDITOR_RASTER_IMAGE_FILE_BYTES) {
    throwInvalidRasterImageFile();
  }
}

export function assertEditorRasterImageFileCanBeRead(file: File): void {
  assertEditorRasterImageBlobCanBeRead(file);
  if (!EDITOR_RASTER_IMAGE_EXTENSIONS.has(getLowercaseExtension(file.name))) {
    throwInvalidRasterImageFile();
  }
}
