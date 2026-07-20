import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot } from './test-helpers';
import {
  discoverOssReleaseConsumers,
  readOssReleaseConsumerManifest,
  writeOssReleaseConsumerManifest,
} from './oss-release-consumer-discovery.mjs';
import { validateConsumers } from './oss-release-validation.docs.mjs';

function write(root: string, relativePath: string, contents: string) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

it('discovers every supported release consumer category and ignores tests', async () => {
  const root = createTempRoot('oss-release-consumers-');
  write(root, 'package.json', '{"scripts":{"qa:release":"node release.mjs"}}\n');
  write(root, 'tooling/qa/core/focused.mjs', "import './verify-oss-release-surface.mjs';\n");
  write(
    root,
    'tooling/release/archive.mjs',
    "import { readOssReleasePolicy } from './oss-release-policy.mjs';\n"
  );
  write(root, 'apps/extension/manifest.json', 'manrope-latin-wght-normal.woff2\n');
  write(root, 'tooling/qa/core/focused.test.ts', "import './verify-oss-release-surface.mjs';\n");
  write(
    root,
    'tasks/local-plan.json',
    'package-dist.mjs verify-oss-release-surface.mjs manrope-latin-wght-normal.woff2\n'
  );

  const consumers = discoverOssReleaseConsumers(root);
  expect(consumers.map(({ category, path: consumerPath }) => [consumerPath, category])).toEqual([
    ['apps/extension/manifest.json', 'bundled-font'],
    ['package.json', 'release-command'],
    ['tooling/qa/core/focused.mjs', 'validator-integration'],
    ['tooling/release/archive.mjs', 'archive-integration'],
  ]);

  await writeOssReleaseConsumerManifest({ root });
  expect(readOssReleaseConsumerManifest(root)).toEqual({ schemaVersion: 1, consumers });
});

it.each([
  'tooling/qa/core/verify-focused-triggered.execution.mjs',
  'tooling/qa/core/verify-all.violation-steps.architecture.mjs',
  'tooling/configs/qa/validation-manifest.json',
  'tooling/qa/core/qa-steps/definitions.data.mjs',
])('rejects an omitted authoritative release integration: %s', async (relativePath) => {
  const root = createTempRoot('oss-release-consumer-omission-');
  write(root, 'package.json', '{"scripts":{"qa:release":"node release.mjs"}}\n');
  write(root, 'apps/extension/manifest.json', 'manrope-latin-wght-normal.woff2\n');
  write(root, 'apps/extension/build/layout.data.json', 'manrope-latin-wght-normal.woff2\n');
  write(root, 'apps/extension/vite.config.ts', 'manrope-latin-wght-normal.woff2\n');
  write(root, 'packages/ui/src/styles/fonts.css', 'manrope-latin-wght-normal.woff2\n');
  write(root, 'tooling/release/package-dist.mjs', "import './oss-release-policy.mjs';\n");
  for (const integration of [
    'tooling/qa/core/verify-focused-triggered.execution.mjs',
    'tooling/qa/core/verify-all.violation-steps.architecture.mjs',
    'tooling/configs/qa/validation-manifest.json',
    'tooling/qa/core/qa-steps/definitions.data.mjs',
  ]) {
    write(root, integration, 'verify-oss-release-surface.mjs\n');
  }
  await writeOssReleaseConsumerManifest({ root });
  rmSync(path.join(root, relativePath));
  const inventory = { currentTree: { releaseConsumers: discoverOssReleaseConsumers(root) } };

  expect(
    validateConsumers(
      root,
      { releaseConsumerManifest: 'tooling/configs/qa/oss-release-consumers.data.json' },
      inventory
    )
  ).toEqual(
    expect.arrayContaining([
      'OSS release consumer manifest is incomplete or stale',
      `OSS release integration is undiscovered: ${relativePath} (validator-integration)`,
    ])
  );
});
