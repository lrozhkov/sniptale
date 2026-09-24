const IMPORT_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  flac: 'audio/flac',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  png: 'image/png',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

const IMPORT_MEDIA_MIME_TYPES = [
  ...Object.values(IMPORT_MIME_BY_EXTENSION),
  'audio/webm',
  'audio/wave',
  'audio/x-wav',
  'audio/x-flac',
];

export const GALLERY_MEDIA_IMPORT_ACCEPT = Array.from(IMPORT_MEDIA_MIME_TYPES).join(',');

export function resolveGalleryMediaImportCreatedAt(file: File, now = Date.now()): number {
  const lastModified = file.lastModified;
  return Number.isSafeInteger(lastModified) && lastModified > 0 && lastModified <= now
    ? lastModified
    : now;
}

export function resolveGalleryMediaImportMimeType(file: File): string | null {
  const declared = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (IMPORT_MEDIA_MIME_TYPES.includes(declared)) return declared;
  if (declared !== '') return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMPORT_MIME_BY_EXTENSION[extension] ?? null;
}
