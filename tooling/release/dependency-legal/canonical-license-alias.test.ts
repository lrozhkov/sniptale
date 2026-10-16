import { createHash } from 'node:crypto';

import { expect, it } from 'vitest';

import { generateDependencyLegalClosure } from './index.mjs';
import { createLegalFixture } from './test-support';

it('deduplicates an exact policy-owned canonical license and rejects policy drift', async () => {
  const license = 'SIL OPEN FONT LICENSE Version 1.1\n';
  const repoRoot = await createLegalFixture({
    packages: [
      {
        files: { LICENSE: license },
        license: 'OFL-1.1',
        name: '@fontsource/marck-script',
        version: '5.3.0',
      },
    ],
    rootDependencies: { '@fontsource/marck-script': '^5' },
  });
  const alias = {
    archivePath: 'LICENSES/OFL-1.1.txt',
    packageName: '@fontsource/marck-script',
    sha256: createHash('sha256').update(license).digest('hex'),
    version: '5.3.0',
  };

  const closure = await generateDependencyLegalClosure({
    canonicalLicenseAliases: [alias],
    repoRoot,
  });
  expect(closure.entries[0]).toMatchObject({
    archivePath: alias.archivePath,
    licenseStorageKind: 'canonical-file',
  });
  expect(closure.licenseFiles).toEqual([]);

  await expect(
    generateDependencyLegalClosure({
      canonicalLicenseAliases: [{ ...alias, sha256: '0'.repeat(64) }],
      repoRoot,
    })
  ).rejects.toThrow(
    'Canonical dependency license digest drift for @fontsource/marck-script@5.3.0.'
  );
  await expect(
    generateDependencyLegalClosure({ canonicalLicenseAliases: [alias, alias], repoRoot })
  ).rejects.toThrow('Canonical dependency license aliases must be one-to-one.');
});
