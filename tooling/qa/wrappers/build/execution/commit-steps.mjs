import {
  createFailureStep,
  createOkStep,
  createProcessStep,
  createViolationStep,
} from '../../../composition/checkpoint/focused-qa-results.mjs';
import { PRODUCT_QA_SUITE, createScopedQaContext } from '../../../composition/scope/qa-scope.mjs';
import { runCommand } from '../../../runtime/process/shared-process.mjs';
import { collectCurrentDiffContext } from '../../../runtime/scope/current-diff.helpers.mjs';
import { assertFreshHarnessState } from '../../../composition/harness/execution/state.mjs';
import { assertFreshCheckpointState } from '../../../composition/checkpoint/verify-checkpoint.state.helpers.mjs';
import { runTaskArtifactCommitCheck } from '../../../composition/closeout/verify-task-artifacts.mjs';
import { timeSyncStep } from '../../../runtime/observability/step-timing.helpers.mjs';
import { BUILD_COMMIT_STEPS } from '../../../composition/catalog/definitions.data.mjs';
import { assertQaResultContract } from '../../../composition/catalog/contract.mjs';

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

function assertCommitEffectSequence(verificationSteps, steps) {
  const effectSteps = steps.slice(verificationSteps.length);
  const expectedLabels = BUILD_COMMIT_STEPS.slice(0, effectSteps.length).map(([, label]) => label);
  const actualLabels = effectSteps.map(({ label }) => label);
  if (JSON.stringify(actualLabels) !== JSON.stringify(expectedLabels)) {
    throw new Error(
      `Build commit effect order drift: expected=[${expectedLabels.join(', ')}] ` +
        `actual=[${actualLabels.join(', ')}]`
    );
  }

  const barrierIndex = effectSteps.findIndex(
    ({ status }) => status === 'failed' || status === 'blocked'
  );
  if (barrierIndex >= 0 && barrierIndex !== effectSteps.length - 1) {
    throw new Error(`Build commit effect barrier drift after ${effectSteps[barrierIndex].label}`);
  }
}

function assertCommitEffectResult(verificationSteps, steps, executionMode, contractAsserter) {
  assertCommitEffectSequence(verificationSteps, steps);
  contractAsserter({
    wrapperId: 'qa:build',
    result: { executionMode, skipped: false, steps },
  });
  return steps;
}

function collectCommitEffectSteps(verificationSteps, dependencies) {
  const steps = [...verificationSteps];
  const stageStep = collectStageChangesStep({ commandRunner: dependencies.commandRunner });
  steps.push(stageStep);
  if (stageStep.status === 'failed') return steps;

  const taskArtifactStep = collectTaskArtifactStep({
    taskArtifactCheck: dependencies.taskArtifactCheck,
  });
  steps.push(taskArtifactStep);
  if (taskArtifactStep.status === 'failed') return steps;

  const preCommitDiffGuardStep = collectPreCommitDiffGuardStep({
    contextCollector: dependencies.preCommitContextCollector,
    harnessStateAsserter: dependencies.harnessStateAsserter,
    checkpointStateAsserter: dependencies.checkpointStateAsserter,
  });
  steps.push(preCommitDiffGuardStep);
  if (preCommitDiffGuardStep.status === 'failed') return steps;

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
  const steps = collectCommitEffectSteps(verificationSteps, {
    checkpointStateAsserter,
    commandRunner,
    commitMessage,
    harnessStateAsserter,
    preCommitContextCollector,
    taskArtifactCheck,
  });
  return assertCommitEffectResult(
    verificationSteps,
    steps,
    executionMode,
    executionContractAsserter
  );
}
