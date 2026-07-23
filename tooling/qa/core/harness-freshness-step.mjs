import { createOkStep, createViolationStep } from './focused-qa-results.mjs';
import {
  HARNESS_QA_GUIDANCE,
  hasHarnessQaTargets,
  hasHarnessVerificationQaTargets,
  isFocusedCoverageOwnerMapInventoryFile,
} from './qa-scope.mjs';
import { assertFreshHarnessState } from './verify-harness.state.helpers.mjs';
import { verifyTechnicalDebtReport } from './technical-debt-report.mjs';
import { runOssReleaseSurfaceCheck } from './verify-oss-release-surface.mjs';
import { collectCoverageRolloutInventoryViolations } from './verify-test-coverage.registry.mjs';
import {
  collectFocusedCoverageOwnerMapInventoryViolations,
  collectFocusedCoverageOwnerMappingViolations,
} from './focused-coverage-owner-map.mjs';

const TECHNICAL_DEBT_INVENTORY = 'tooling/configs/qa/technical-debt.data.json';
const OSS_RELEASE_CONSUMER_INVENTORY = 'tooling/configs/qa/oss-release-consumers.data.json';
const COVERAGE_ROLLOUT_INVENTORY = 'tooling/qa/core/verify-test-coverage.rollout-files.data.mjs';

export function collectHarnessInventoryViolations(
  context,
  {
    coverageInventoryValidator = collectCoverageRolloutInventoryViolations,
    focusedCoverageOwnerMapInventoryValidator = collectFocusedCoverageOwnerMapInventoryViolations,
    focusedCoverageOwnerMapValidator = collectFocusedCoverageOwnerMappingViolations,
    ossInventoryValidator = runOssReleaseSurfaceCheck,
    technicalDebtInventoryValidator = verifyTechnicalDebtReport,
  } = {}
) {
  const inventoryTargets = new Set(context.harnessInventoryTargetFiles ?? []);
  const focusedCoverageOwnerMapTargets = [...inventoryTargets].filter(
    isFocusedCoverageOwnerMapInventoryFile
  );
  return [
    ...(inventoryTargets.has(TECHNICAL_DEBT_INVENTORY)
      ? technicalDebtInventoryValidator().map((message) => ({
          rule: 'technical-debt-inventory',
          file: TECHNICAL_DEBT_INVENTORY,
          message,
        }))
      : []),
    ...(inventoryTargets.has(OSS_RELEASE_CONSUMER_INVENTORY)
      ? ossInventoryValidator().violations.map((message) => ({
          rule: 'oss-release-consumer-inventory',
          file: OSS_RELEASE_CONSUMER_INVENTORY,
          message,
        }))
      : []),
    ...(inventoryTargets.has(COVERAGE_ROLLOUT_INVENTORY)
      ? coverageInventoryValidator().map((message) => ({
          rule: 'coverage-rollout-inventory',
          file: COVERAGE_ROLLOUT_INVENTORY,
          message,
        }))
      : []),
    ...(focusedCoverageOwnerMapTargets.length > 0
      ? [
          ...focusedCoverageOwnerMapInventoryValidator(focusedCoverageOwnerMapTargets),
          ...focusedCoverageOwnerMapValidator(),
        ]
      : []),
  ];
}

export function collectHarnessFreshnessStep(
  context,
  harnessStateAsserter = assertFreshHarnessState,
  consumerLabel = 'qa:checkpoint',
  inventoryViolationCollector = collectHarnessInventoryViolations
) {
  if (!hasHarnessQaTargets(context)) {
    return null;
  }

  const inventoryViolations = inventoryViolationCollector(context);
  if (inventoryViolations.length > 0) {
    return createViolationStep('Harness QA', 'Data-only harness inventory violations found:', {
      violations: inventoryViolations,
    });
  }

  if (!hasHarnessVerificationQaTargets(context)) {
    return createOkStep('Harness QA', 'data-only inventory owner validators passed');
  }

  try {
    harnessStateAsserter(context, consumerLabel);
    return createOkStep(
      'Harness QA',
      (context.harnessInventoryTargetFiles ?? []).length > 0
        ? 'fresh qa:release-harness stamp; inventory owner validators passed'
        : 'fresh qa:release-harness stamp'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label: 'Harness QA',
      status: 'failed',
      summary: 'stale qa:release-harness stamp',
      stderr: `${message}\n${HARNESS_QA_GUIDANCE}\n`,
      durationMs: 0,
    };
  }
}
