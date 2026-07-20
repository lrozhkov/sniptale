import {
  createFailureStep,
  createOkStep,
  createProcessStep,
  createViolationStep,
} from '../core/focused-qa-results.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext } from '../core/qa-scope.mjs';
import { runCommand } from '../core/shared.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { assertFreshHarnessState } from '../core/verify-harness.state.helpers.mjs';
import { assertFreshCheckpointState } from '../core/verify-checkpoint.state.helpers.mjs';
import { runTaskArtifactCommitCheck } from '../core/verify-task-artifacts.mjs';
import { timeSyncStep } from '../core/step-timing.helpers.mjs';
import { BUILD_COMMIT_STEPS } from '../core/qa-steps/definitions.data.mjs';
import { assertQaResultContract } from '../core/qa-steps/contract.mjs';

function getGitExecutable() {
  return process.platform === 'win32' ? 'git.exe' : 'git';
}

function collectStageChangesStep({ commandRunner = runCommand } = {}) {
  return timeSyncStep(() =>
    createProcessStep('Stage changes', commandRunner(getGitExecutable(), ['add', '-A']))
  );
}

function collectTaskArtifactStep({ taskArtifactCheck = runTaskArtifactCommitCheck } = {}) {
  return timeSyncStep(() =>
    createViolationStep(
      'Task artifacts',
      'Staged task-artifact violations found:',
      taskArtifactCheck()
    )
  );
}

function collectStagedCommitFiles({ commandRunner = runCommand } = {}) {
  const result = commandRunner(getGitExecutable(), [
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=ACMRD',
  ]);
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Unable to read staged files before commit');
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function collectCommitStep(commitMessage, { commandRunner = runCommand } = {}) {
  return timeSyncStep(() => {
    const stagedFiles = collectStagedCommitFiles({ commandRunner });
    if (stagedFiles.length === 0) {
      return createFailureStep('Git commit', 'no staged changes to commit');
    }

    const result = commandRunner(getGitExecutable(), ['commit', '-m', commitMessage]);
    return createProcessStep('Git commit', {
      ...result,
      stdout: String(result.stdout ?? '').replaceAll(commitMessage, '<commit-message>'),
      stderr: String(result.stderr ?? '').replaceAll(commitMessage, '<commit-message>'),
    });
  });
}

function collectPreCommitDiffGuardStep({
  contextCollector = collectCurrentDiffContext,
  harnessStateAsserter = assertFreshHarnessState,
  checkpointStateAsserter = assertFreshCheckpointState,
} = {}) {
  return timeSyncStep(() => {
    try {
      const currentFullContext = contextCollector();
      const currentContext = createScopedQaContext(currentFullContext, { suite: PRODUCT_QA_SUITE });
      const currentHarnessContext = createScopedQaContext(currentFullContext, { suite: 'harness' });
      checkpointStateAsserter(currentContext, 'qa:build commit staging');
      harnessStateAsserter(currentHarnessContext, 'qa:build commit staging');
      return createOkStep(
        'Pre-commit diff guard',
        'current diff still matches fresh checkpoint state'
      );
    } catch (error) {
      return createFailureStep(
        'Pre-commit diff guard',
        error instanceof Error ? error.message : String(error)
      );
    }
  });
}

function assertPlannedCommitPopulation(verificationSteps, executionMode, contractAsserter) {
  contractAsserter({
    wrapperId: 'qa:build',
    result: {
      executionMode,
      skipped: false,
      steps: [...verificationSteps, ...BUILD_COMMIT_STEPS.map(([, label]) => createOkStep(label))],
    },
  });
}

function collectCommitEffectSteps(verificationSteps, dependencies) {
  const steps = [...verificationSteps];
  const preCommitDiffGuardStep = collectPreCommitDiffGuardStep({
    contextCollector: dependencies.preCommitContextCollector,
    harnessStateAsserter: dependencies.harnessStateAsserter,
    checkpointStateAsserter: dependencies.checkpointStateAsserter,
  });
  steps.push(preCommitDiffGuardStep);
  if (preCommitDiffGuardStep.status === 'failed') return steps;

  const stageStep = collectStageChangesStep({ commandRunner: dependencies.commandRunner });
  steps.push(stageStep);
  if (stageStep.status === 'failed') return steps;

  const taskArtifactStep = collectTaskArtifactStep({
    taskArtifactCheck: dependencies.taskArtifactCheck,
  });
  steps.push(taskArtifactStep);
  if (taskArtifactStep.status === 'failed') return steps;

  steps.push(
    collectCommitStep(dependencies.commitMessage, {
      commandRunner: dependencies.commandRunner,
    })
  );
  return steps;
}

export function collectOptionalCommitSteps(
  verificationSteps,
  {
    shouldCommit,
    commitMessage,
    commandRunner = runCommand,
    taskArtifactCheck,
    preCommitContextCollector = collectCurrentDiffContext,
    harnessStateAsserter = assertFreshHarnessState,
    checkpointStateAsserter = assertFreshCheckpointState,
    executionMode = 'commit',
    executionContractAsserter = assertQaResultContract,
  }
) {
  if (
    !shouldCommit ||
    verificationSteps.some((step) => step.status === 'failed' || step.status === 'blocked')
  ) {
    return verificationSteps;
  }

  const buildStep = verificationSteps.at(-1);
  if (!buildStep || buildStep.label !== 'Build') return [...verificationSteps];

  assertPlannedCommitPopulation(verificationSteps, executionMode, executionContractAsserter);
  return collectCommitEffectSteps(verificationSteps, {
    checkpointStateAsserter,
    commandRunner,
    commitMessage,
    harnessStateAsserter,
    preCommitContextCollector,
    taskArtifactCheck,
  });
}
