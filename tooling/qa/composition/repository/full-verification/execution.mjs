import { collectAiHygieneReport } from '../../quality/ai-hygiene.mjs';
import { collectAuditStep, collectOptionalSecurityStep } from './catalog/audit-steps.mjs';
import { runDesignSystemCheck } from '../../../guards/product-contracts/verify-design-system.mjs';
import { peekUnifiedAstGrepReceipt } from '../../../audits/ast-grep/unified-ast-grep.mjs';
import { createViolationStep, createSkippedStep } from '../../checkpoint/focused-qa-results.mjs';
import { runI18nCheck } from '../../../guards/product-contracts/verify-i18n.mjs';
import { runLineLengthCheck } from '../../../guards/quality/readability/line-length/check.mjs';
import { DEFAULT_OXLINT_ROOTS, runOxlint } from '../../../guards/quality/verify-oxlint.mjs';
import {
  collectBoundaryCheckStepResult,
  collectCycleCheckStepResult,
  collectDependencyGraphStepResults,
  collectTypecheckStepResult,
  collectUnitTestAndCoverageStepResults,
} from './test-steps.mjs';
import { resolveFullVerifyScope } from './scope.mjs';
import { collectViolationSteps } from './catalog/violation-steps.mjs';
import {
  filterAllowedViolations,
  loadBaseline,
} from '../../../policy/baselines/shared-baseline.mjs';
import {
  measureAsyncStep,
  measureSyncStep,
} from '../../../runtime/observability/step-timing.helpers.mjs';
import { runSonarjsCheck } from '../../../guards/quality/sonarjs/check.mjs';
import { runStructuralRiskCheck } from '../../../analysis/structural-risk/check.mjs';
import { projectLoggingStepFromOxlint } from '../../quality/logging-projection.mjs';
import {
  appendBuildStepOrBlock,
  appendReleaseArchiveStepOrBlock,
  collectBuildStep,
  collectDeadExportsStep,
  collectReleaseArchiveStep,
  collectMeasuredStringFailureStep,
  collectNamingStep,
  withDuration,
} from '../../closeout/closeout-step-helpers/check.mjs';
import { PRODUCT_QA_SUITE } from '../../scope/qa-scope.mjs';
import { resolveProductUnitTestPool } from '../../../proof/unit/verify-unit-tests.mjs';
import { collectScheduledFullVerifySteps } from './scheduler.mjs';
import { collectOwnerGuardStep } from '../../shared/owner-guard-step-helpers.mjs';

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

function resolveStaticLintFiles({ codeFiles = [], releaseMode = false } = {}) {
  return releaseMode ? DEFAULT_OXLINT_ROOTS : codeFiles;
}

function collectOxlintLane(context = {}) {
  const { durationMs, value: result } = measureSyncStep(() =>
    runOxlint({
      files: resolveStaticLintFiles(context),
      strictSecurity: context.releaseMode === true,
      threads: context.oxlintThreadCount ?? null,
    })
  );
  const oxlintStep = withDuration(result.step, durationMs);
  return {
    loggingStep: projectLoggingStepFromOxlint({
      step: oxlintStep,
      files: resolveStaticLintFiles(context),
      lintedFiles: result.targetFiles,
    }),
    oxlintStep,
  };
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
    runStructuralRiskCheck({
      files: codeFiles,
      reportScope: 'current-diff',
      enforce: true,
    })
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
    oxlintCollector = collectOxlintLane,
    securityCollector = collectOptionalSecurityStep,
    sonarjsCollector = collectSonarjsReleaseStep,
  } = {}
) {
  const oxlintResult = oxlintCollector(context);
  const normalizedOxlintResult = oxlintResult.oxlintStep
    ? oxlintResult
    : {
        loggingStep: projectLoggingStepFromOxlint({
          step: oxlintResult,
          files: resolveStaticLintFiles(context),
          lintedFiles: oxlintResult.targetFiles,
        }),
        oxlintStep: oxlintResult,
      };
  return {
    ...normalizedOxlintResult,
    sonarjsStep: (context.excludedControlLabels ?? []).includes('SonarJS')
      ? null
      : await sonarjsCollector(context),
    securityStep: await securityCollector(context),
  };
}

function createReleaseContext({ releaseMode, verifyScope, baseline, excludedControlLabels = [] }) {
  return {
    releaseMode,
    verifyScope,
    baseline,
    excludedControlLabels,
    codeFiles: verifyScope.codeFiles,
    targetFiles: verifyScope.targetFiles,
  };
}

function createDefaultCollectors() {
  return {
    collectLineLengthStep,
    collectOxlintLane,
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
        () => runDesignSystemCheck({ astGrepReceipt: peekUnifiedAstGrepReceipt() })
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
    collectUnitAndCoverageSteps: ({
      codeFiles,
      releaseMode,
      reuseUnitProof,
      targetFiles,
      vitestMaxWorkers,
    }) =>
      collectUnitTestAndCoverageStepResults({
        codeFiles,
        coverageEnabled: false,
        maxWorkers: vitestMaxWorkers ?? null,
        pool: resolveProductUnitTestPool(),
        releaseMode,
        reuseProof: reuseUnitProof ?? true,
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
  oxlintThreadCount,
  typecheckCheckerCount,
  vitestMaxWorkers,
}) {
  const collectors = createDefaultCollectors();
  const laneContext = { ...context, oxlintThreadCount, vitestMaxWorkers };
  if (lane === 'appOwners' || lane === 'targetPaths') {
    return { ownerStep: collectOwnerGuardStep(lane) };
  }
  if (lane === 'light') {
    return {
      lineLengthStep: context.excludedControlLabels.includes('Changed-line readability')
        ? null
        : collectors.collectLineLengthStep(context),
      aiHygieneStep: collectors.collectAiHygieneStep(context),
      structuralRiskStep: context.excludedControlLabels.includes('Structural risk')
        ? null
        : collectors.collectStructuralRiskStep(context),
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
      ? collectReleaseLintLane(laneContext)
      : {
          ...collectors.collectOxlintLane(laneContext),
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
    return {
      testSteps: await collectors.collectUnitAndCoverageSteps(laneContext),
    };
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
    ...(context.excludedControlLabels.includes('Changed-line readability')
      ? []
      : [collectors.collectLineLengthStep(context)]),
    collectors.collectOxlintStep(context),
    ...(context.releaseMode && !context.excludedControlLabels.includes('SonarJS')
      ? [await collectors.collectSonarjsReleaseStep(context)]
      : []),
    collectors.collectAiHygieneStep(context),
    ...(context.excludedControlLabels.includes('Structural risk')
      ? []
      : [collectors.collectStructuralRiskStep(context)]),
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
  includeArtifactSteps = true,
  releaseMode = false,
  verifyScope = resolveFullVerifyScope(),
  baseline = loadBaseline(),
  excludedControlLabels = [],
  collectors = {},
} = {}) {
  const context = createReleaseContext({
    releaseMode,
    verifyScope,
    baseline,
    excludedControlLabels,
  });
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
  if (includeArtifactSteps) await appendPostVerifySteps(steps, context, resolvedCollectors);

  return {
    scopeDetail: includeTests
      ? collectUnitTestScopeDetail(context)
      : 'full Vitest supplied by the Fast Gate prerequisite',
    steps,
  };
}

export async function collectReleaseDeltaStepResults({
  verifyScope = resolveFullVerifyScope(),
  baseline = loadBaseline(),
  excludedControlLabels = [],
  includeArtifactSteps = true,
  collectors = {},
} = {}) {
  const context = createReleaseContext({
    releaseMode: true,
    verifyScope,
    baseline,
    excludedControlLabels,
  });
  const resolvedCollectors = { ...createDefaultCollectors(), ...collectors };
  const steps = context.excludedControlLabels.includes('SonarJS')
    ? []
    : [await resolvedCollectors.collectSonarjsReleaseStep(context)];
  if (includeArtifactSteps) await appendPostVerifySteps(steps, context, resolvedCollectors);
  return {
    scopeDetail: 'verified Fast proof plus release-only product controls',
    steps,
  };
}
