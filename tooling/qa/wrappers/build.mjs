import { collectBuildStep } from '../core/verify-closeout-step-helpers.mjs';
import { isExecutedAsScript } from '../core/shared.mjs';
import { collectBuildCloseoutStepResults } from '../core/verify-build.execution.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { assertFreshCheckpointState } from '../core/verify-checkpoint.state.helpers.mjs';
import {
  assertFreshBuildState,
  createBuildState,
  writeBuildState,
} from '../core/verify-build.state.helpers.mjs';
import { assertFreshHarnessState } from '../core/verify-harness.state.helpers.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext, hasHarnessQaTargets } from '../core/qa-scope.mjs';
import { assertQaResultContract } from '../core/qa-steps/contract.mjs';
import {
  acquireBlockingWrapperLock,
  claimBlockingWrapperLockHandoff,
} from '../runtime/blocking-wrapper-lock.helpers.mjs';
import { runBuildForContext } from './build-run.mjs';
import { parseWrapperArguments } from './cli-contracts.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

const CLOSEOUT_BUILD_LOCK_ENV = 'SNIPTALE_QA_CLOSEOUT_BUILD_LOCK';
const CLOSEOUT_BUILD_OWNER_PID_ENV = 'SNIPTALE_QA_CLOSEOUT_BUILD_OWNER_PID';

function assertDiffOnlyBuildRun(files = []) {
  if (files.length > 0) {
    throw new Error(
      'qa:build uses the current uncommitted diff only; remove the explicit --files scope'
    );
  }
}

export function parseBuildOptions(argv = []) {
  const parsed = parseWrapperArguments('qa:build', argv);
  const shouldCommit = parsed.values.shouldCommit ?? false;
  const proofOnly = parsed.values.proofOnly ?? false;
  const reuseBuild = parsed.values.reuseBuild ?? false;
  const commitMessage = parsed.values.commitMessage;

  if (shouldCommit && !commitMessage) {
    throw new Error('qa:build --commit requires -m "commit message"');
  }

  if (!shouldCommit && commitMessage) {
    throw new Error('Use --commit together with -m when qa:build should create a commit');
  }
  if (proofOnly && shouldCommit) {
    throw new Error('qa:build --proof cannot create a commit');
  }
  if (reuseBuild && !shouldCommit) {
    throw new Error('qa:build --reuse-build requires --commit');
  }
  if (reuseBuild && proofOnly) {
    throw new Error('qa:build --reuse-build cannot be combined with --proof');
  }

  return {
    files: [],
    shouldCommit,
    proofOnly,
    reuseBuild,
    commitMessage: commitMessage ?? '',
    ...(parsed.values.help ? { help: true, helpText: parsed.help } : {}),
  };
}

export async function runBuildCloseout({
  argv = [],
  producerRunId,
  closeoutStepCollector = collectBuildCloseoutStepResults,
  contextCollector = collectCurrentDiffContext,
  harnessStateAsserter = assertFreshHarnessState,
  checkpointStateAsserter = assertFreshCheckpointState,
  buildStateAsserter = assertFreshBuildState,
  buildStateWriter = writeBuildState,
  commandRunner,
  taskArtifactCheck,
  artifactProofCollector = collectBuildStep,
  executionContractAsserter = assertQaResultContract,
} = {}) {
  const { files, shouldCommit, proofOnly, reuseBuild, commitMessage } = parseBuildOptions(argv);
  assertDiffOnlyBuildRun(files);

  const context = createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE });
  if (hasHarnessQaTargets(context)) {
    harnessStateAsserter(context, 'qa:build');
  }
  return runBuildForContext({
    context,
    options: { shouldCommit, proofOnly, reuseBuild, commitMessage },
    dependencies: {
      artifactProofCollector,
      buildStateAsserter,
      buildStateWriter,
      checkpointStateAsserter,
      closeoutStepCollector,
      commandRunner,
      contextCollector,
      createBuildState: (input) => createBuildState({ ...input, producerRunId }),
      executionContractAsserter,
      harnessStateAsserter,
      taskArtifactCheck,
    },
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const closeoutHandoffToken = process.env[CLOSEOUT_BUILD_LOCK_ENV];
  const lockFactory = closeoutHandoffToken
    ? (_wrapperId, runIdentity) =>
        claimBlockingWrapperLockHandoff({
          consumerId: 'qa:build',
          ownerId: 'qa:closeout',
          ownerPid: Number(process.env[CLOSEOUT_BUILD_OWNER_PID_ENV]),
          token: closeoutHandoffToken,
          ...runIdentity,
        })
    : acquireBlockingWrapperLock;
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:build',
    label: 'QA build',
    argv,
    blocking: true,
    lockFactory,
    execute: async ({ session }) => runBuildCloseout({ argv, producerRunId: session.runId }),
  });
  process.exitCode = outcome.exitCode;
}
