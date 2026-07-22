import { createOkStep, createViolationStep } from './focused-qa-results.mjs';
import {
  HARNESS_QA_GUIDANCE,
  hasHarnessQaTargets,
  hasHarnessVerificationQaTargets,
} from './qa-scope.mjs';
import { assertFreshHarnessState } from './verify-harness.state.helpers.mjs';
import { verifyTechnicalDebtReport } from './technical-debt-report.mjs';
import { runOssReleaseSurfaceCheck } from './verify-oss-release-surface.mjs';

const TECHNICAL_DEBT_INVENTORY = 'tooling/configs/qa/technical-debt.data.json';
const OSS_RELEASE_CONSUMER_INVENTORY = 'tooling/configs/qa/oss-release-consumers.data.json';

function collectInventoryViolations(context) {
  const inventoryTargets = new Set(context.harnessInventoryTargetFiles ?? []);
  return [
    ...(inventoryTargets.has(TECHNICAL_DEBT_INVENTORY)
      ? verifyTechnicalDebtReport().map((message) => ({
          rule: 'technical-debt-inventory',
          file: TECHNICAL_DEBT_INVENTORY,
          message,
        }))
      : []),
    ...(inventoryTargets.has(OSS_RELEASE_CONSUMER_INVENTORY)
      ? runOssReleaseSurfaceCheck().violations.map((message) => ({
          rule: 'oss-release-consumer-inventory',
          file: OSS_RELEASE_CONSUMER_INVENTORY,
          message,
        }))
      : []),
  ];
}

export function collectHarnessFreshnessStep(
  context,
  harnessStateAsserter = assertFreshHarnessState,
  consumerLabel = 'qa:checkpoint',
  inventoryViolationCollector = collectInventoryViolations
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
