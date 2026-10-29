import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { generateDependencyLegalClosure } from './index.mjs';
import { createLegalFixture } from './test-support';

const MIT_TEXT = 'MIT License\n\nCopyright Example\n';
const TABLER_INTEGRITY = 'sha512-dGFibGVyLWZpeHR1cmU=';
const TABLER_SHA256 = 'b740a1d46122672da62833e97f7e7c8a13fa85cbc7445b584b297cc00dde93db';
const TABLER_SOURCE_PATH = 'tooling/release/dependency-legal/sources/tabler-icons-3.46.0.LICENSE';
const TABLER_METADATA_PATH = 'index.js';
const TABLER_SOURCE = {
  license: 'MIT',
  originUrl: 'https://raw.githubusercontent.com/tabler/tabler-icons/v3.46.0/LICENSE',
  packageIntegrity: TABLER_INTEGRITY,
  packageName: '@iconify-icons/tabler',
  packageResolved: 'https://registry.example.test/tabler-2.0.0.tgz',
  packageVersion: '2.0.0',
  sha256: TABLER_SHA256,
  sourcePath: TABLER_SOURCE_PATH,
  upstreamAuthorName: 'Paweł Kuna',
  upstreamAuthorUrl: 'https://github.com/tabler/tabler-icons',
  upstreamLicenseMetadataUrl: 'https://github.com/tabler/tabler-icons/blob/master/LICENSE',
  upstreamMetadataPath: TABLER_METADATA_PATH,
  upstreamVersion: '3.46.0',
};

interface TablerFixtureOptions {
  iconSetInfo?: object;
  integrity?: string;
  resolved?: string;
  version?: string;
}

async function createTablerFixture({
  iconSetInfo = {},
  integrity = TABLER_INTEGRITY,
  resolved = TABLER_SOURCE.packageResolved,
  version = '2.0.0',
}: TablerFixtureOptions = {}) {
  const metadata = {
    author: { name: 'Paweł Kuna', url: TABLER_SOURCE.upstreamAuthorUrl },
    license: { spdx: 'MIT', url: TABLER_SOURCE.upstreamLicenseMetadataUrl },
    version: '3.46.0',
    ...iconSetInfo,
  };
  const repoRoot = await createLegalFixture({
    packages: [
      {
        files: {
          [TABLER_METADATA_PATH]: [
            `const iconSetInfo = ${JSON.stringify(metadata, null, 2)};`,
            'export default iconSetInfo;',
            '',
          ].join('\n'),
        },
        integrity,
        name: '@iconify-icons/tabler',
        resolved,
        version,
      },
    ],
    rootDependencies: { '@iconify-icons/tabler': '^2' },
  });
  return repoRoot;
}

async function seedTablerSource(repoRoot: string, contents?: string) {
  const destination = path.join(repoRoot, TABLER_SOURCE_PATH);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const source =
    contents ??
    (await fs.readFile(new URL('./sources/tabler-icons-3.46.0.LICENSE', import.meta.url), 'utf8'));
  await fs.writeFile(destination, source);
}

async function createDisjunctFixture(order: 'forward' | 'reverse' = 'forward') {
  const dependencies =
    order === 'forward' ? { dompurify: '^3', jszip: '^3' } : { jszip: '^3', dompurify: '^3' };
  return createLegalFixture({
    packages: [
      {
        files: { LICENSE: 'Apache License\nVersion 2.0\n' },
        license: '(MPL-2.0 OR Apache-2.0)',
        name: 'dompurify',
        version: '3.4.14',
      },
      {
        files: { 'LICENSE.markdown': `${MIT_TEXT}\nGPL version 3\n` },
        license: '(MIT OR GPL-3.0-or-later)',
        name: 'jszip',
        version: '3.10.1',
      },
    ],
    rootDependencies: dependencies,
  });
}

it('applies reviewed disjunct choices and keeps deterministic ordering', async () => {
  const first = await generateDependencyLegalClosure({
    repoRoot: await createDisjunctFixture('forward'),
  });
  const second = await generateDependencyLegalClosure({
    repoRoot: await createDisjunctFixture('reverse'),
  });

  expect(
    first.entries.map(({ packageName, selectedLicense }) => [packageName, selectedLicense])
  ).toEqual([
    ['dompurify', 'Apache-2.0'],
    ['jszip', 'MIT'],
  ]);
  expect(second).toEqual(first);
});

it('rejects a package without installed license text or a README license section', async () => {
  const repoRoot = await createLegalFixture({
    packages: [{ files: { 'README.md': '# Alpha\n\nNo terms here.\n' }, name: 'alpha' }],
    rootDependencies: { alpha: '^1' },
  });

  await expect(generateDependencyLegalClosure({ repoRoot })).rejects.toThrow(
    'Installed package has no redistributable license text: node_modules/alpha'
  );
});

it('rejects stale and invalid reviewed disjunct selections', async () => {
  const repoRoot = await createDisjunctFixture();
  await expect(
    generateDependencyLegalClosure({
      repoRoot,
      reviewedSelections: [
        { packageName: 'dompurify', selectedLicense: 'Apache-2.0', version: '3.4.11' },
      ],
    })
  ).rejects.toThrow('Stale reviewed license selection for dompurify@3.4.11');
  await expect(
    generateDependencyLegalClosure({
      repoRoot,
      reviewedSelections: [
        { packageName: 'dompurify', selectedLicense: 'GPL-2.0', version: '3.4.14' },
        { packageName: 'jszip', selectedLicense: 'MIT', version: '3.10.1' },
      ],
    })
  ).rejects.toThrow('Invalid reviewed license selection GPL-2.0 for dompurify@3.4.14');
});

it('rejects drift in the installed text for a reviewed disjunct choice', async () => {
  const repoRoot = await createLegalFixture({
    packages: [
      {
        files: { LICENSE: 'Mozilla Public License Version 2.0\n' },
        license: '(MPL-2.0 OR Apache-2.0)',
        name: 'dompurify',
        version: '3.4.14',
      },
    ],
    rootDependencies: { dompurify: '^3' },
  });

  await expect(generateDependencyLegalClosure({ repoRoot })).rejects.toThrow(
    'Reviewed license text drift for dompurify@3.4.14: Apache-2.0'
  );
});

it('records an exact corresponding-source URL for a selected MPL package', async () => {
  const resolved = 'https://registry.example.test/mediabunny/-/mediabunny-1.46.0.tgz';
  const repoRoot = await createLegalFixture({
    packages: [
      {
        files: { LICENSE: 'Mozilla Public License Version 2.0\n' },
        license: 'MPL-2.0',
        name: 'mediabunny',
        resolved,
        version: '1.46.0',
      },
    ],
    rootDependencies: { mediabunny: '^1' },
  });

  const closure = await generateDependencyLegalClosure({ repoRoot });

  expect(closure.entries[0].correspondingSourceUrl).toBe(resolved);
});

it('uses the exact pinned Tabler Icons 3.46.0 MIT source over an installed pointer', async () => {
  const repoRoot = await createTablerFixture();
  await fs.writeFile(
    path.join(repoRoot, 'node_modules/@iconify-icons/tabler/LICENSE.md'),
    '# License\n\nRead full license: https://github.com/tabler/tabler-icons/blob/master/LICENSE\n'
  );
  await seedTablerSource(repoRoot);

  const closure = await generateDependencyLegalClosure({
    pinnedSources: [TABLER_SOURCE],
    repoRoot,
  });

  expect(closure.entries[0]).toMatchObject({
    licenseProvenance: {
      originUrl: TABLER_SOURCE.originUrl,
      sha256: TABLER_SHA256,
      sourcePath: TABLER_SOURCE_PATH,
      upstreamVersion: '3.46.0',
    },
    licenseSource: TABLER_SOURCE_PATH,
    licenseSourceKind: 'pinned-upstream',
  });
  expect(closure.licenseFiles[0].contents).toContain('Copyright (c) 2020-2026 Paweł Kuna');
});

it('rejects missing or drifted pinned Tabler source bytes', async () => {
  const missingRoot = await createTablerFixture();
  await expect(
    generateDependencyLegalClosure({ pinnedSources: [TABLER_SOURCE], repoRoot: missingRoot })
  ).rejects.toThrow('Pinned dependency license source is missing');

  const driftedRoot = await createTablerFixture();
  await seedTablerSource(driftedRoot, 'MIT License\nchanged\n');
  await expect(
    generateDependencyLegalClosure({ pinnedSources: [TABLER_SOURCE], repoRoot: driftedRoot })
  ).rejects.toThrow('Pinned dependency license source digest drift');
});

it.each([
  'https://github.com/tabler/tabler-icons/blob/master/LICENSE',
  'https://icon-sets.iconify.design/tabler/',
])('rejects mutable or catalog Tabler license origin %s', async (originUrl) => {
  const repoRoot = await createTablerFixture();
  await seedTablerSource(repoRoot);
  await expect(
    generateDependencyLegalClosure({
      pinnedSources: [{ ...TABLER_SOURCE, originUrl }],
      repoRoot,
    })
  ).rejects.toThrow('Pinned dependency license origin is not version-tagged');
});

it.each([
  {
    fixture: { integrity: 'sha512-ZHJpZnRlZA==' },
    label: 'package integrity',
  },
  {
    fixture: { resolved: 'https://registry.example.test/tabler-drifted.tgz' },
    label: 'package source',
  },
  {
    fixture: { iconSetInfo: { version: '2.41.0' } },
    label: 'icon-set version',
  },
  {
    fixture: { iconSetInfo: { author: { name: 'Paweł Kuna', url: 'https://example.test' } } },
    label: 'author URL',
  },
  {
    fixture: { iconSetInfo: { license: { spdx: 'Apache-2.0' } } },
    label: 'SPDX license',
  },
  {
    fixture: { iconSetInfo: { license: { spdx: 'MIT', url: 'https://example.test/LICENSE' } } },
    label: 'license metadata URL',
  },
])('rejects pinned Tabler $label drift', async ({ fixture }) => {
  const repoRoot = await createTablerFixture(fixture);
  await seedTablerSource(repoRoot);
  await expect(
    generateDependencyLegalClosure({
      pinnedSources: [TABLER_SOURCE],
      repoRoot,
    })
  ).rejects.toThrow('Pinned dependency license identity drift');
});

it('rejects stale pinned dependency license registrations', async () => {
  const repoRoot = await createLegalFixture();
  await expect(
    generateDependencyLegalClosure({
      pinnedSources: [TABLER_SOURCE],
      repoRoot,
    })
  ).rejects.toThrow('Stale pinned dependency license source for @iconify-icons/tabler@2.0.0');
});

it.each([
  {
    contents: 'BSD 3-Clause "New" License:\nRedistribution and use in source and binary forms',
    valid: true,
  },
  { contents: 'Academic Free License version 2.1\n', valid: false },
])(
  'checks installed BSD-3-Clause text for a reviewed choice: $valid',
  async ({ contents, valid }) => {
    const repoRoot = await createLegalFixture({
      packages: [
        {
          files: { LICENSE: contents },
          license: '(AFL-2.1 OR BSD-3-Clause)',
          name: 'json-schema',
          version: '0.4.0',
        },
      ],
      rootDependencies: { 'json-schema': '^0.4.0' },
    });
    const result = generateDependencyLegalClosure({
      repoRoot,
      reviewedSelections: [
        { packageName: 'json-schema', selectedLicense: 'BSD-3-Clause', version: '0.4.0' },
      ],
    });
    if (!valid) {
      await expect(result).rejects.toThrow(
        'Reviewed license text drift for json-schema@0.4.0: BSD-3-Clause'
      );
      return;
    }
    expect((await result).entries[0]).toMatchObject({
      licenseSourceKind: 'installed-file',
      selectedLicense: 'BSD-3-Clause',
    });
  }
);

async function createPackageLicenseFixture() {
  const sourcePath = 'tooling/release/dependency-legal/sources/provider-utils.LICENSE';
  const contents = 'Licensed under the Apache License, Version 2.0\n';
  const repoRoot = await createLegalFixture({
    packages: [
      {
        name: '@ai-sdk/provider-utils',
        version: '5.0.62',
        license: 'Apache-2.0',
        repository: { url: 'https://github.com/vercel/ai' },
      },
    ],
    rootDependencies: { '@ai-sdk/provider-utils': '5.0.62' },
  });
  await fs.mkdir(path.dirname(path.join(repoRoot, sourcePath)), { recursive: true });
  await fs.writeFile(path.join(repoRoot, sourcePath), contents);
  const source = {
    kind: 'package-license',
    license: 'Apache-2.0',
    packageName: '@ai-sdk/provider-utils',
    packageVersion: '5.0.62',
    packageResolved: 'https://registry.example.test/@ai-sdk/provider-utils/-/5.0.62.tgz',
    packageIntegrity: `sha512-${Buffer.from('@ai-sdk/provider-utils@5.0.62').toString('base64')}`,
    upstreamRepository: 'vercel/ai',
    upstreamVersion: '@ai-sdk/provider-utils@5.0.62',
    originUrl:
      'https://raw.githubusercontent.com/vercel/ai/%40ai-sdk%2Fprovider-utils%405.0.62/LICENSE',
    sourcePath,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
  return { repoRoot, source };
}

it('uses a byte-pinned package-tag license when installed package text is missing', async () => {
  const { repoRoot, source } = await createPackageLicenseFixture();
  const closure = await generateDependencyLegalClosure({ repoRoot, pinnedSources: [source] });
  expect(closure.entries[0]).toMatchObject({
    selectedLicense: 'Apache-2.0',
    licenseSourceKind: 'pinned-upstream',
    licenseProvenance: { originUrl: source.originUrl, sha256: source.sha256 },
  });
});

it.each([
  { packageIntegrity: 'sha512-drifted' },
  { packageResolved: 'https://example.test/drifted.tgz' },
  { license: 'MIT' },
  { upstreamRepository: 'other/ai' },
  { upstreamVersion: '@ai-sdk/provider-utils@5.0.61' },
  { originUrl: 'https://raw.githubusercontent.com/vercel/ai/main/LICENSE' },
])('rejects drift in a pinned package license identity: %j', async (change) => {
  const { repoRoot, source } = await createPackageLicenseFixture();
  await expect(
    generateDependencyLegalClosure({
      repoRoot,
      pinnedSources: [{ ...source, ...change }],
    })
  ).rejects.toThrow('Pinned dependency license identity drift');
});

it('rejects changed bytes in a pinned package license', async () => {
  const { repoRoot, source } = await createPackageLicenseFixture();
  await fs.writeFile(path.join(repoRoot, source.sourcePath), 'changed');
  await expect(
    generateDependencyLegalClosure({
      repoRoot,
      pinnedSources: [source],
    })
  ).rejects.toThrow('Pinned dependency license source digest drift');
});
