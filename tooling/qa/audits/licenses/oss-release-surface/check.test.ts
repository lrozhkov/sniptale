import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from '../../../test-support/test-helpers';
import { readOssReleasePolicy, sha256 } from '../../../../release/policy/oss-release-policy.mjs';
import { formatThirdPartyNotices } from '../../../../release/dependency-legal/index.mjs';
import { collectOssReleaseSurfaceErrors, runOssReleaseSurfaceCheck } from './check.mjs';
import {
  INTERFACE_FONT_SOURCE_PATH,
  seedInterfaceFontConsumers,
  seedInterfaceFontSources,
  seedDocumentFont,
} from './test-support';

function write(root: string, relativePath: string, contents: string | Buffer) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function writePackage(root: string, relativePath: string, name: string, licensed: boolean) {
  write(
    root,
    relativePath,
    `${JSON.stringify(
      {
        name,
        ...(licensed ? { author: 'Lev Rozhkov', license: 'AGPL-3.0-or-later' } : {}),
        ...(relativePath === 'package.json'
          ? {
              scripts: {
                'ci:proof': 'node proof.mjs',
                'ci:release': 'node ci-release.mjs',
                'qa:release-harness': 'node release-harness.mjs',
              },
              workspaces: ['apps/extension', 'packages/*'],
            }
          : {}),
      },
      null,
      2
    )}\n`
  );
}

function interfaceFontAsset(font: Buffer) {
  return {
    id: 'golos-ui',
    licensePath: 'packages/ui/src/styles/golos-ui/LICENSE.txt',
    sourcePackage: '@sniptale/ui',
    version: '2.000',
    license: 'OFL-1.1',
    copyright:
      'Copyright (c) 2018, Paratype Inc (https://paratype.com), Copyright (c) 2018, Paratype Ltd, with Reserved Font Name "Golos UI".',
    artifacts: [
      {
        path: 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2',
        sha256: sha256(font),
        sourcePath: INTERFACE_FONT_SOURCE_PATH,
      },
    ],
  };
}

function createPolicy(font: Buffer, legal: Map<string, string>) {
  const legalFiles = [...legal].map(([source, contents]) => ({
    archivePath: source,
    sha256: sha256(Buffer.from(contents)),
    source,
  }));
  return {
    schemaVersion: 1,
    project: {
      author: 'Lev Rozhkov',
      copyright: 'Copyright (C) 2026 Lev Rozhkov',
      license: 'AGPL-3.0-or-later',
    },
    workspacePackages: [
      'package.json',
      'apps/extension/package.json',
      'packages/foundation/package.json',
      'packages/ui/package.json',
    ],
    legalFiles,
    bundledAssets: [interfaceFontAsset(font)],
    contributorFiles: ['README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', '.github/SECURITY.md'],
    releaseDocs: ['README.md', 'CONTRIBUTING.md', 'docs/oss/release.md'],
    dependencyLegal: {
      manifestPath: 'THIRD_PARTY_DEPENDENCIES.json',
      licenseDirectory: 'LICENSES/dependencies',
      canonicalLicenseAliases: [],
      pinnedSources: [],
      reviewedSelections: [],
    },
    forbiddenReleaseDocFragments: ['src/shared', '/home/private/repo'],
    securityReporting: 'github-private-vulnerability-reporting',
    nativeCompanion: 'separate-repository',
    publication: 'github-immutable-release',
  };
}

function seedLicensedPackages(root: string) {
  writePackage(root, 'package.json', 'sniptale', true);
  writePackage(root, 'apps/extension/package.json', '@sniptale/extension', true);
  writePackage(root, 'packages/foundation/package.json', '@sniptale/foundation', true);
  write(
    root,
    'package-lock.json',
    `${JSON.stringify({
      packages: {
        '': { license: 'AGPL-3.0-or-later' },
        'apps/extension': { license: 'AGPL-3.0-or-later' },
        'packages/ui': { license: 'AGPL-3.0-or-later' },
        'packages/foundation': { license: 'AGPL-3.0-or-later' },
      },
    })}\n`
  );
}

function seedLegalAndContributorFiles(root: string, font: Buffer) {
  const interfaceFont = {
    sourcePackage: '@sniptale/ui',
    version: '2.000',
    license: 'OFL-1.1',
    copyright:
      'Copyright (c) 2018, Paratype Inc (https://paratype.com), Copyright (c) 2018, Paratype Ltd, with Reserved Font Name "Golos UI".',
    licensePath: 'packages/ui/src/styles/golos-ui/LICENSE.txt',
    artifacts: [
      {
        path: 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2',
        sha256: sha256(font),
        sourcePath: INTERFACE_FONT_SOURCE_PATH,
      },
    ],
  };
  const legal = new Map([
    ['LICENSE', readFileSync(path.resolve('LICENSE'), 'utf8')],
    ['LICENSES/OFL-1.1.txt', readFileSync(path.resolve('LICENSES/OFL-1.1.txt'), 'utf8')],
    [
      'packages/ui/src/styles/golos-ui/LICENSE.txt',
      readFileSync(path.resolve('packages/ui/src/styles/golos-ui/LICENSE.txt'), 'utf8'),
    ],
    ['NOTICE', 'Copyright (C) 2026 Lev Rozhkov AGPL-3.0-or-later Golos UI\n'],
    ['THIRD_PARTY_NOTICES.md', formatThirdPartyNotices({ entries: [], interfaceFont })],
    ['THIRD_PARTY_DEPENDENCIES.json', '{"entries":[],"schemaVersion":1}\n'],
  ]);
  for (const [relativePath, contents] of legal) write(root, relativePath, contents);
  seedInterfaceFontSources(root, font, legal.get('packages/ui/src/styles/golos-ui/LICENSE.txt')!);
  write(root, 'README.md', 'Sniptale AGPL-3.0-or-later\n');
  write(
    root,
    'CONTRIBUTING.md',
    [
      'Sniptale welcomes bug reports and proposals.',
      'It does not currently accept external code contributions.',
      'Patches and pull requests may be closed.\n',
    ].join(' ')
  );
  write(root, 'CODE_OF_CONDUCT.md', 'Enforcement owner: Lev Rozhkov\n');
  write(
    root,
    '.github/SECURITY.md',
    'Use GitHub **Report a vulnerability** for private reports.\n'
  );
  write(
    root,
    'docs/oss/release.md',
    'qa:release-harness qa:checkpoint qa:closeout ci:proof ci:release Corresponding Source AGPL-3.0-or-later\n'
  );
  return legal;
}

function seedReleaseIntegrations(root: string) {
  write(
    root,
    'tooling/qa/composition/checkpoint/focused-triggered/execution.mjs',
    "import './verify-oss-release-surface.mjs';\n"
  );
  write(
    root,
    'tooling/qa/composition/repository/full-verification/violation-steps.mjs',
    "import './verify-oss-release-surface.mjs';\n"
  );
  write(
    root,
    'tooling/qa/composition/catalog/catalog.data.mjs',
    "export const steps = ['verify-oss-release-surface.mjs'];\n"
  );
  write(
    root,
    'tooling/qa/evidence/repo-audit-evidence/registry.data.mjs',
    "export const evidence = ['OSS release surface', 'verify-oss-release-surface.mjs'];\n"
  );
  write(
    root,
    'tooling/release/package/package-dist.mjs',
    "import { collectReleaseLegalSourceFiles } from './oss-release-policy.mjs';\n"
  );
}

async function createFixture() {
  const root = createTempRoot('oss-release-surface-');
  const font = Buffer.from('font fixture');
  writePackage(root, 'package.json', 'sniptale', false);
  writePackage(root, 'apps/extension/package.json', '@sniptale/extension', false);
  writePackage(root, 'packages/foundation/package.json', '@sniptale/foundation', false);
  write(root, 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2', font);
  seedLicensedPackages(root);
  const legal = seedLegalAndContributorFiles(root, font);
  seedInterfaceFontConsumers(root);
  seedReleaseIntegrations(root);
  write(
    root,
    'tooling/configs/qa/oss-release.data.json',
    `${JSON.stringify(createPolicy(font, legal), null, 2)}\n`
  );
  return root;
}

it('accepts a complete release surface and rejects mutable publication policy', async () => {
  const root = await createFixture();
  expect(collectOssReleaseSurfaceErrors(root)).toEqual([]);
  expect(runOssReleaseSurfaceCheck({ root })).toEqual({ violations: [] });
  const policyPath = path.join(root, 'tooling/configs/qa/oss-release.data.json');
  const policy = { ...JSON.parse(readFileSync(policyPath, 'utf8')), publication: 'github-release' };
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  expect(collectOssReleaseSurfaceErrors(root)).toContain(
    'OSS release policy must use immutable GitHub Releases and private vulnerability reporting'
  );
});

it('rejects a missing legal target and wrong workspace license metadata', async () => {
  const root = await createFixture();
  rmSync(path.join(root, 'NOTICE'));
  writePackage(root, 'apps/extension/package.json', '@sniptale/extension', false);

  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      'release legal file is missing: NOTICE',
      'workspace package license/author drift: apps/extension/package.json',
    ])
  );
});

it('rejects added or changed bundled font content', async () => {
  const addedRoot = await createFixture();
  write(addedRoot, 'apps/extension/public/fonts/unclassified.woff2', 'new font');
  expect(collectOssReleaseSurfaceErrors(addedRoot)).toContain(
    'bundled font inventory is incomplete or stale'
  );

  const changedRoot = await createFixture();
  write(changedRoot, 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2', 'changed');
  expect(collectOssReleaseSurfaceErrors(changedRoot)).toContain(
    'bundled font digest drift: packages/ui/src/styles/golos-ui/golos-ui-vf.woff2'
  );
  write(changedRoot, INTERFACE_FONT_SOURCE_PATH, 'changed source');
  write(changedRoot, 'packages/ui/src/styles/golos-ui/LICENSE.txt', 'changed license');
  const parityErrors = collectOssReleaseSurfaceErrors(changedRoot);
  expect(parityErrors).toContain(
    `bundled font installed source drift: ${INTERFACE_FONT_SOURCE_PATH}`
  );
  expect(parityErrors).toContain('Golos UI license digest drift');
});

it('rejects retired layout instructions and missing private-reporting guidance', async () => {
  const root = await createFixture();
  write(
    root,
    'docs/oss/release.md',
    [
      'qa:release-harness qa:checkpoint qa:closeout ci:proof ci:release src/shared',
      'Corresponding Source AGPL-3.0-or-later\n',
    ].join(' ')
  );
  write(root, '.github/SECURITY.md', '# Reporting\n');

  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      'retired release documentation fragment in docs/oss/release.md: src/shared',
      'private vulnerability reporting guidance is missing',
    ])
  );
});

it('rejects a missing canonical UI font license and export drift', async () => {
  const root = await createFixture();
  rmSync(path.join(root, 'packages/ui/src/styles/golos-ui/LICENSE.txt'));
  expect(collectOssReleaseSurfaceErrors(root)).toContain('Golos UI license source is missing');
  const packagePath = path.join(root, 'packages/ui/package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.exports['./styles/interface-font-license'] = './src/styles/other-license.txt';
  writeFileSync(packagePath, JSON.stringify(packageJson));
  expect(collectOssReleaseSurfaceErrors(root)).toContain('Golos UI canonical asset export drift');
});

async function createDocumentFontFixture() {
  const root = await createFixture();
  const asset = seedDocumentFont(root);
  const policyPath = 'tooling/configs/qa/oss-release.data.json';
  const policy = JSON.parse(readFileSync(path.join(root, policyPath), 'utf8'));
  policy.bundledAssets.push(asset);
  const notices = formatThirdPartyNotices({
    entries: [],
    interfaceFont: policy.bundledAssets[0],
    documentFont: asset,
  });
  write(root, 'THIRD_PARTY_NOTICES.md', notices);
  policy.legalFiles.find(
    (entry: { source: string }) => entry.source === 'THIRD_PARTY_NOTICES.md'
  ).sha256 = sha256(notices);
  policy.legalFiles.push({
    archivePath: asset.licensePath,
    source: asset.licensePath,
    sha256: sha256(readFileSync(path.join(root, asset.licensePath))),
  });
  write(root, policyPath, JSON.stringify(policy));
  return { root, asset, policy, policyPath };
}

it('accepts the exact document font asset and legal release surface', async () => {
  const { root } = await createDocumentFontFixture();
  expect(collectOssReleaseSurfaceErrors(root)).toEqual([]);
});

it.each([
  ['version', '2.000'],
  ['licensePath', 'packages/ui/src/styles/golos-ui/LICENSE.txt'],
  ['sourcePackage', '@fontsource/golos-text'],
])('rejects Text provenance drift for %s', async (key, value) => {
  const { root, asset, policy, policyPath } = await createDocumentFontFixture();
  asset[key] = value;
  policy.bundledAssets[1] = asset;
  write(root, policyPath, JSON.stringify(policy));
  expect(collectOssReleaseSurfaceErrors(root)).toContain('Golos Text provenance metadata drift');
});

it('rejects changed Text bytes even when the policy digest is changed to match', async () => {
  const { root, asset, policy, policyPath } = await createDocumentFontFixture();
  write(root, asset.artifacts[0].path, 'changed font');
  asset.artifacts[0].sha256 = sha256('changed font');
  policy.bundledAssets[1] = asset;
  write(root, policyPath, JSON.stringify(policy));
  expect(collectOssReleaseSurfaceErrors(root)).toContain('Golos Text provenance metadata drift');
});

it('rejects Text source mapping, asset export, missing license, and layout drift', async () => {
  const { root, asset, policy, policyPath } = await createDocumentFontFixture();
  asset.artifacts[0].sourcePath = INTERFACE_FONT_SOURCE_PATH;
  policy.bundledAssets[1] = asset;
  write(root, policyPath, JSON.stringify(policy));
  const packageJson = JSON.parse(readFileSync(path.join(root, 'packages/ui/package.json'), 'utf8'));
  packageJson.exports['./styles/document-font'] = './src/styles/golos-ui/golos-ui-vf.woff2';
  write(root, 'packages/ui/package.json', JSON.stringify(packageJson));
  rmSync(path.join(root, asset.licensePath));
  write(root, 'apps/extension/build/layout.data.json', '{}');
  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      `bundled font installed source mapping drift: ${asset.artifacts[0].path}`,
      'Golos Text canonical asset export drift',
      'Golos Text license source is missing',
      'bundled font consumer drift: golos-text-vf.woff2',
    ])
  );
});

it('requires Text license in the release payload and pins its canonical bytes', async () => {
  const { root, asset, policy, policyPath } = await createDocumentFontFixture();
  write(root, asset.licensePath, 'changed license');
  policy.legalFiles.find((entry: { source: string }) => entry.source === asset.licensePath).sha256 =
    sha256('changed license');
  write(root, policyPath, JSON.stringify(policy));
  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      `canonical license digest drift: ${asset.licensePath}`,
      'Golos Text license digest drift',
    ])
  );
  policy.legalFiles = policy.legalFiles.filter(
    (entry: { source: string }) => entry.source !== asset.licensePath
  );
  write(root, policyPath, JSON.stringify(policy));
  expect(() => readOssReleasePolicy(root)).toThrow(
    `OSS release policy is missing canonical legal file: ${asset.licensePath}`
  );
});
