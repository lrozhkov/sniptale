import { createOkStep, createSkippedStep } from '../core/focused-qa-results.mjs';
import { HARNESS_QA_GUIDANCE, hasHarnessQaTargets } from '../core/qa-scope.mjs';
import { collectOptionalCommitSteps } from './build.commit-steps.mjs';

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
  dependencies.harnessStateAsserter(context, 'qa:build');
  if (!options.shouldCommit) {
    return createBuildResult(
      context,
      [createOkStep('QA build', 'no product targets; fresh harness stamp')],
      false,
      '',
      'control-validate'
    );
  }
  dependencies.checkpointStateAsserter(context, 'qa:build');
  return createBuildResult(
    context,
    commitSteps(
      [createOkStep('Build', `no product targets; ${HARNESS_QA_GUIDANCE}`)],
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

function hasSuccessfulArtifact(steps) {
  return steps.some((step) => step.label === 'Build' && step.status === 'ok');
}

function persistArtifactState(context, result, dependencies) {
  dependencies.executionContractAsserter({ wrapperId: 'qa:build', result });
  const success = hasSuccessfulArtifact(result.steps);
  dependencies.buildStateWriter(
    dependencies.createBuildState({
      context,
      errorMessage: success ? '' : 'artifact build failed',
      success,
    })
  );
  return result;
}

function collectReusedBuild(context, options, dependencies) {
  dependencies.checkpointStateAsserter(context, 'qa:build --reuse-build');
  dependencies.buildStateAsserter(context, 'qa:build --reuse-build');
  if (context.productTargetFiles.length === 0) {
    throw new Error('qa:build --reuse-build requires product artifact targets');
  }
  return createBuildResult(
    context,
    commitSteps(
      [createSkippedStep('Build', 'fresh artifact build state for unchanged HEAD and diff')],
      options,
      dependencies,
      'reuse-commit'
    ),
    false,
    '',
    'reuse-commit'
  );
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
  return options.shouldCommit ? result : persistArtifactState(context, result, dependencies);
}

/** Select one artifact proof, fresh-build reuse, or full build without duplicating commit guards. */
export async function runBuildForContext({ context, options, dependencies }) {
  if (options.proofOnly) {
    dependencies.checkpointStateAsserter(context, 'qa:build');
    return persistArtifactState(
      context,
      await collectArtifactProof(context, dependencies),
      dependencies
    );
  }
  if (options.reuseBuild) return collectReusedBuild(context, options, dependencies);
  if (context.targetFiles.length === 0)
    return collectNoProductBuild(context, options, dependencies);
  return collectValidatedBuild(context, options, dependencies);
}
