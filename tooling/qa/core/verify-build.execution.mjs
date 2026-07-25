import { runCanonicalFacadeCheck } from './verify-canonical-facades.mjs';
import { runRepoWideRootSideEffectCheck } from './verify-root-side-effects.mjs';
import { runArchitectureGuardrailCheck } from './verify-architecture-guardrails.mjs';
import { resolveBuildCloseoutScope } from './verify-build.scope.mjs';
import {
  collectBoundaryCheckStepResult,
  collectCycleCheckStepResult,
  collectDependencyGraphStepResults,
  collectTypecheckStepResult,
  collectUnitTestAndCoverageStepResults,
} from './verify-all.test-steps.mjs';
import {
  appendBuildStepOrBlock,
  collectBuildStep,
  collectMeasuredViolationStep,
  collectNamingStep,
  collectSecurityStep,
} from './verify-closeout-step-helpers.mjs';
import { PRODUCT_QA_SUITE } from './qa-scope.mjs';
import { resolveProductUnitTestPool } from './verify-unit-tests.mjs';
import { collectScheduledBuildStepResults } from './verify-build.scheduler.mjs';

function createStaticCollectors() {
  return {
    collectArchitectureGuardrailStep: () =>
      collectMeasuredViolationStep(
        'Architecture guardrails',
        'Architecture guardrail violations found:',
        () => runArchitectureGuardrailCheck({ scope: 'repo-wide' })
      ),
    collectBoundaryStep: ({ targetFiles }) => collectBoundaryCheckStepResult({ targetFiles }),
    collectCanonicalFacadeStep: () =>
      collectMeasuredViolationStep(
        'Canonical facades',
        'Canonical facade guardrail violations found:',
        runCanonicalFacadeCheck
      ),
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
    collectTypecheckStep: ({ targetFiles }) => collectTypecheckStepResult({ targetFiles }),
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
  return collectUnitTestAndCoverageStepResults({
    cacheSource: 'build',
    codeFiles,
    coverageDetailOverride: 'coverage handled by qa:audit',
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
}

function createDefaultCollectors() {
  return {
    ...createStaticCollectors(),
    collectBuildStep,
    collectUnitAndCoverageSteps,
  };
}

export async function collectBuildLane({ context, buildScope, lane, vitestMaxWorkers }) {
  const collectors = createDefaultCollectors();
  if (lane === 'static') {
    return {
      namingStep: collectors.collectNamingStep(context, buildScope),
      architectureStep: collectors.collectArchitectureGuardrailStep(context, buildScope),
      canonicalFacadeStep: collectors.collectCanonicalFacadeStep(context, buildScope),
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
    return { typecheckStep: collectors.collectTypecheckStep(context, buildScope) };
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
    collectors.collectCanonicalFacadeStep(context, buildScope),
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
