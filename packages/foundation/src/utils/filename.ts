import { buildScreenshotFilename } from './screenshot-filename';

/**
 * Generates a unique screenshot filename.
 */
export function generateFilename(suffix?: string, format = 'png'): string {
  return buildScreenshotFilename(suffix, format);
}
