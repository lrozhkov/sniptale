import { expect, it } from 'vitest';

import { discoverLockedProductionPackages } from './lock-closure.mjs';
import { createLegalFixture } from './test-support';

it('discovers hoisted and nested runtime dependencies from both production roots', async () => {
  const repoRoot = await createLegalFixture({
    appDependencies: { alpha: '^1', gamma: '^1' },
    packages: [
      {
        dependencies: { '@types/alpha': '^1', beta: '^1' },
        files: { LICENSE: 'Alpha license' },
        name: 'alpha',
        optionalDependencies: { optional: '^1' },
      },
      {
        files: { LICENSE: 'Beta license' },
        name: 'beta',
        packagePath: 'node_modules/alpha/node_modules/beta',
      },
      { files: { LICENSE: 'Gamma license' }, name: 'gamma' },
    ],
    rootDependencies: { '@sniptale/ui': '0.0.0', alpha: '^1' },
  });

  const records = await discoverLockedProductionPackages({ repoRoot });

  expect(records.map((record) => record.packagePath)).toEqual([
    'node_modules/alpha',
    'node_modules/alpha/node_modules/beta',
    'node_modules/gamma',
  ]);
  expect(records[0]).toEqual(
    expect.objectContaining({ integrity: expect.stringMatching(/^sha512-/u), repoRoot })
  );
});

it('rejects a runtime dependency that is missing from package-lock', async () => {
  const repoRoot = await createLegalFixture({ rootDependencies: { absent: '^1' } });

  await expect(discoverLockedProductionPackages({ repoRoot })).rejects.toThrow(
    'package-lock is missing runtime dependency absent from <root>'
  );
});

it('rejects installed metadata that does not match the locked package', async () => {
  const repoRoot = await createLegalFixture({
    packages: [{ files: { LICENSE: 'MIT' }, name: 'alpha', version: '1.0.0' }],
    rootDependencies: { alpha: '^1' },
  });
  const packageJsonPath = `${repoRoot}/node_modules/alpha/package.json`;
  const metadata = JSON.parse(
    await (await import('node:fs/promises')).readFile(packageJsonPath, 'utf8')
  );
  await (
    await import('node:fs/promises')
  ).writeFile(packageJsonPath, JSON.stringify({ ...metadata, version: '2.0.0' }));

  await expect(discoverLockedProductionPackages({ repoRoot })).rejects.toThrow(
    'Installed package metadata does not match package-lock'
  );
});
