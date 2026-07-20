import { collectAiLimitReport } from './ai-limit-utils.mjs';
import { collectAuditStep, collectOptionalSecurityStep } from './full-verify-audit-steps.mjs';
import { runDesignSystemCheck } from './verify-design-system.mjs';
import { lintWithEslint } from './verify-eslint.mjs';
import {
  createFailureStep,
  createOkStep,
  createViolationStep,
  createSkippedStep,
} from './focused-qa-results.mjs';
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

async function collectEslintStep(context = {}) {
  const files = resolveStaticProductLintFiles(context);
  if (files.length === 0) {
    return createSkippedStep('ESLint', 'no product lint files');
  }

  const { durationMs, value: eslintResult } = await measureAsyncStep(() =>
    lintWithEslint({ files, strict: true })
  );
  return eslintResult.failed
    ? createFailureStep('ESLint', 'failed', {
        stdout: eslintResult.output,
        durationMs,
      })
    : withDuration(createOkStep('ESLint'), durationMs);
}

function collectAiLimitsStep({ baseline, codeFiles }) {
  const { durationMs, value: aiReport } = measureSyncStep(() => collectAiLimitReport(codeFiles));
  return withDuration(
    createViolationStep('AI limits', 'AI limit violations found:', {
      violations: filterAllowedViolations(aiReport.violations, baseline),
    }),
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
    collectEslintStep,
    collectSonarjsReleaseStep,
    collectAiLimitsStep,
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
    collectTypecheckStep: ({ targetFiles }) => collectTypecheckStepResult({ targetFiles }),
    collectDeadExportsStep,
    collectUnitAndCoverageSteps: ({ codeFiles, releaseMode, targetFiles }) =>
      collectUnitTestAndCoverageStepResults({
        codeFiles,
        coverageEnabled: false,
        pool: resolveProductUnitTestPool(),
        releaseMode,
        suite: PRODUCT_QA_SUITE,
        targetFiles,
      }),
    collectBuildStep,
    collectReleaseArchiveStep,
  };
}

async function collectDependencyGraphSteps(context, collectors) {
  return collectors.collectDependencyGraphSteps
    ? collectors.collectDependencyGraphSteps(context)
    : [await collectors.collectBoundaryStep(context), await collectors.collectCycleStep(context)];
}

async function collectCoreStepResults(context, collectors) {
  const steps = [
    collectors.collectLineLengthStep(context),
    collectors.collectOxlintStep(context),
    await collectors.collectEslintStep(context),
    ...(context.releaseMode ? [await collectors.collectSonarjsReleaseStep(context)] : []),
    collectors.collectAiLimitsStep(context),
    collectors.collectNamingStep(context),
    ...collectors.collectViolationSteps(context),
    collectors.collectI18nStep(context),
    collectors.collectDesignSystemStep(context),
    collectors.collectAuditStep(context),
    await collectors.collectSecurityStep(context),
    ...(await collectDependencyGraphSteps(context, collectors)),
    collectors.collectTypecheckStep(context),
    collectors.collectDeadExportsStep(context),
    ...(await collectors.collectUnitAndCoverageSteps(context)),
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
  const steps = await collectCoreStepResults(context, resolvedCollectors);
  await appendPostVerifySteps(steps, context, resolvedCollectors);

  return {
    scopeDetail: collectUnitTestScopeDetail(context),
    steps,
  };
}
