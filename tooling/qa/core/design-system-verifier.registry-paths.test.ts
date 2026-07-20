import { expect, it } from 'vitest';

import { getRegistryPathFailures } from './design-system-verifier.mjs';
import { createTempRoot, writeFile } from './test-helpers';

it('reports stale design-system registry source paths', () => {
  const root = createTempRoot('design-system-registry-paths-');

  writeFile(root, 'src/shared/ui/Button.tsx', 'export function Button() { return null; }\n');

  const failures = getRegistryPathFailures({
    repoRoot: root,
    registrySource: [
      "source: 'src/shared/ui/Button.tsx'",
      "sourceFiles: ['src/shared/ui/Missing.tsx']",
      "usageContexts: [{ files: ['apps/extension/src/design-system/DeletedPage.tsx'] }]",
    ].join('\n'),
  });

  expect(failures).toEqual([
    'apps/extension/src/design-system/DeletedPage.tsx is referenced by the design-system registry but does not exist',
    'src/shared/ui/Missing.tsx is referenced by the design-system registry but does not exist',
  ]);
});
