import { loadSettings } from '../../../../composition/persistence/settings';
import { stripAsciiControlCharacters } from '@sniptale/platform/security/sanitizers/text';

const DEFAULT_DOWNLOAD_FILENAME = 'download';
const DRIVE_LABEL_PATTERN = /^[A-Za-z]:$/;
const UNSAFE_SEGMENT_CHARS_PATTERN = /[<>:"|?*]/g;

function sanitizePathSegment(value: string): string {
  return stripAsciiControlCharacters(value).replace(UNSAFE_SEGMENT_CHARS_PATTERN, '').trim();
}

function splitPathSegments(value: string): string[] {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function sanitizeDownloadDirectory(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const segments = splitPathSegments(value)
    .filter((segment) => segment !== '.' && segment !== '..' && !DRIVE_LABEL_PATTERN.test(segment))
    .map(sanitizePathSegment)
    .filter((segment) => segment.length > 0);

  return segments.length > 0 ? segments.join('/') : null;
}

export function sanitizeDownloadFilename(value: string, fallback = DEFAULT_DOWNLOAD_FILENAME) {
  const segments = splitPathSegments(value).filter(
    (segment) => segment !== '.' && segment !== '..'
  );
  const source = segments.at(-1) ?? value;
  const sanitized = sanitizePathSegment(source);
  return sanitized || fallback;
}

export async function resolvePresetPath(
  presetId: string | null | undefined
): Promise<string | null> {
  if (!presetId) return null;

  const settings = await loadSettings();
  const preset = (settings.presets ?? []).find((item) => item.id === presetId);
  if (!preset?.path) return null;

  return sanitizeDownloadDirectory(preset.path);
}

export function buildDownloadFilename(presetPath: string | null, filename: string): string {
  const safeFilename = sanitizeDownloadFilename(filename);
  const safePresetPath = sanitizeDownloadDirectory(presetPath);
  if (!safePresetPath) return safeFilename;

  return `${safePresetPath}/${safeFilename}`;
}
