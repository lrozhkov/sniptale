import { expect, it } from 'vitest';
import { buildDownloadFilename } from '../../../../../background/capture/download/download-router/path';
import { resolvePresetFolderPreview } from './preview-path';
import { sanitizePresetPathInput } from '@sniptale/foundation/utils/preset-path';

it.each([
  ['reports//daily:../shots', undefined],
  ['../', 'Existing'],
  ['../', undefined],
  ['./', undefined],
  ['Captures/./Today', undefined],
  ['Captures/\u0001Today', undefined],
])('previews the actual relative download folder for %s', (input, previousPath) => {
  const preview = resolvePresetFolderPreview(input, previousPath);
  const savedPath = sanitizePresetPathInput(input) || previousPath || 'Screenshots';
  expect(buildDownloadFilename(savedPath, 'image.png')).toBe(
    preview ? `${preview}/image.png` : 'image.png'
  );
});
