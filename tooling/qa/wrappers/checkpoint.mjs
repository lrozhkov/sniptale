/**
 * Deterministic focused QA seam gate for the current uncommitted diff.
 */

import { isExecutedAsScript, loadBaseline } from '../core/shared.mjs';
import { collectAndPersistAdvisoryReport } from '../core/advisory-report.helpers.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { collectFocusedStepResults } from '../core/verify-focused.execution.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS } from '../core/verify-focused.code-steps.mjs';
import { createOkStep, createSkippedStep } from '../core/focused-qa-results.mjs';
import { runPrettierWrite } from '../core/verify-prettier.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext, hasHarnessQaTargets } from '../core/qa-scope.mjs';
import { collectHarnessFreshnessStep } from '../core/harness-freshness-step.mjs';
import { assertFreshHarnessState } from '../core/verify-harness.state.helpers.mjs';
import {
  createCheckpointPrerequisiteResult,
  createReadyCheckpointResult,
  persistCheckpointResult,
} from '../core/checkpoint-result.helpers.mjs';
export {
  collectFocusedI18nFiles,
  collectFocusedStorageWritePatternFiles,
  FOCUSED_TRIGGERED_STEP_DEFINITIONS,
  shouldRunCanonicalFacades,
  shouldRunDependencyGraph,
  shouldRunFocusedTypecheck,
} from '../core/verify-focused-triggered.mjs';
import {
  MANIFEST_PERMISSION_TRIGGER_FILES,
  RUNTIME_SOURCE_PATTERN,
  RUNTIME_TOPOLOGY_TRIGGER_FILES,
} from '../core/verify-focused.config.mjs';
import { resolveFocusedCoverageTargetFiles } from '../core/verify-focused.test-steps.mjs';
import { timeAsyncStep, timeSyncStep } from '../core/step-timing.helpers.mjs';
import { runCheckpointCli } from './checkpoint-cli.mjs';
import { parseWrapperArguments } from './cli-contracts.mjs';

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
    const result = await runPrettierWrite(context.existingTargetFiles);
    return createOkStep('Format', `formatted=${result.writtenFiles.length}`);
  });
}

function collectAdvisoryStep(context, { producerRunId } = {}) {
  return timeSyncStep(() => {
    collectAndPersistAdvisoryReport(context, { printReport: false, producerRunId });
    return createOkStep('Advisory report', `changed files=${context.targetFiles.length}`);
  });
}

async function collectCheckpointVerificationSteps({
  advisoryStep,
  context,
  focusedStepCollector,
  formatStep,
}) {
  if (formatStep.status === 'failed' || advisoryStep.status === 'failed') {
    return [formatStep, advisoryStep];
  }

  const focusedSteps = await focusedStepCollector({
    ...context,
    shouldRunManifestPermissions,
    shouldRunRuntimeTopology,
  });
  return [formatStep, advisoryStep, ...focusedSteps];
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
  harnessStateAsserter,
}) {
  const initialContext = createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE });
  const formatStep = await formatStepCollector(initialContext);
  const context = createCheckpointContext(contextCollector);
  if (formatStep.status === 'failed') return { context, blockedSteps: [formatStep] };

  const harnessFreshnessStep = collectHarnessFreshnessStep(context, harnessStateAsserter);
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
  const advisoryStep = dependencies.advisoryStepCollector(context, {
    producerRunId: dependencies.producerRunId,
  });
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
