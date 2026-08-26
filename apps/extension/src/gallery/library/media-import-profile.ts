const IMPORT_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  png: 'image/png',
  webm: 'video/webm',
  webp: 'image/webp',
};

const IMPORT_MEDIA_MIME_TYPES = Object.values(IMPORT_MIME_BY_EXTENSION);

export const GALLERY_MEDIA_IMPORT_ACCEPT = Array.from(IMPORT_MEDIA_MIME_TYPES).join(',');

export function resolveGalleryMediaImportMimeType(file: File): string | null {
  const declared = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (IMPORT_MEDIA_MIME_TYPES.includes(declared)) return declared;
  if (declared !== '') return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMPORT_MIME_BY_EXTENSION[extension] ?? null;
}
