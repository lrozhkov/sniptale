import { collectBuildStep } from '../composition/closeout/closeout-step-helpers/check.mjs';
import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { collectBuildCloseoutStepResults } from '../composition/build/execution/check.mjs';
import { collectCurrentDiffContext } from '../runtime/scope/current-diff.helpers.mjs';
import { assertFreshCheckpointState } from '../composition/checkpoint/verify-checkpoint.state.helpers.mjs';
import { assertFreshHarnessState } from '../composition/harness/execution/state.mjs';
import {
  PRODUCT_QA_SUITE,
  createScopedQaContext,
  hasHarnessVerificationQaTargets,
} from '../composition/scope/qa-scope.mjs';
import { assertQaResultContract } from '../composition/catalog/contract.mjs';
import {
  acquireBlockingWrapperLock,
  claimBlockingWrapperLockHandoff,
} from '../runtime/locking/blocking-wrapper-lock.helpers.mjs';
import { runBuildForContext } from './build/build-run.mjs';
import { parseWrapperArguments } from './contracts/cli-contracts.mjs';
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
  if (argv.includes('--reuse-build')) {
    throw new Error('qa:build --reuse-build is unsupported; commit mode requires a fresh build');
  }
  const parsed = parseWrapperArguments('qa:build', argv);
  const shouldCommit = parsed.values.shouldCommit ?? false;
  const proofOnly = parsed.values.proofOnly ?? false;
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
  return {
    files: [],
    shouldCommit,
    proofOnly,
    commitMessage: commitMessage ?? '',
    ...(parsed.values.help ? { help: true, helpText: parsed.help } : {}),
  };
}

export async function runBuildCloseout({
  argv = [],
  closeoutStepCollector = collectBuildCloseoutStepResults,
  contextCollector = collectCurrentDiffContext,
  harnessStateAsserter = assertFreshHarnessState,
  checkpointStateAsserter = assertFreshCheckpointState,
  commandRunner,
  taskArtifactCheck,
  artifactProofCollector = collectBuildStep,
  executionContractAsserter = assertQaResultContract,
} = {}) {
  const { files, shouldCommit, proofOnly, commitMessage } = parseBuildOptions(argv);
  assertDiffOnlyBuildRun(files);

  const context = createScopedQaContext(contextCollector(), { suite: PRODUCT_QA_SUITE });
  if (hasHarnessVerificationQaTargets(context)) {
    harnessStateAsserter(context, 'qa:build');
  }
  return runBuildForContext({
    context,
    options: { shouldCommit, proofOnly, commitMessage },
    dependencies: {
      artifactProofCollector,
      checkpointStateAsserter,
      closeoutStepCollector,
      commandRunner,
      contextCollector,
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
    execute: async () => runBuildCloseout({ argv }),
  });
  process.exitCode = outcome.exitCode;
}
