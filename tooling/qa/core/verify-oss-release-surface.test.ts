import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';
import { sha256 } from '../../release/oss-release-policy.mjs';
import { formatThirdPartyNotices } from '../../release/dependency-legal/index.mjs';
import { writeOssReleaseConsumerManifest } from './oss-release-consumer-discovery.mjs';
import {
  collectOssReleaseSurfaceErrors,
  runOssReleaseSurfaceCheck,
} from './verify-oss-release-surface.mjs';
import {
  MANROPE_INSTALLED_FONT_PATH,
  seedManropeConsumers,
  seedManropeInstalledSources,
} from './verify-oss-release-surface.test-support';

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
                'qa:audit': 'node audit.mjs',
                'qa:release': 'node release.mjs',
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

function manropeAsset(font: Buffer) {
  return {
    id: 'manrope',
    sourcePackage: '@fontsource-variable/manrope',
    version: '5.2.8',
    license: 'OFL-1.1',
    copyright: 'Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)',
    artifacts: [
      {
        path: 'apps/extension/public/fonts/manrope-latin-wght-normal.woff2',
        sha256: sha256(font),
        sourcePath: MANROPE_INSTALLED_FONT_PATH,
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
    ],
    legalFiles,
    bundledAssets: [manropeAsset(font)],
    contributorFiles: ['README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md'],
    releaseDocs: ['README.md', 'CONTRIBUTING.md', 'docs/oss/release.md'],
    releaseConsumerManifest: 'tooling/configs/qa/oss-release-consumers.data.json',
    dependencyLegal: {
      manifestPath: 'THIRD_PARTY_DEPENDENCIES.json',
      licenseDirectory: 'LICENSES/dependencies',
      canonicalLicenseAliases: [],
      pinnedSources: [],
      reviewedSelections: [],
    },
    forbiddenReleaseDocFragments: ['src/shared', '/home/private/repo'],
    securityReporting: 'excluded',
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
        'node_modules/@fontsource-variable/manrope': { license: 'OFL-1.1', version: '5.2.8' },
        'packages/foundation': { license: 'AGPL-3.0-or-later' },
      },
    })}\n`
  );
}

function seedLegalAndContributorFiles(root: string, font: Buffer) {
  const manrope = {
    sourcePackage: '@fontsource-variable/manrope',
    version: '5.2.8',
    license: 'OFL-1.1',
    copyright: 'Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)',
    licensePath: 'LICENSES/OFL-1.1.txt',
    artifacts: [
      {
        path: 'apps/extension/public/fonts/manrope-latin-wght-normal.woff2',
        sha256: sha256(font),
        sourcePath: MANROPE_INSTALLED_FONT_PATH,
      },
    ],
  };
  const legal = new Map([
    ['LICENSE', readFileSync(path.resolve('LICENSE'), 'utf8')],
    ['LICENSES/OFL-1.1.txt', readFileSync(path.resolve('LICENSES/OFL-1.1.txt'), 'utf8')],
    ['NOTICE', 'Copyright (C) 2026 Lev Rozhkov AGPL-3.0-or-later Manrope\n'],
    ['THIRD_PARTY_NOTICES.md', formatThirdPartyNotices({ entries: [], manrope })],
    ['THIRD_PARTY_DEPENDENCIES.json', '{"entries":[],"schemaVersion":1}\n'],
  ]);
  for (const [relativePath, contents] of legal) write(root, relativePath, contents);
  seedManropeInstalledSources(root, font, legal.get('LICENSES/OFL-1.1.txt')!);
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
    'docs/oss/release.md',
    'qa:release-harness qa:checkpoint qa:release qa:audit Corresponding Source AGPL-3.0-or-later\n'
  );
  for (const relativePath of [
    'AGENTS.md',
    'docs/tooling/code-quality.md',
    'docs/tooling/wrapper-summary.md',
  ]) {
    write(root, relativePath, '`implementation → qa:checkpoint → required review → qa:closeout`\n');
  }
  return legal;
}

function seedReleaseIntegrations(root: string) {
  write(
    root,
    'tooling/qa/core/verify-focused-triggered.execution.mjs',
    "import './verify-oss-release-surface.mjs';\n"
  );
  write(
    root,
    'tooling/qa/core/verify-all.violation-steps.architecture.mjs',
    "import './verify-oss-release-surface.mjs';\n"
  );
  write(
    root,
    'tooling/configs/qa/validation-manifest.json',
    JSON.stringify({ tool: 'verify-oss-release-surface.mjs' })
  );
  write(
    root,
    'tooling/qa/core/qa-steps/definitions.data.mjs',
    "export const steps = ['verify-oss-release-surface.mjs'];\n"
  );
  write(
    root,
    'tooling/qa/evidence/repo-audit-evidence/registry.data.mjs',
    "export const evidence = ['OSS release surface', 'verify-oss-release-surface.mjs'];\n"
  );
  write(
    root,
    'tooling/release/package-dist.mjs',
    "import { collectReleaseLegalSourceFiles } from './oss-release-policy.mjs';\n"
  );
}

async function createFixture() {
  const root = createTempRoot('oss-release-surface-');
  const font = Buffer.from('font fixture');
  writePackage(root, 'package.json', 'sniptale', false);
  writePackage(root, 'apps/extension/package.json', '@sniptale/extension', false);
  writePackage(root, 'packages/foundation/package.json', '@sniptale/foundation', false);
  write(root, 'apps/extension/public/fonts/manrope-latin-wght-normal.woff2', font);
  seedLicensedPackages(root);
  const legal = seedLegalAndContributorFiles(root, font);
  seedManropeConsumers(root);
  seedReleaseIntegrations(root);
  write(
    root,
    'tooling/configs/qa/oss-release.data.json',
    `${JSON.stringify(createPolicy(font, legal), null, 2)}\n`
  );
  await writeOssReleaseConsumerManifest({ root });
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
    'OSS release policy must use immutable GitHub Releases without a security-reporting channel'
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
  write(changedRoot, 'apps/extension/public/fonts/manrope-latin-wght-normal.woff2', 'changed');
  expect(collectOssReleaseSurfaceErrors(changedRoot)).toContain(
    'bundled font digest drift: apps/extension/public/fonts/manrope-latin-wght-normal.woff2'
  );
  write(changedRoot, MANROPE_INSTALLED_FONT_PATH, 'changed source');
  write(changedRoot, 'node_modules/@fontsource-variable/manrope/LICENSE', 'changed license');
  const parityErrors = collectOssReleaseSurfaceErrors(changedRoot);
  expect(parityErrors).toContain(
    `bundled font installed source drift: ${MANROPE_INSTALLED_FONT_PATH}`
  );
  expect(parityErrors).toContain('Manrope installed license differs from canonical OFL text');
});

it('rejects retired layout instructions and an added security-reporting surface', async () => {
  const root = await createFixture();
  write(root, 'docs/oss/release.md', 'qa:release src/shared\n');
  write(root, 'SECURITY.md', '# Reporting\n');

  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      'retired release documentation fragment in docs/oss/release.md: src/shared',
      'SECURITY.md is excluded from this local release surface',
    ])
  );
});

it('rejects review-before-checkpoint workflow guidance', async () => {
  const root = await createFixture();
  write(
    root,
    'docs/tooling/code-quality.md',
    'required review completes before the first `qa:checkpoint`\n'
  );

  expect(collectOssReleaseSurfaceErrors(root)).toEqual(
    expect.arrayContaining([
      'workflow document is missing checkpoint-before-review order: docs/tooling/code-quality.md',
      'workflow document retains review-before-checkpoint guidance: docs/tooling/code-quality.md',
    ])
  );
});
