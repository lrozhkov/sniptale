import { expect, it, vi } from 'vitest';

import { createTempRoot, withCwd, writeFile } from './test-helpers';
import { collectFocusedCoverageOwnerMapInventoryViolations } from './focused-coverage-owner-map.mjs';
import {
  collectHarnessFreshnessStep,
  collectHarnessInventoryViolations,
  collectInstanceOwnershipInventoryGuardViolations,
} from './harness-freshness-step.mjs';

const COVERAGE_ROLLOUT_INVENTORY = 'tooling/qa/core/verify-test-coverage.rollout-files.data.mjs';
const FOCUSED_OWNER_MAP_INVENTORY =
  'tooling/qa/core/focused-coverage/maps/cast-cleanup-content.mjs';
const INSTANCE_OWNERSHIP_INVENTORY = 'tooling/configs/qa/instance-ownership.data.json';

it('validates machine-owned inventory without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessInventoryTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter,
    'qa:checkpoint',
    () => []
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('preserves structured technical-debt inventory violation details', () => {
  const violation = {
    file: 'apps/extension/src/background/capture',
    message: 'Production file exact population changed.',
    rule: 'coverage-owner-production-drift',
  };
  const violations = collectHarnessInventoryViolations(
    {
      harnessInventoryTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
    },
    {
      technicalDebtInventoryValidator: () => [violation],
    }
  );

  expect(violations).toEqual([violation]);
});

it('keeps executable policy changes behind a fresh harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const context = {
    harnessTargetFiles: ['tooling/configs/qa/quality-baseline.json'],
    harnessInventoryTargetFiles: [],
    harnessVerificationTargetFiles: ['tooling/configs/qa/quality-baseline.json'],
  };

  const step = collectHarnessFreshnessStep(
    context,
    harnessStateAsserter,
    'qa:checkpoint',
    () => []
  );

  expect(step).toMatchObject({ status: 'ok', detail: 'fresh qa:release-harness stamp' });
  expect(harnessStateAsserter).toHaveBeenCalledWith(context, 'qa:checkpoint');
});

it('validates the live OSS consumer inventory for every harness change', () => {
  const ossInventoryValidator = vi.fn(() => ({
    violations: ['OSS release consumer manifest is incomplete or stale'],
  }));

  const violations = collectHarnessInventoryViolations(
    {
      harnessTargetFiles: ['tooling/release/package-dist.mjs'],
      harnessInventoryTargetFiles: [],
      harnessVerificationTargetFiles: ['tooling/release/package-dist.mjs'],
    },
    { ossInventoryValidator }
  );

  expect(ossInventoryValidator).toHaveBeenCalledOnce();
  expect(violations).toEqual([
    {
      file: 'tooling/configs/qa/oss-release-consumers.data.json',
      message: 'OSS release consumer manifest is incomplete or stale',
      rule: 'oss-release-consumer-inventory',
    },
  ]);
});

it('owner-validates the exact coverage rollout inventory without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
      harnessInventoryTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('owner-validates instance ownership inventory without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const instanceOwnershipInventoryValidator = vi.fn(() => []);
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: [INSTANCE_OWNERSHIP_INVENTORY],
      harnessInventoryTargetFiles: [INSTANCE_OWNERSHIP_INVENTORY],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter,
    'qa:checkpoint',
    (context) => collectHarnessInventoryViolations(context, { instanceOwnershipInventoryValidator })
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(instanceOwnershipInventoryValidator).toHaveBeenCalledOnce();
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('validates an unchanged live target under its new ownership rule', () => {
  const root = createTempRoot('instance-ownership-reclassification-');
  const target = 'apps/extension/src/content/selection/highlighter/index.ts';
  writeFile(
    root,
    target,
    [
      "import { createHighlighterController } from './controller';",
      'const highlighterController = createHighlighterController();',
      '',
    ].join('\n')
  );

  expect(
    collectInstanceOwnershipInventoryGuardViolations({
      root,
      inventoryReviewer: () => ({
        reclassifications: [{ file: target, rule: 'facade-default-owner', waveId: 'facades' }],
        violations: [],
      }),
    })
  ).toMatchObject([
    {
      file: target,
      rule: 'facade-default-owner',
    },
  ]);
});

it('fails the harness step when the exact coverage rollout owner validator rejects data', () => {
  const context = {
    harnessTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
    harnessInventoryTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
    harnessVerificationTargetFiles: [],
  };
  const coverageInventoryValidator = vi.fn(() => ['invalid exact rollout path']);

  const step = collectHarnessFreshnessStep(context, vi.fn(), 'qa:checkpoint', (currentContext) =>
    collectHarnessInventoryViolations(currentContext, { coverageInventoryValidator })
  );

  expect(step).toMatchObject({
    status: 'failed',
    violations: [
      {
        file: COVERAGE_ROLLOUT_INVENTORY,
        message: 'invalid exact rollout path',
        rule: 'coverage-rollout-inventory',
      },
    ],
  });
  expect(coverageInventoryValidator).toHaveBeenCalledOnce();
});

it('owner-validates a focused coverage map without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const focusedCoverageOwnerMapValidator = vi.fn(() => []);
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
      harnessInventoryTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter,
    'qa:checkpoint',
    (context) => collectHarnessInventoryViolations(context, { focusedCoverageOwnerMapValidator })
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(focusedCoverageOwnerMapValidator).toHaveBeenCalledOnce();
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('fails a map-only harness step when focused owner mappings are stale', () => {
  const mappingViolation = {
    file: 'apps/extension/src/content/parser/popup-export/helpers/root.test.ts',
    message: 'Mapped owner test file does not exist.',
    rule: 'focused-coverage-owner-mapping-missing-test',
  };
  const focusedCoverageOwnerMapValidator = vi.fn(() => [mappingViolation]);
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
      harnessInventoryTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
      harnessVerificationTargetFiles: [],
    },
    vi.fn(),
    'qa:checkpoint',
    (context) => collectHarnessInventoryViolations(context, { focusedCoverageOwnerMapValidator })
  );

  expect(step).toMatchObject({
    status: 'failed',
    violations: [mappingViolation],
  });
  expect(focusedCoverageOwnerMapValidator).toHaveBeenCalledOnce();
});

it.each([
  [
    'relative static import',
    [
      'import { OTHER_MAPPINGS } from "./other.mjs";',
      'export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [...OTHER_MAPPINGS];',
    ],
  ],
  [
    'non-relative import',
    [
      'import path from "node:path";',
      'export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [path.sep];',
    ],
  ],
  [
    'dynamic import',
    [
      'const other = await import("./other.mjs");',
      'export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [other];',
    ],
  ],
  [
    'top-level call',
    ['registerCoverageOwner();', 'export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [];'],
  ],
  ['computed mapping', ['export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = createMappings([]);']],
  [
    'computed property',
    ['export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [{ [ownerKey]: "content" }];'],
  ],
])('fails an allowlisted map-only change with %s', async (_label, sourceLines) => {
  const root = createTempRoot('focused-owner-map-inventory-composer-');
  writeFile(root, FOCUSED_OWNER_MAP_INVENTORY, [...sourceLines, ''].join('\n'));

  const step = await withCwd(root, async () =>
    collectHarnessFreshnessStep(
      {
        harnessTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
        harnessInventoryTargetFiles: [FOCUSED_OWNER_MAP_INVENTORY],
        harnessVerificationTargetFiles: [],
      },
      vi.fn(),
      'qa:checkpoint',
      (context) =>
        collectHarnessInventoryViolations(context, {
          focusedCoverageOwnerMapInventoryValidator: (files) =>
            collectFocusedCoverageOwnerMapInventoryViolations(files, { root }),
          focusedCoverageOwnerMapValidator: () => [],
        })
    )
  );

  expect(step).toMatchObject({
    status: 'failed',
    violations: [
      {
        file: FOCUSED_OWNER_MAP_INVENTORY,
        rule: 'focused-coverage-owner-map-inventory-declarative-shape',
      },
    ],
  });
});
