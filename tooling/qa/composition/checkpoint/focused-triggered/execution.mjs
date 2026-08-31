import { runConfigPolicyCheck } from '../../../guards/product-contracts/config/config-policy/check.mjs';
import { runExtensionBuildLayoutCheck } from '../../../guards/product-contracts/extension-build/verify-extension-build-layout.mjs';
import { runDependencyAdmissionCheck } from '../../../guards/security/verify-dependency-admission.mjs';
import { runDependencyGraphCheck } from '../../../analysis/dependency-graph/dependency-graph-runner.mjs';
import { runDesignSystemCheck } from '../../../guards/product-contracts/verify-design-system.mjs';
import { peekUnifiedAstGrepReceipt } from '../../../audits/ast-grep/unified-ast-grep.mjs';
import { runDocumentationFactsCheck } from '../../../policy/documentation/documentation-facts/documentation-facts.mjs';
import {
  recordSuccessfulBoundaryCheck,
  recordSuccessfulCycleCheck,
} from '../../../analysis/dependency-graph/dependency-graph-cache.mjs';
import {
  shouldRunConfigPolicy,
  shouldRunExtensionBuildLayout,
  shouldRunDependencyAdmission,
  shouldRunDependencyGraph,
  shouldRunDesignSystem,
  shouldRunFocusedTypecheck,
  shouldRunManifestIntegrity,
} from './helpers.mjs';
import { runFileScopedTriggeredChecks } from './file-scoped.mjs';
import { runManifestIntegrityCheck } from '../../../guards/product-contracts/manifest-integrity/check.mjs';
import { runOssReleaseSurfaceCheck } from '../../../audits/licenses/oss-release-surface/check.mjs';
import { runPackageBoundaryCheck } from '../../../guards/product-contracts/package-boundaries/check.mjs';
import { runRootSideEffectCheck } from '../../../guards/quality/root-side-effects/check.mjs';
import {
  collectOwnerGuardStep,
  createDeferredOwnerGuardStep,
} from '../../shared/owner-guard-step-helpers.mjs';
import {
  createProcessStep,
  createSkippedStep,
  createStringFailureStep,
  createViolationStep,
} from '../focused-qa-results.mjs';
import {
  measureAsyncStep,
  timeSyncStep,
  withStepDuration,
} from '../../../runtime/observability/step-timing.helpers.mjs';
import { recordSuccessfulTypecheck } from '../../../proof/typecheck/verify-typecheck-cache.mjs';
import { runTypecheckAsync } from '../../../proof/typecheck/execution/check.mjs';

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

function runCoreOwnerChecks(targetFiles, deferOwnerGuards) {
  return [
    timeSyncStep(() =>
      createViolationStep(
        'Documentation facts',
        'Documentation fact violations found:',
        runDocumentationFactsCheck()
      )
    ),
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

function runRepoScopedTriggeredChecks(targetFiles, deferOwnerGuards) {
  return [
    timeSyncStep(() =>
      runConditionalRepoScopedCheck({
        label: 'Config policy',
        shouldRun: shouldRunConfigPolicy(targetFiles),
        header: 'Config policy violations found:',
        runner: () => runConfigPolicyCheck(),
      })
    ),
    timeSyncStep(() =>
      runConditionalRepoScopedCheck({
        label: 'Extension build layout',
        shouldRun: shouldRunExtensionBuildLayout(targetFiles),
        header: 'Extension build layout violations found:',
        runner: () => runExtensionBuildLayoutCheck(),
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
    ...runCoreOwnerChecks(targetFiles, deferOwnerGuards),
    timeSyncStep(() =>
      shouldRunDesignSystem(targetFiles)
        ? createStringFailureStep(
            'Design system',
            'design-system guardrail violations found:',
            runDesignSystemCheck({ astGrepReceipt: peekUnifiedAstGrepReceipt() })
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

export async function runFocusedTypecheckStep(
  typecheckTargetFiles,
  { checkerCount, maxConcurrency = 1 } = {}
) {
  if (!shouldRunFocusedTypecheck(typecheckTargetFiles)) {
    return timeSyncStep(() => createSkippedStep('Typecheck'));
  }

  const { durationMs, value: result } = await measureAsyncStep(() =>
    runTypecheckAsync({
      checkerCount,
      maxConcurrency,
      mode: 'affected',
      targetFiles: typecheckTargetFiles,
    })
  );
  const step = withStepDuration(
    (() => {
      const processStep = createProcessStep('Typecheck', result);
      return {
        ...processStep,
        checkedProjectIds: result.checkedProjectIds,
        detail:
          processStep.status === 'ok'
            ? `${result.typecheckMode}: ${result.checkedProjectIds.join(', ')}; ` +
              `typescript=${result.typecheckToolVersion}; checkers=${result.typecheckCheckerCount}`
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
  typecheckTargetFiles = targetFiles,
  jsLikeFiles,
  graphRunner = runDependencyGraphCheck,
}) {
  return [
    ...runFocusedTriggeredStaticChecks({
      targetFiles,
      jsLikeFiles,
    }),
    ...(await runDependencyGraphTriggeredChecks(targetFiles, graphRunner)),
    await runFocusedTypecheckStep(typecheckTargetFiles),
  ];
}

export function runFocusedTriggeredStaticChecks({
  deferOwnerGuards = false,
  targetFiles,
  jsLikeFiles,
}) {
  return [
    ...runFileScopedTriggeredChecks(targetFiles, jsLikeFiles),
    ...runRepoScopedTriggeredChecks(targetFiles, deferOwnerGuards),
  ];
}
