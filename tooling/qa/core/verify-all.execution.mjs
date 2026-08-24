import { collectAiHygieneReport } from './ai-hygiene-utils.mjs';
import { collectAuditStep, collectOptionalSecurityStep } from './full-verify-audit-steps.mjs';
import { runDesignSystemCheck } from './verify-design-system.mjs';
import { createViolationStep, createSkippedStep } from './focused-qa-results.mjs';
import { runI18nCheck } from './verify-i18n.mjs';
import { runLineLengthCheck } from '../guards/quality/verify-line-length.mjs';
import { runOxlint } from './verify-oxlint.mjs';
import {
  collectBoundaryCheckStepResult,
  collectCycleCheckStepResult,
  collectDependencyGraphStepResults,
  collectTypecheckStepResult,
  collectUnitTestAndCoverageStepResults,
} from './verify-all.test-steps.mjs';
import { resolveFullVerifyScope } from './verify-all.scope.mjs';
import { collectViolationSteps } from './full-verify-violation-steps.mjs';
import { filterAllowedViolations, loadBaseline } from './shared.mjs';
import { measureAsyncStep, measureSyncStep } from './step-timing.helpers.mjs';
import { runSonarjsCheck } from './verify-sonarjs.mjs';
import { runStructuralRiskCheck } from './verify-structural-risk.mjs';
import {
  appendBuildStepOrBlock,
  appendReleaseArchiveStepOrBlock,
  collectBuildStep,
  collectDeadExportsStep,
  collectReleaseArchiveStep,
  collectMeasuredStringFailureStep,
  collectNamingStep,
  withDuration,
} from './verify-closeout-step-helpers.mjs';
import { PRODUCT_QA_SUITE } from './qa-scope.mjs';
import { PRODUCT_SOURCE_ROOTS } from './src-production-targets.mjs';
import { resolveProductUnitTestPool } from './verify-unit-tests.mjs';
import { collectScheduledFullVerifySteps } from './verify-all.scheduler.mjs';
import { collectOwnerGuardStep } from './owner-guard-step-helpers.mjs';

function collectUnitTestScopeDetail({ codeFiles, releaseMode }) {
  return releaseMode
    ? 'release full-suite tests without coverage'
    : `diff-based related tests (${codeFiles.length} changed code file${codeFiles.length === 1 ? '' : 's'})`;
}

function collectLineLengthStep({ codeFiles } = {}) {
  const { durationMs, value: lineLengthResult } = measureSyncStep(() =>
    runLineLengthCheck({ scope: 'workspace', files: codeFiles })
  );
  return withDuration(
    createViolationStep(
      'Changed-line readability',
      'Changed-line length violations found:',
      lineLengthResult
    ),
    durationMs
  );
}

function resolveStaticProductLintFiles({ codeFiles = [], releaseMode = false } = {}) {
  return releaseMode ? PRODUCT_SOURCE_ROOTS : codeFiles;
}

function collectOxlintStep(context = {}) {
  const { durationMs, value: result } = measureSyncStep(() =>
    runOxlint({ files: resolveStaticProductLintFiles(context) })
  );
  return withDuration(result.step, durationMs);
}

function collectAiHygieneStep({ baseline, codeFiles }) {
  const { durationMs, value: report } = measureSyncStep(() => collectAiHygieneReport(codeFiles));
  return withDuration(
    createViolationStep('AI hygiene', 'AI hygiene violations found:', {
      violations: filterAllowedViolations(report.violations, baseline),
    }),
    durationMs
  );
}

function collectStructuralRiskStep({ codeFiles }) {
  const { durationMs, value } = measureSyncStep(() =>
    runStructuralRiskCheck({ files: codeFiles, reportScope: 'current-diff', enforce: true })
  );
  return withDuration(
    createViolationStep('Structural risk', 'Structural risk violations found:', value),
    durationMs
  );
}

async function collectSonarjsReleaseStep({ releaseMode }) {
  if (!releaseMode) {
    return createSkippedStep('SonarJS', 'release-only');
  }

  const { durationMs, value: sonarjsResult } = await measureAsyncStep(() =>
    runSonarjsCheck({ scope: 'repo-wide' })
  );
  return withDuration(
    createViolationStep('SonarJS', 'SonarJS violations found:', sonarjsResult),
    durationMs
  );
}

export async function collectReleaseLintLane(
  context,
  {
    oxlintCollector = collectOxlintStep,
    securityCollector = collectOptionalSecurityStep,
    sonarjsCollector = collectSonarjsReleaseStep,
  } = {}
) {
  return {
    oxlintStep: oxlintCollector(context),
    sonarjsStep: await sonarjsCollector(context),
    securityStep: await securityCollector(context),
  };
}

function createReleaseContext({ releaseMode, verifyScope, baseline }) {
  return {
    releaseMode,
    verifyScope,
    baseline,
    codeFiles: verifyScope.codeFiles,
    targetFiles: verifyScope.targetFiles,
  };
}

function createDefaultCollectors() {
  return {
    collectLineLengthStep,
    collectOxlintStep,
    collectSonarjsReleaseStep,
    collectAiHygieneStep,
    collectStructuralRiskStep,
    collectNamingStep,
    collectViolationSteps,
    collectI18nStep: () =>
      collectMeasuredStringFailureStep('i18n', 'i18n guardrail violations found:', runI18nCheck),
    collectDesignSystemStep: () =>
      collectMeasuredStringFailureStep(
        'Design system',
        'design-system guardrail violations found:',
        runDesignSystemCheck
      ),
    collectAuditStep,
    collectSecurityStep: collectOptionalSecurityStep,
    collectBoundaryStep: ({ targetFiles }) => collectBoundaryCheckStepResult({ targetFiles }),
    collectCycleStep: ({ targetFiles }) => collectCycleCheckStepResult({ targetFiles }),
    collectDependencyGraphSteps: ({ targetFiles }) =>
      collectDependencyGraphStepResults({ targetFiles }),
    collectTypecheckStep: ({ checkerCount, targetFiles }) =>
      collectTypecheckStepResult({ checkerCount, targetFiles }),
    collectDeadExportsStep,
    collectUnitAndCoverageSteps: ({ codeFiles, releaseMode, targetFiles, vitestMaxWorkers }) =>
      collectUnitTestAndCoverageStepResults({
        codeFiles,
        coverageEnabled: false,
        maxWorkers: vitestMaxWorkers ?? null,
        pool: resolveProductUnitTestPool(),
        releaseMode,
        suite: PRODUCT_QA_SUITE,
        targetFiles,
      }),
    collectBuildStep,
    collectReleaseArchiveStep,
  };
}

export async function collectFullVerifyLane({
  context,
  lane,
  typecheckCheckerCount,
  vitestMaxWorkers,
}) {
  const collectors = createDefaultCollectors();
  const laneContext = { ...context, vitestMaxWorkers };
  if (lane === 'appOwners' || lane === 'targetPaths') {
    return { ownerStep: collectOwnerGuardStep(lane) };
  }
  if (lane === 'light') {
    return {
      lineLengthStep: collectors.collectLineLengthStep(context),
      aiHygieneStep: collectors.collectAiHygieneStep(context),
      structuralRiskStep: collectors.collectStructuralRiskStep(context),
      namingStep: collectors.collectNamingStep(context),
      violationSteps: await collectors.collectViolationSteps({
        ...context,
        deferOwnerGuards: true,
      }),
      i18nStep: collectors.collectI18nStep(context),
      designSystemStep: collectors.collectDesignSystemStep(context),
      auditStep: collectors.collectAuditStep(context),
    };
  }
  if (lane === 'lint') {
    return context.releaseMode
      ? collectReleaseLintLane(context)
      : {
          oxlintStep: collectors.collectOxlintStep(context),
          sonarjsStep: null,
          securityStep: await collectors.collectSecurityStep(context),
        };
  }
  if (lane === 'graph') {
    return {
      dependencySteps: await collectors.collectDependencyGraphSteps(context),
      deadExportsStep: collectors.collectDeadExportsStep(context),
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
    return { testSteps: await collectors.collectUnitAndCoverageSteps(laneContext) };
  }
  throw new Error(`Unknown full verification lane: ${lane}`);
}

async function collectDependencyGraphSteps(context, collectors) {
  return collectors.collectDependencyGraphSteps
    ? collectors.collectDependencyGraphSteps(context)
    : [await collectors.collectBoundaryStep(context), await collectors.collectCycleStep(context)];
}

async function collectCoreStepResults(context, collectors, includeTests) {
  const steps = [
    collectors.collectLineLengthStep(context),
    collectors.collectOxlintStep(context),
    ...(context.releaseMode ? [await collectors.collectSonarjsReleaseStep(context)] : []),
    collectors.collectAiHygieneStep(context),
    collectors.collectStructuralRiskStep(context),
    collectors.collectNamingStep(context),
    ...(await collectors.collectViolationSteps(context)),
    collectors.collectI18nStep(context),
    collectors.collectDesignSystemStep(context),
    collectors.collectAuditStep(context),
    await collectors.collectSecurityStep(context),
    ...(await collectDependencyGraphSteps(context, collectors)),
    collectors.collectTypecheckStep(context),
    collectors.collectDeadExportsStep(context),
    ...(includeTests ? await collectors.collectUnitAndCoverageSteps(context) : []),
  ];
  return steps;
}

async function appendPostVerifySteps(steps, context, collectors) {
  await appendBuildStepOrBlock(steps, context, collectors);
  if (context.releaseMode) {
    await appendReleaseArchiveStepOrBlock(steps, collectors);
  }
}

export async function collectFullVerifyStepResults({
  includeTests = true,
  releaseMode = false,
  verifyScope = resolveFullVerifyScope(),
  baseline = loadBaseline(),
  collectors = {},
} = {}) {
  const context = createReleaseContext({ releaseMode, verifyScope, baseline });
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
  const steps =
    Object.keys(collectors).length === 0
      ? await collectScheduledFullVerifySteps(context, { includeTests })
      : await collectCoreStepResults(context, resolvedCollectors, includeTests);
  await appendPostVerifySteps(steps, context, resolvedCollectors);

  return {
    scopeDetail: includeTests
      ? collectUnitTestScopeDetail(context)
      : 'full Vitest deferred to ci:release',
    steps,
  };
}
