import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshotStats } from '../../../analysis/source/source-snapshot.mjs';
import { collectRepositoryExecutableOrigins } from './repository.mjs';

const EXPECTED_AUTHORITY_TARGET_PAIRS = [
  ['tooling/ci/local.mjs', 'tooling/ci/local-playwright-smoke.mjs'],
  ['tooling/ci/local.mjs', 'tooling/ci/proof-wrapper.mjs'],
  ['tooling/ci/local.mjs', 'tooling/ci/release-wrapper.mjs'],
  ['tooling/ci/local.mjs', 'tooling/ci/verify-project-toolchain.mjs'],
  ['tooling/ci/ci-contract.test.ts', 'tooling/ci/proof.mjs'],
  ['tooling/ci/run-lane.mjs', 'tooling/ci/seal-lane-in-container.mjs'],
  ['packages/ui/package.json', 'tooling/qa/analysis/source/typescript-cli.mjs'],
  [
    'tooling/ci/selectel/sdk-controller-cleanup.test.py',
    'tooling/ci/selectel/sdk-controller-cleanup.test.py',
  ],
  [
    'tooling/qa/analysis/structural-risk/diff.test.ts',
    'tooling/qa/analysis/structural-risk/check.mjs',
  ],
  ['tooling/qa/hooks/pre-commit.mjs', 'tooling/qa/composition/closeout/verify-task-artifacts.mjs'],
  [
    'tooling/qa/guards/product-contracts/ui-automation/verify-ui-automation-seams.test.ts',
    'tooling/qa/guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs',
  ],
  ['tooling/qa/wrappers/closeout/closeout-build-handoff.mjs', 'tooling/qa/wrappers/build.mjs'],
  [
    'tooling/qa/proof/release/verify-release-archive.mjs',
    'tooling/release/package/package-dist.mjs',
  ],
] as const;

describe('repository executable origin projection', () => {
  it('derives the exact committed executable union without promoting authority inputs', () => {
    const snapshotStatsBefore = getSourceSnapshotStats();
    const projection = collectRepositoryExecutableOrigins();
    expect(getSourceSnapshotStats()).toEqual(snapshotStatsBefore);
    expect(projection.targets.length).toBeGreaterThan(0);
    expect(new Set(projection.targets).size).toBe(projection.targets.length);
    expect(projection.inputs).toEqual([
      'tooling/ci/Dockerfile',
      'tooling/ci/selectel/Dockerfile.controller',
      'tooling/configs/ci/toolchain.lock.json',
      'tooling/test/mutation/package-lock.json',
      'tooling/test/mutation/package.json',
    ]);
    expect(projection.embeddedSourceFixtures).toEqual([
      'tooling/qa/composition/control-inventory/discovery.test.ts',
      'tooling/qa/composition/control-inventory/executable-origins/index.test.ts',
      'tooling/qa/composition/control-inventory/executables/check.test.ts',
    ]);
    expect(projection.eagerCandidates).toEqual([]);
    expect(projection.registrationAuthorityPaths).toEqual(
      [...new Set(projection.registrationAuthorityPaths)].sort()
    );
    expect(projection.registrationAuthorityPaths).toEqual(
      expect.arrayContaining([
        'apps/extension/package.json',
        'packages/foundation/package.json',
        'packages/platform/package.json',
        'packages/runtime-contracts/package.json',
        'packages/ui/package.json',
      ])
    );
    expect(projection.registrationAuthorityPaths).not.toEqual(
      expect.arrayContaining(['tooling/configs/qa/control-dispositions.data.json'])
    );
    expect(
      projection.registrationAuthorityPaths.every((authority) =>
        fs.existsSync(`${repoRoot}/${authority}`)
      )
    ).toBe(true);
    expect(
      projection.registrationAuthorityPaths.every(
        (authority) => !projection.targets.includes(authority)
      )
    ).toBe(true);
    const authorityTargetPairs = new Set(
      projection.origins.map(({ authority, target }) => `${authority}\0${target}`)
    );
    for (const [authority, target] of EXPECTED_AUTHORITY_TARGET_PAIRS) {
      expect(authorityTargetPairs, `${authority} -> ${target}`).toContain(
        `${authority}\0${target}`
      );
    }
    expect(projection.origins.every(({ target }) => projection.targets.includes(target))).toBe(
      true
    );
    expect(projection.inputs).not.toEqual(expect.arrayContaining(projection.targets));
  }, 90_000);
});
