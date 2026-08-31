/**
 * Deterministic focused QA seam gate for the current uncommitted diff.
 */

import { loadBaseline } from '../policy/baselines/shared-baseline.mjs';
import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { collectAndPersistAdvisoryReport } from '../composition/advisory/advisory-report.helpers.mjs';
import { formatAdvisoryReport } from '../composition/advisory/execution/report.mjs';
import { collectCurrentDiffContext } from '../runtime/scope/current-diff.helpers.mjs';
import { collectFocusedStepResults } from '../composition/checkpoint/focused/execution.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS } from '../composition/checkpoint/focused/code-steps.mjs';
import { createOkStep, createSkippedStep } from '../composition/checkpoint/focused-qa-results.mjs';
import { runFormatterWrite } from '../guards/quality/verify-oxfmt.mjs';
import {
  PRODUCT_QA_SUITE,
  createScopedQaContext,
  hasHarnessQaTargets,
} from '../composition/scope/qa-scope.mjs';
import { collectHarnessFreshnessStep } from '../composition/harness/harness-freshness-step.mjs';
import { assertFreshHarnessState } from '../composition/harness/execution/state.mjs';
import {
  createCheckpointPrerequisiteResult,
  createReadyCheckpointResult,
  persistCheckpointResult,
} from '../composition/checkpoint/checkpoint-result.helpers.mjs';
export {
  collectFocusedI18nFiles,
  FOCUSED_TRIGGERED_STEP_DEFINITIONS,
  shouldRunDependencyGraph,
  shouldRunFocusedTypecheck,
} from '../composition/checkpoint/focused-triggered/helpers.mjs';
import {
  MANIFEST_PERMISSION_TRIGGER_FILES,
  RUNTIME_SOURCE_PATTERN,
  RUNTIME_TOPOLOGY_TRIGGER_FILES,
} from '../composition/checkpoint/focused/config.mjs';
import { resolveFocusedCoverageTargetFiles } from '../composition/checkpoint/focused/test-steps.mjs';
import { timeAsyncStep, timeSyncStep } from '../runtime/observability/step-timing.helpers.mjs';
import { runCheckpointCli } from './checkpoint/checkpoint-cli.mjs';
import { parseWrapperArguments } from './contracts/cli-contracts.mjs';

export { FOCUSED_CODE_VIOLATION_STEPS };
export { resolveFocusedCoverageTargetFiles };

function assertDiffOnlyFocusedRun(files = []) {
  if (files.length > 0) {
    throw new Error(
      'qa:checkpoint uses the current uncommitted diff only; remove the explicit --files scope'
    );
  }
}

export async function runFocusedVerification({ files = [] } = {}) {
  assertDiffOnlyFocusedRun(files);
  const context = createScopedQaContext(collectCurrentDiffContext(), { suite: PRODUCT_QA_SUITE });

  return {
    ...context,
    baseline: loadBaseline(),
  };
}

export function parseCheckpointOptions(argv = []) {
  if (argv.includes('--commit') || argv.includes('--no-commit') || argv.includes('-m')) {
    throw new Error('qa:checkpoint does not create commits; use qa:closeout -m "commit message"');
  }
  const parsed = parseWrapperArguments('qa:checkpoint', argv);

  return {
    files: [],
    ...(parsed.values.help ? { help: true, helpText: parsed.help } : {}),
  };
}

function assertCheckpointOptions(argv) {
  const { files } = parseCheckpointOptions(argv);
  assertDiffOnlyFocusedRun(files);
}

async function collectFormatStep(context) {
  if (context.existingTargetFiles.length === 0) {
    return createSkippedStep('Format', 'no matching files');
  }

  return timeAsyncStep(async () => {
    const result = runFormatterWrite(context.existingTargetFiles);
    return createOkStep(
      'Format',
      `formatted=${result.writtenFiles.length}; barrier=sequential-before-verification`
    );
  });
}

function collectAdvisoryStep(context, { producerRunId } = {}) {
  return timeSyncStep(() => {
    const report = collectAndPersistAdvisoryReport(context, {
      printReport: false,
      producerRunId,
    });
    const attention = report.findings.filter((finding) => finding.severity === 'attention').length;
    return {
      ...createOkStep(
        'Advisory report',
        `attention=${attention}, watch=${report.findings.length - attention}`
      ),
      consoleOutput: formatAdvisoryReport(report),
      advisories: report.findings,
    };
  });
}

function deduplicateAdvisoryCoveredConsoleOutput(advisoryStep, focusedSteps) {
  if (!advisoryStep.consoleOutput) {
    return focusedSteps;
  }

  return focusedSteps.map((step) => {
    if (step.label !== 'Structural risk' || !step.consoleOutput) {
      return step;
    }
    const withoutDuplicate = { ...step };
    delete withoutDuplicate.consoleOutput;
    return withoutDuplicate;
  });
}

async function collectCheckpointVerificationSteps({
  advisoryStep,
  context,
  focusedStepCollector,
  formatStep,
}) {
  if (formatStep.status === 'failed') return [formatStep, advisoryStep];
  const focusedSteps = await focusedStepCollector({
    ...context,
    shouldRunManifestPermissions,
    shouldRunRuntimeTopology,
  });

  return [
    formatStep,
    advisoryStep,
    ...deduplicateAdvisoryCoveredConsoleOutput(advisoryStep, focusedSteps),
  ];
}

function normalizeAdvisoryStep(advisoryStep) {
  if (advisoryStep.status !== 'failed') return advisoryStep;
  return {
    ...createSkippedStep('Advisory report', 'non-blocking advisory collection failed'),
    ...(advisoryStep.consoleOutput ? { consoleOutput: advisoryStep.consoleOutput } : {}),
  };
}

function collectFailSoftAdvisoryStep(advisoryStepCollector, context, producerRunId) {
  try {
    return normalizeAdvisoryStep(advisoryStepCollector(context, { producerRunId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createSkippedStep(
      'Advisory report',
      `non-blocking advisory collection failed: ${message}`
    );
  }
}

function createCheckpointContext(contextCollector) {
  return {
    ...createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE }),
    baseline: loadBaseline(),
  };
}

function mergePrerequisiteSteps(formatStep, harnessFreshnessStep, verificationSteps) {
  return [formatStep, harnessFreshnessStep, ...verificationSteps.slice(1)].filter(Boolean);
}

async function collectCheckpointPrerequisites({
  contextCollector,
  formatStepCollector,
  harnessInventoryViolationCollector,
  harnessStateAsserter,
}) {
  const initialContext = createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE });
  const formatStep = await formatStepCollector(initialContext);
  const context = createCheckpointContext(contextCollector);
  if (formatStep.status === 'failed') return { context, blockedSteps: [formatStep] };

  const harnessFreshnessStep = collectHarnessFreshnessStep(
    context,
    harnessStateAsserter,
    'qa:checkpoint',
    harnessInventoryViolationCollector
  );
  if (harnessFreshnessStep?.status === 'failed') {
    return { context, blockedSteps: [formatStep, harnessFreshnessStep] };
  }
  return {
    context,
    formatStep,
    harnessFreshnessStep,
  };
}

async function collectProductCheckpointResult(prerequisites, dependencies) {
  const { context, formatStep, harnessFreshnessStep } = prerequisites;
  const advisoryStep = collectFailSoftAdvisoryStep(
    dependencies.advisoryStepCollector,
    context,
    dependencies.producerRunId
  );
  const verificationSteps = await collectCheckpointVerificationSteps({
    advisoryStep,
    context,
    focusedStepCollector: dependencies.focusedStepCollector,
    formatStep,
  });
  const steps = mergePrerequisiteSteps(formatStep, harnessFreshnessStep, verificationSteps);
  return createCheckpointResultFromSteps(context, steps);
}

export async function runCheckpoint({
  argv = [],
  producerRunId,
  contextCollector = collectCurrentDiffContext,
  formatStepCollector = collectFormatStep,
  harnessInventoryViolationCollector,
  harnessStateAsserter = assertFreshHarnessState,
  advisoryStepCollector = collectAdvisoryStep,
  focusedStepCollector = collectFocusedStepResults,
  executionContractAsserter,
  stateWriter,
} = {}) {
  assertCheckpointOptions(argv);
  const prerequisites = await collectCheckpointPrerequisites({
    contextCollector,
    formatStepCollector,
    harnessInventoryViolationCollector,
    harnessStateAsserter,
  });
  const prerequisiteResult = createCheckpointPrerequisiteResult(
    prerequisites,
    hasHarnessQaTargets(prerequisites.context)
  );
  const result =
    prerequisiteResult ??
    (await collectProductCheckpointResult(prerequisites, {
      advisoryStepCollector,
      focusedStepCollector,
      producerRunId,
    }));
  return persistCheckpointResult(result, {
    producerRunId,
    contractValidator: executionContractAsserter,
    stateWriter,
  });
}

function createCheckpointResultFromSteps(context, steps) {
  if (steps.some((step) => step.status === 'failed')) {
    return {
      context,
      executionMode: 'product',
      readyForBuild: false,
      skipped: false,
      steps,
    };
  }

  return createReadyCheckpointResult({ context, steps });
}

function shouldRunRuntimeTopology(targetFiles) {
  return targetFiles.some(
    (file) => RUNTIME_TOPOLOGY_TRIGGER_FILES.has(file) || RUNTIME_SOURCE_PATTERN.test(file)
  );
}

function shouldRunManifestPermissions(targetFiles) {
  return targetFiles.some((file) => MANIFEST_PERMISSION_TRIGGER_FILES.has(file));
}

if (isExecutedAsScript(import.meta.url)) {
  await runCheckpointCli({ runCheckpoint });
}
