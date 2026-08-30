import { createOkStep, createSkippedStep } from '../composition/checkpoint/focused-qa-results.mjs';
import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { assertQaResultContract } from '../composition/catalog/contract.mjs';
import { collectCurrentDiffContext } from '../runtime/scope/current-diff.helpers.mjs';
import { assertFreshCheckpointState } from '../composition/checkpoint/verify-checkpoint.state.helpers.mjs';
import { readAdvisoryState } from '../composition/advisory/execution/state.mjs';
import { formatAdvisoryReport } from '../composition/advisory/execution/report.mjs';
import {
  PRODUCT_QA_SUITE,
  createScopedQaContext,
  hasHarnessQaTargets,
} from '../composition/scope/qa-scope.mjs';
import { runCheckpoint } from './checkpoint.mjs';
import { collectBuildStep, runCloseoutBuildStep } from './closeout/closeout-build-handoff.mjs';
import { parseWrapperArguments } from './contracts/cli-contracts.mjs';
import { runObservedWrapper } from './observed/runner.mjs';
export {
  collectBuildStep,
  collectChildRunEvidence,
  createCloseoutBuildHandoffEnv,
  runCloseoutBuildStep,
} from './closeout/closeout-build-handoff.mjs';

function assertDiffOnlyCloseoutRun(files = []) {
  if (files.length > 0) {
    throw new Error(
      'qa:closeout uses the current uncommitted diff only; remove the explicit --files scope'
    );
  }
}

export function parseCloseoutOptions(argv = []) {
  if (argv.includes('--commit') || argv.includes('--no-commit')) {
    throw new Error('qa:closeout owns commit mode; pass only -m "commit message"');
  }
  if (argv.includes('--governance')) {
    throw new Error('qa:closeout no longer supports the retired governance profile');
  }
  const parsed = parseWrapperArguments('qa:closeout', argv);
  if (parsed.values.help) {
    return { files: [], buildArgs: [], help: true, helpText: parsed.help };
  }
  const commitMessage = parsed.values.commitMessage ?? '';
  if (!commitMessage) {
    throw new Error('qa:closeout requires -m "commit message"; commit close-out is mandatory');
  }

  return {
    buildArgs: ['--commit', '-m', commitMessage],
    files: [],
  };
}

function createFreshCheckpointReuseResult(context) {
  const readyForBuild = context.targetFiles.length > 0 || hasHarnessQaTargets(context);
  const advisoryState = readAdvisoryState();
  const findings =
    advisoryState?.version === 'agent-advisory-v2' &&
    advisoryState.success === true &&
    advisoryState.diffFingerprint === context.fingerprint
      ? advisoryState.findings
      : [];
  return {
    context,
    executionMode:
      context.targetFiles.length > 0
        ? 'product'
        : hasHarnessQaTargets(context)
          ? 'harness-only'
          : 'no-targets',
    readyForBuild,
    skipped: !readyForBuild,
    steps: [
      {
        ...createSkippedStep('QA checkpoint', 'fresh green checkpoint state'),
        consoleOutput: formatAdvisoryReport({ findings }),
        advisories: findings,
      },
    ],
  };
}

function resolveReusableCheckpointResult({ contextCollector, checkpointStateAsserter }) {
  const context = createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE });
  try {
    checkpointStateAsserter(context, 'qa:closeout');
  } catch {
    return null;
  }

  return createFreshCheckpointReuseResult(context);
}

function resolveCheckpointResultMode(result) {
  if (result.executionMode) return result.executionMode;
  if (result.context.targetFiles.length > 0) return 'product';
  return hasHarnessQaTargets(result.context) ? 'harness-only' : 'no-targets';
}

function createCloseoutExecutionMode(result, reusableCheckpoint) {
  const checkpointMode = reusableCheckpoint ? 'reused' : 'executed';
  const buildMode = result.readyForBuild ? 'with-build' : 'checkpoint-only';
  return `${checkpointMode}-${resolveCheckpointResultMode(result)}-${buildMode}`;
}

function appendCloseoutBuildStep(result, input) {
  input.executionContractAsserter({
    wrapperId: 'qa:closeout',
    result: {
      ...result,
      executionMode: input.executionMode,
      skipped: false,
      steps: [...result.steps, createOkStep('Full build')],
    },
  });
  result.steps.push(
    runCloseoutBuildStep({
      buildArgs: input.buildArgs,
      buildStepCollector: input.buildStepCollector,
      onBeforeBuild: input.onBeforeBuild,
      runIdentity: input.runIdentity,
      registerSensitiveValues: input.registerSensitiveValues,
    })
  );
}

export async function runCloseout({
  argv = [],
  producerRunId,
  rootRunId,
  buildStepCollector = collectBuildStep,
  checkpointStateAsserter = assertFreshCheckpointState,
  contextCollector = collectCurrentDiffContext,
  onBeforeBuild = () => {},
  checkpointRunner = runCheckpoint,
  registerSensitiveValues = () => {},
  executionContractAsserter = assertQaResultContract,
} = {}) {
  const { buildArgs, files } = parseCloseoutOptions(argv);
  assertDiffOnlyCloseoutRun(files);

  const reusableCheckpoint = resolveReusableCheckpointResult({
    checkpointStateAsserter,
    contextCollector,
  });
  const result = reusableCheckpoint ?? (await checkpointRunner({ argv: [], producerRunId }));
  const executionMode = createCloseoutExecutionMode(result, reusableCheckpoint);
  const resolvedBuildArgs = buildArgs;
  if (result.readyForBuild) {
    appendCloseoutBuildStep(result, {
      buildArgs: resolvedBuildArgs,
      buildStepCollector,
      executionContractAsserter,
      executionMode,
      onBeforeBuild,
      runIdentity: { parentRunId: producerRunId, rootRunId: rootRunId ?? producerRunId },
      registerSensitiveValues,
    });
  } else {
    executionContractAsserter({
      wrapperId: 'qa:closeout',
      result: { ...result, executionMode },
    });
  }

  return {
    ...result,
    buildArgs: resolvedBuildArgs,
    executionMode,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:closeout',
    label: 'QA closeout',
    argv,
    blocking: true,
    execute: async ({ session }) =>
      runCloseout({
        argv,
        producerRunId: session.runId,
        rootRunId: session.rootRunId,
        registerSensitiveValues: (values) => session.addSensitiveValues(values),
      }),
  });
  process.exitCode = outcome.exitCode;
}
