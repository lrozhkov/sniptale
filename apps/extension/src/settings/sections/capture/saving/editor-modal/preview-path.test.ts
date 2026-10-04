import { expect, it } from 'vitest';
import { resolvePresetFolderPreview } from './preview-path';

it.each([
  ['reports//daily:../shots', undefined, 'reports/daily-shots'],
  ['../', 'Existing', 'Existing'],
  ['../', undefined, 'Screenshots'],
  ['./', undefined, ''],
  ['Captures/./Today', undefined, 'Captures/Today'],
  ['Captures/\u0001Today', undefined, 'Captures/Today'],
])('previews the relative download folder for %s', (input, previousPath, expected) => {
  expect(resolvePresetFolderPreview(input, previousPath)).toBe(expected);
});
