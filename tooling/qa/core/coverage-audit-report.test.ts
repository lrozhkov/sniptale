import fs from 'node:fs';

import { expect, it } from 'vitest';

import { collectProductionCoverageFiles, getCoverageOwnerKey } from './coverage-audit-report.mjs';
import { createTempRoot, writeFile } from './test-helpers';

it('discovers production coverage files from authoritative app and package roots', () => {
  const root = createTempRoot('coverage-audit-roots-');
  writeFile(root, 'apps/extension/src/background/service.ts', 'export const service = true;\n');
  writeFile(root, 'packages/foundation/src/history/clone.ts', 'export const clone = true;\n');
  writeFile(root, 'src/legacy.ts', 'export const legacy = true;\n');
  writeFile(root, 'apps/extension/src/background/service.test.ts', 'export const test = true;\n');

  expect(collectProductionCoverageFiles({ root })).toEqual([
    'apps/extension/src/background/service.ts',
    'packages/foundation/src/history/clone.ts',
  ]);
  expect(fs.existsSync(`${root}/src/legacy.ts`)).toBe(true);
});

it('groups coverage gaps by concrete app and package owners', () => {
  expect(getCoverageOwnerKey('apps/extension/src/content/logic/selection/file.ts')).toBe(
    'apps/extension/src/content/logic/selection'
  );
  expect(getCoverageOwnerKey('apps/extension/src/editor/controller/actions/file.ts')).toBe(
    'apps/extension/src/editor/controller/actions'
  );
  expect(getCoverageOwnerKey('packages/foundation/src/history/clone.ts')).toBe(
    'packages/foundation/src/history'
  );
});
