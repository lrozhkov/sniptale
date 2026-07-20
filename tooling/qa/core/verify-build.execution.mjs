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

async function collectUnitAndCoverageSteps({ codeFiles, targetFiles, buildScope }) {
  return collectUnitTestAndCoverageStepResults({
    cacheSource: 'build',
    codeFiles,
    coverageDetailOverride: 'coverage handled by qa:audit',
    coverageEnabled: false,
    directFilesOverride: buildScope.testScope.directTestFiles,
    fullSuiteOverride: buildScope.testScope.fullSuite,
    pool: resolveProductUnitTestPool(),
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
