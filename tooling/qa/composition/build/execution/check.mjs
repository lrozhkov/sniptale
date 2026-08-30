import { runRepoWideRootSideEffectCheck } from '../../../guards/quality/root-side-effects/check.mjs';
import { runArchitectureGuardrailCheck } from '../../../guards/architecture/architecture-guardrails/check.mjs';
import { resolveBuildCloseoutScope } from '../scope/scope.mjs';
import {
  collectBoundaryCheckStepResult,
  collectCycleCheckStepResult,
  collectDependencyGraphStepResults,
  collectTypecheckStepResult,
  collectUnitTestAndCoverageStepResults,
} from '../../repository/full-verification/test-steps.mjs';
import {
  appendBuildStepOrBlock,
  collectBuildStep,
  collectMeasuredViolationStep,
  collectNamingStep,
  collectSecurityStep,
} from '../../closeout/closeout-step-helpers/check.mjs';
import { PRODUCT_QA_SUITE } from '../../scope/qa-scope.mjs';
import { resolveProductUnitTestPool } from '../../../proof/unit/verify-unit-tests.mjs';
import { collectScheduledBuildStepResults } from '../scheduler-worker/scheduler.mjs';

function createStaticCollectors() {
  return {
    collectArchitectureGuardrailStep: () =>
      collectMeasuredViolationStep(
        'Architecture guardrails',
        'Architecture guardrail violations found:',
        () => runArchitectureGuardrailCheck({ scope: 'repo-wide' })
      ),
    collectBoundaryStep: ({ targetFiles }) => collectBoundaryCheckStepResult({ targetFiles }),
    collectCycleStep: ({ targetFiles }) => collectCycleCheckStepResult({ targetFiles }),
    collectDependencyGraphSteps: ({ targetFiles }) =>
      collectDependencyGraphStepResults({ targetFiles, cacheSource: 'build' }),
    collectNamingStep,
    collectRootSideEffectsStep: () =>
      collectMeasuredViolationStep(
        'Root side effects',
        'Root side-effect violations found:',
        runRepoWideRootSideEffectCheck
      ),
    collectSecurityStep: ({ codeFiles }) => collectSecurityStep({ files: codeFiles }),
    collectTypecheckStep: ({ checkerCount, targetFiles }) =>
      collectTypecheckStepResult({ checkerCount, targetFiles }),
  };
}

async function collectDependencyGraphSteps(context, buildScope, collectors) {
  return collectors.collectDependencyGraphSteps
    ? collectors.collectDependencyGraphSteps(context, buildScope)
    : [
        await collectors.collectBoundaryStep(context, buildScope),
        await collectors.collectCycleStep(context, buildScope),
      ];
}

async function collectUnitAndCoverageSteps({ codeFiles, maxWorkers, targetFiles, buildScope }) {
  const [unitTestStep] = await collectUnitTestAndCoverageStepResults({
    cacheSource: 'build',
    codeFiles,
    coverageDetailOverride: 'coverage handled by ci:release',
    coverageEnabled: false,
    directFilesOverride: buildScope.testScope.directTestFiles,
    fullSuiteOverride: buildScope.testScope.fullSuite,
    maxWorkers,
    pool: resolveProductUnitTestPool(),
    requireRelatedTestsOverride: buildScope.testScope.requireRelatedTests,
    relatedFilesOverride: buildScope.testScope.relatedFiles,
    releaseMode: false,
    suite: PRODUCT_QA_SUITE,
    targetFiles,
    unitTestDetailOverride: buildScope.testScope.detail,
  });
  return [unitTestStep];
}

function createDefaultCollectors() {
  return {
    ...createStaticCollectors(),
    collectBuildStep,
    collectUnitAndCoverageSteps,
  };
}

export async function collectBuildLane({
  context,
  buildScope,
  lane,
  typecheckCheckerCount,
  vitestMaxWorkers,
}) {
  const collectors = createDefaultCollectors();
  if (lane === 'static') {
    return {
      namingStep: collectors.collectNamingStep(context, buildScope),
      architectureStep: collectors.collectArchitectureGuardrailStep(context, buildScope),
      rootSideEffectsStep: collectors.collectRootSideEffectsStep(context, buildScope),
    };
  }
  if (lane === 'security') {
    return { securityStep: await collectors.collectSecurityStep(context, buildScope) };
  }
  if (lane === 'graph') {
    return {
      dependencySteps: await collectors.collectDependencyGraphSteps(context, buildScope),
    };
  }
  if (lane === 'typecheck') {
    return {
      typecheckStep: collectors.collectTypecheckStep({
        ...context,
        checkerCount: typecheckCheckerCount,
      }),
    };
  }
  if (lane === 'tests') {
    return {
      testSteps: await collectUnitAndCoverageSteps({
        buildScope,
        codeFiles: context.codeFiles,
        maxWorkers: vitestMaxWorkers,
        targetFiles: context.targetFiles,
      }),
    };
  }
  throw new Error(`Unknown build QA lane: ${lane}`);
}

async function collectCoreBuildSteps(context, buildScope, collectors) {
  return [
    collectors.collectNamingStep(context, buildScope),
    await collectors.collectSecurityStep(context, buildScope),
    collectors.collectArchitectureGuardrailStep(context, buildScope),
    ...(await collectDependencyGraphSteps(context, buildScope, collectors)),
    collectors.collectRootSideEffectsStep(context, buildScope),
    collectors.collectTypecheckStep(context, buildScope),
    ...(await collectors.collectUnitAndCoverageSteps({
      codeFiles: context.codeFiles,
      targetFiles: context.targetFiles,
      buildScope,
    })),
  ];
}

function appendBuildStep(steps, context, collectors) {
  return appendBuildStepOrBlock(steps, context, collectors);
}

export async function collectBuildCloseoutStepResults({ context, collectors = {} } = {}) {
  const buildScope = resolveBuildCloseoutScope(context);
  if (Object.keys(collectors).length === 0) {
    const steps = await collectScheduledBuildStepResults({ buildScope, context });
    await appendBuildStep(steps, context, createDefaultCollectors());
    return { scopeDetail: buildScope.testScope.detail, steps };
  }
  const resolvedCollectors = {
    ...createDefaultCollectors(),
    ...collectors,
  };
  if (
    !collectors.collectDependencyGraphSteps &&
    (collectors.collectBoundaryStep || collectors.collectCycleStep)
  ) {
    resolvedCollectors.collectDependencyGraphSteps = null;
  }

  const steps = await collectCoreBuildSteps(context, buildScope, resolvedCollectors);
  await appendBuildStep(steps, context, resolvedCollectors);

  return {
    scopeDetail: buildScope.testScope.detail,
    steps,
  };
}
