import { expect, it } from 'vitest';

import {
  PRODUCT_SOURCE_ROOTS,
  isProductSourcePath,
  isProductionSrcTypeScriptFile,
  normalizeRepoSrcPath,
} from './src-production-targets.mjs';

it('recognizes both live product source roots without collapsing the app path', () => {
  expect(PRODUCT_SOURCE_ROOTS).toEqual(['src', 'apps/extension/src']);
  expect(isProductSourcePath('apps/extension/src/popup/index.tsx')).toBe(true);
  expect(isProductSourcePath('apps/extension/src/camera-recorder/index.tsx')).toBe(true);
  expect(isProductSourcePath('apps/extension/build/layout.ts')).toBe(false);
  expect(normalizeRepoSrcPath('/repo/apps/extension/src/camera-recorder/index.tsx')).toBe(
    'apps/extension/src/camera-recorder/index.tsx'
  );
  expect(isProductionSrcTypeScriptFile('apps/extension/src/camera-recorder/index.tsx')).toBe(true);
  expect(isProductionSrcTypeScriptFile('apps/extension/src/camera-recorder/index.test.tsx')).toBe(
    false
  );
});
