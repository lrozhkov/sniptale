import { sanitizePresetPathInput } from '@sniptale/foundation/utils/preset-path';
import { stripAsciiControlCharacters } from '@sniptale/platform/security/sanitizers/text';

/** Mirrors the download router's final folder normalization for the path saved by this editor. */
export function resolvePresetFolderPreview(path: string, previousPath?: string): string {
  const savedPath = sanitizePresetPathInput(path) || previousPath || 'Screenshots';
  return savedPath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .filter((segment) => !/^[A-Za-z]:$/.test(segment))
    .map((segment) =>
      stripAsciiControlCharacters(segment)
        .replace(/[<>:"|?*]/g, '')
        .trim()
    )
    .filter(Boolean)
    .join('/');
}
