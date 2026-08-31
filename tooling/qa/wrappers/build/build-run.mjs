import {
  createOkStep,
  createSkippedStep,
} from '../../composition/checkpoint/focused-qa-results.mjs';
import {
  HARNESS_QA_GUIDANCE,
  hasHarnessQaTargets,
  hasHarnessVerificationQaTargets,
} from '../../composition/scope/qa-scope.mjs';
import { collectOptionalCommitSteps } from './execution/commit-steps.mjs';

function createBuildResult(context, steps, skipped = false, scopeDetail = '', executionMode) {
  return { context, scopeDetail, skipped, steps, executionMode };
}

function commitSteps(steps, options, dependencies, executionMode) {
  return collectOptionalCommitSteps(steps, {
    shouldCommit: options.shouldCommit,
    commitMessage: options.commitMessage,
    commandRunner: dependencies.commandRunner,
    taskArtifactCheck: dependencies.taskArtifactCheck,
    preCommitContextCollector: dependencies.contextCollector,
    harnessStateAsserter: dependencies.harnessStateAsserter,
    checkpointStateAsserter: dependencies.checkpointStateAsserter,
    executionContractAsserter: dependencies.executionContractAsserter,
    executionMode,
  });
}

function collectNoProductBuild(context, options, dependencies) {
  if (!hasHarnessQaTargets(context)) {
    return createBuildResult(
      context,
      [createOkStep('QA build', 'no changed or matching files')],
      true,
      '',
      'no-targets'
    );
  }
  if (hasHarnessVerificationQaTargets(context)) {
    dependencies.harnessStateAsserter(context, 'qa:build');
  }
  dependencies.checkpointStateAsserter(context, 'qa:build');
  if (!options.shouldCommit) {
    return createBuildResult(
      context,
      [
        createOkStep(
          'QA build',
          hasHarnessVerificationQaTargets(context)
            ? 'no product targets; fresh harness stamp and checkpoint'
            : 'no product targets; fresh checkpoint with data-only inventory owner validation'
        ),
      ],
      false,
      '',
      'control-validate'
    );
  }
  return createBuildResult(
    context,
    commitSteps(
      [
        createOkStep(
          'Build',
          hasHarnessVerificationQaTargets(context)
            ? `no product targets; ${HARNESS_QA_GUIDANCE}`
            : 'no product targets; fresh checkpoint validated the data-only inventory without a harness stamp'
        ),
      ],
      options,
      dependencies,
      'control-commit'
    ),
    false,
    '',
    'control-commit'
  );
}

async function collectArtifactProof(context, dependencies) {
  const step =
    context.productTargetFiles.length === 0
      ? createSkippedStep('Build', 'control-only diff; artifact build skipped')
      : await dependencies.artifactProofCollector(context);
  return createBuildResult(context, [step], false, 'artifact-only proof', 'proof');
}

function validateArtifactResult(result, dependencies) {
  dependencies.executionContractAsserter({ wrapperId: 'qa:build', result });
  return result;
}

async function collectValidatedBuild(context, options, dependencies) {
  dependencies.checkpointStateAsserter(context, 'qa:build');
  const closeoutResult = await dependencies.closeoutStepCollector({ context });
  const result = createBuildResult(
    context,
    commitSteps(closeoutResult.steps, options, dependencies, 'commit'),
    false,
    closeoutResult.scopeDetail ?? '',
    options.shouldCommit ? 'commit' : 'default'
  );
  return result;
}

/** Select artifact proof or a fresh full build without duplicating commit guards. */
export async function runBuildForContext({ context, options, dependencies }) {
  if (options.proofOnly) {
    dependencies.checkpointStateAsserter(context, 'qa:build');
    return validateArtifactResult(await collectArtifactProof(context, dependencies), dependencies);
  }
  if (context.targetFiles.length === 0)
    return collectNoProductBuild(context, options, dependencies);
  const result = await collectValidatedBuild(context, options, dependencies);
  return options.shouldCommit ? result : validateArtifactResult(result, dependencies);
}
