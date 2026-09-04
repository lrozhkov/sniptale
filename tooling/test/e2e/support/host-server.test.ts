import { expect, it } from 'vitest';

import { resolveBuiltAssetPath } from './host-server';

it('serves built harness assets from the extension build selected by the E2E runner', () => {
  expect(
    resolveBuiltAssetPath('/tooling/test/harness/popup.html', '/repo', '.tmp/e2e-builds/test')
  ).toBe('/repo/.tmp/e2e-builds/test/tooling/test/harness/popup.html');
});

it('falls back to canonical dist when no isolated E2E build is selected', () => {
  expect(resolveBuiltAssetPath('/popup.html', '/repo')).toBe('/repo/dist/popup.html');
});
