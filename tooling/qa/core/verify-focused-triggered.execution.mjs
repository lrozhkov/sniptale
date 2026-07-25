import { runCanonicalFacadeCheck } from './verify-canonical-facades.mjs';
import { runConfigPolicyCheck } from './verify-config-policy.mjs';
import { runDependencyAdmissionCheck } from '../guards/security/verify-dependency-admission.mjs';
import { runDependencyGraphCheck } from './dependency-graph-runner.mjs';
import { runDesignSystemCheck } from './verify-design-system.mjs';
import {
  recordSuccessfulBoundaryCheck,
  recordSuccessfulCycleCheck,
} from './dependency-graph-cache.mjs';
import {
  shouldRunCanonicalFacades,
  shouldRunConfigPolicy,
  shouldRunDependencyAdmission,
  shouldRunDependencyGraph,
  shouldRunDesignSystem,
  shouldRunFocusedTypecheck,
  shouldRunManifestIntegrity,
} from './verify-focused-triggered.helpers.mjs';
import { runFileScopedTriggeredChecks } from './verify-focused-triggered.file-scoped.mjs';
import { runManifestIntegrityCheck } from './verify-manifest-integrity.mjs';
import { runOssReleaseSurfaceCheck } from './verify-oss-release-surface.mjs';
import { runPackageBoundaryCheck } from './verify-package-boundaries.mjs';
import { runRootSideEffectCheck } from './verify-root-side-effects.mjs';
import {
  collectOwnerGuardStep,
  createDeferredOwnerGuardStep,
} from './owner-guard-step-helpers.mjs';
import {
  createProcessStep,
  createSkippedStep,
  createStringFailureStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { measureAsyncStep, timeSyncStep, withStepDuration } from './step-timing.helpers.mjs';
import { recordSuccessfulTypecheck } from './verify-typecheck-cache.mjs';
import { runTypecheckAsync } from './verify-typecheck.mjs';

function runConditionalRepoScopedCheck({ label, shouldRun, header, runner }) {
  if (!shouldRun) {
    return createSkippedStep(label);
  }

  return createViolationStep(label, header, runner());
}

function runDependencyAdmissionTriggeredStep(targetFiles) {
  return timeSyncStep(() =>
    runConditionalRepoScopedCheck({
      label: 'Dependency admission',
      shouldRun: shouldRunDependencyAdmission(targetFiles),
      header: 'Dependency admission violations found:',
      runner: () => runDependencyAdmissionCheck({ targetFiles }),
    })
  );
}

function runCanonicalFacadeTriggeredStep(targetFiles, qualityTargetFiles) {
  if (!shouldRunCanonicalFacades(targetFiles)) {
    return createSkippedStep('Canonical facades');
  }
  if (qualityTargetFiles.length === 0) {
    return createSkippedStep('Canonical facades', 'no quality targets');
  }
  return createViolationStep(
    'Canonical facades',
    'Canonical facade guardrail violations found:',
    runCanonicalFacadeCheck({ files: qualityTargetFiles })
  );
}

function runCoreOwnerChecks(targetFiles, deferOwnerGuards) {
  return [
    timeSyncStep(() =>
      createViolationStep(
        'Package boundaries',
        'Package boundary violations found:',
        runPackageBoundaryCheck()
      )
    ),
    deferOwnerGuards
      ? createDeferredOwnerGuardStep('appOwners')
      : collectOwnerGuardStep('appOwners'),
    deferOwnerGuards
      ? createDeferredOwnerGuardStep('targetPaths')
      : collectOwnerGuardStep('targetPaths'),
    timeSyncStep(() =>
      createViolationStep(
        'OSS release surface',
        'OSS release surface violations found:',
        runOssReleaseSurfaceCheck()
      )
    ),
    timeSyncStep(() =>
      createViolationStep(
        'Root side effects',
        'Root side-effect violations found:',
        runRootSideEffectCheck({ files: targetFiles })
      )
    ),
  ];
}

function runRepoScopedTriggeredChecks(targetFiles, qualityTargetFiles, deferOwnerGuards) {
  return [
    timeSyncStep(() =>
      runConditionalRepoScopedCheck({
        label: 'Config policy',
        shouldRun: shouldRunConfigPolicy(targetFiles),
        header: 'Config policy violations found:',
        runner: () => runConfigPolicyCheck(),
      })
    ),
    runDependencyAdmissionTriggeredStep(targetFiles),
    timeSyncStep(() =>
      runConditionalRepoScopedCheck({
        label: 'Manifest integrity',
        shouldRun: shouldRunManifestIntegrity(targetFiles),
        header: 'Manifest integrity violations found:',
        runner: () => runManifestIntegrityCheck(),
      })
    ),
    timeSyncStep(() => runCanonicalFacadeTriggeredStep(targetFiles, qualityTargetFiles)),
    ...runCoreOwnerChecks(targetFiles, deferOwnerGuards),
    timeSyncStep(() =>
      shouldRunDesignSystem(targetFiles)
        ? createStringFailureStep(
            'Design system',
            'design-system guardrail violations found:',
            runDesignSystemCheck()
          )
        : createSkippedStep('Design system')
    ),
  ];
}

export async function runDependencyGraphTriggeredChecks(
  targetFiles,
  graphRunner = runDependencyGraphCheck
) {
  if (!shouldRunDependencyGraph(targetFiles)) {
    return [
      timeSyncStep(() => createSkippedStep('Dependency boundaries')),
      timeSyncStep(() => createSkippedStep('Cycles')),
    ];
  }

  const { durationMs, value: graphResult } = await measureAsyncStep(() => graphRunner());
  const boundaryStep = withStepDuration(
    createProcessStep('Dependency boundaries', graphResult.boundary),
    durationMs
  );
  if (boundaryStep.status === 'ok') {
    recordSuccessfulBoundaryCheck({ targetFiles, source: 'focused' });
  }

  const cycleStep = withStepDuration(
    createStringFailureStep(
      'Cycles',
      'Circular dependencies found:',
      graphResult.cycles.map((cycle) => cycle.join(' -> '))
    ),
    durationMs
  );
  if (cycleStep.status === 'ok') {
    recordSuccessfulCycleCheck({ targetFiles, source: 'focused' });
  }

  return [boundaryStep, cycleStep];
}

export async function runFocusedTypecheckStep(typecheckTargetFiles, { maxConcurrency = 2 } = {}) {
  if (!shouldRunFocusedTypecheck(typecheckTargetFiles)) {
    return timeSyncStep(() => createSkippedStep('Typecheck'));
  }

  const { durationMs, value: result } = await measureAsyncStep(() =>
    runTypecheckAsync({ maxConcurrency, mode: 'affected', targetFiles: typecheckTargetFiles })
  );
  const step = withStepDuration(
    (() => {
      const processStep = createProcessStep('Typecheck', result);
      return {
        ...processStep,
        checkedProjectIds: result.checkedProjectIds,
        detail:
          processStep.status === 'ok'
            ? `${result.typecheckMode}: ${result.checkedProjectIds.join(', ')}`
            : processStep.detail,
        typecheckMode: result.typecheckMode,
      };
    })(),
    durationMs
  );
  if (step.status === 'ok') {
    recordSuccessfulTypecheck({
      checkedProjectIds: step.checkedProjectIds,
      mode: step.typecheckMode,
      targetFiles: typecheckTargetFiles,
      source: 'focused',
    });
  }

  return step;
}

export async function runFocusedTriggeredChecks({
  targetFiles,
  qualityTargetFiles = targetFiles,
  typecheckTargetFiles = targetFiles,
  jsLikeFiles,
  graphRunner = runDependencyGraphCheck,
}) {
  return [
    ...runFocusedTriggeredStaticChecks({
      targetFiles,
      qualityTargetFiles,
      jsLikeFiles,
    }),
    ...(await runDependencyGraphTriggeredChecks(targetFiles, graphRunner)),
    await runFocusedTypecheckStep(typecheckTargetFiles),
  ];
}

export function runFocusedTriggeredStaticChecks({
  deferOwnerGuards = false,
  targetFiles,
  qualityTargetFiles = targetFiles,
  jsLikeFiles,
}) {
  return [
    ...runFileScopedTriggeredChecks(targetFiles, jsLikeFiles),
    ...runRepoScopedTriggeredChecks(targetFiles, qualityTargetFiles, deferOwnerGuards),
  ];
}
