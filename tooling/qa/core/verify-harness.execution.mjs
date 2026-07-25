import { collectAiHygieneReport } from './ai-hygiene-utils.mjs';
import { retiredControlErrors } from './retired-controls/validation.mjs';
import { runQaControlCheck } from './verify-qa-controls.mjs';
import { verifyTechnicalDebtReport } from './technical-debt-report.mjs';
import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { filterAllowedViolations, loadBaseline } from './shared.mjs';
import { HARNESS_QA_SUITE } from './qa-scope.mjs';
import { measureAsyncStep, measureSyncStep } from './step-timing.helpers.mjs';
import { runLineLengthCheck } from '../guards/quality/verify-line-length.mjs';
import { lintWithEslint } from './verify-eslint.mjs';
import { runOxlint } from './verify-oxlint.mjs';
import { runPrettierCheck } from './verify-prettier.mjs';
import { runQaRuleCoverageContractCheck } from './verify-qa-rule-coverage-contract.mjs';
import { runTypecheck } from './verify-typecheck.mjs';
import { runUnitTests } from './verify-unit-tests.mjs';
import { expandRelatedTestScope } from './unit-test-plan.mjs';
import { runDependencyAdmissionCheck } from '../guards/security/verify-dependency-admission.mjs';
import { collectRuntimeListenerStep } from './verify-harness.runtime-listener-step.mjs';
import { runStructuralRiskCheck } from './verify-structural-risk.mjs';
import { runReadSafeNamingCheck } from './verify-read-safe-naming.mjs';
import { collectAuditStep } from './full-verify-audit-steps.mjs';
import { collectScheduledHarnessStepResults } from './verify-harness.scheduler.mjs';

function collectMeasuredViolationStep(label, header, runner) {
  const { durationMs, value } = measureSyncStep(runner);
  return { ...createViolationStep(label, header, value), durationMs };
}

function collectPrettierStep(context) {
  return measureAsyncStep(async () => {
    const result = await runPrettierCheck(context.existingTargetFiles);
    if (result.checkedFiles.length === 0) {
      return createSkippedStep('Format');
    }
    if (result.failures.length > 0) {
      return createFailureStep('Format', 'formatting violations found', {
        stderr: result.failures.map((file) => `- ${file}\n`).join(''),
      });
    }

    return createOkStep('Format', `checked=${result.checkedFiles.length}`);
  }).then(({ durationMs, value }) => ({ ...value, durationMs }));
}

function collectLineLengthStep(context) {
  return collectMeasuredViolationStep(
    'Changed-line readability',
    'Changed-line length violations found:',
    () =>
      runLineLengthCheck({
        scope: 'workspace',
        files: context.qualityCodeFiles ?? context.codeFiles,
      })
  );
}

function collectAiHygieneStep(context, baseline) {
  const codeFiles = context.qualityCodeFiles ?? context.codeFiles;
  const { durationMs, value } = measureSyncStep(() =>
    codeFiles.length === 0
      ? { skipped: true, violations: [] }
      : {
          skipped: false,
          violations: filterAllowedViolations(
            collectAiHygieneReport(codeFiles).violations,
            baseline
          ),
        }
  );
  return {
    ...createViolationStep('AI hygiene', 'AI hygiene violations found:', value),
    durationMs,
  };
}

function collectStructuralRiskStep(context) {
  return collectMeasuredViolationStep('Structural risk', 'Structural risk violations found:', () =>
    runStructuralRiskCheck({
      files: context.qualityCodeFiles ?? context.codeFiles,
      reportScope: 'current-diff',
      enforce: true,
    })
  );
}

function collectReadSafeNamingStep(context) {
  return collectMeasuredViolationStep(
    'Read-safe naming',
    'Read-safe naming violations found:',
    () =>
      runReadSafeNamingCheck({
        files: context.qualityCodeFiles ?? context.codeFiles,
        scope: 'workspace',
      })
  );
}

function collectQaRuleCoverageContractStep(context) {
  return collectMeasuredViolationStep(
    'QA rule coverage contract',
    'QA rule coverage contract violations found:',
    () => runQaRuleCoverageContractCheck({ files: context.harnessTargetFiles, scope: 'workspace' })
  );
}

function collectQaControlStep() {
  return collectMeasuredViolationStep(
    'QA control inventory',
    'QA control inventory violations found:',
    runQaControlCheck
  );
}

function collectTechnicalDebtStep() {
  return collectMeasuredViolationStep(
    'Technical debt registry',
    'Technical debt violations found:',
    () => ({ skipped: false, violations: verifyTechnicalDebtReport() })
  );
}

async function collectEslintStep(context) {
  const jsLikeFiles = context.qualityJsLikeFiles ?? context.jsLikeFiles;
  if (jsLikeFiles.length === 0) {
    return createSkippedStep('ESLint');
  }

  const { durationMs, value } = await measureAsyncStep(() =>
    lintWithEslint({ files: jsLikeFiles, strict: true })
  );
  return value.failed
    ? createFailureStep('ESLint', 'failed', { stdout: value.output, durationMs })
    : { ...createOkStep('ESLint'), durationMs };
}

function collectTypecheckStep(context) {
  if (context.jsLikeFiles.length === 0) {
    return createSkippedStep('Typecheck');
  }

  const { durationMs, value } = measureSyncStep(() => runTypecheck());
  return value.status === 0
    ? { ...createOkStep('Typecheck'), durationMs }
    : createFailureStep('Typecheck', 'failed', {
        stdout: value.stdout,
        stderr: value.stderr,
        durationMs,
      });
}

function collectRetiredControlStep() {
  const errors = retiredControlErrors();
  return errors.length === 0
    ? createOkStep('Retired controls')
    : createFailureStep('Retired controls', 'retired controls are active', {
        stderr: errors.map((error) => '- ' + error + '\n').join(''),
      });
}

function collectDependencyAdmissionStep(context) {
  return collectMeasuredViolationStep(
    'Dependency admission',
    'Dependency admission violations found:',
    () => runDependencyAdmissionCheck({ files: context.harnessTargetFiles })
  );
}

async function collectUnitTestStep(context, { maxWorkers }) {
  const request = createHarnessUnitTestRequest(context, { maxWorkers });
  if ((request.directFiles ?? request.relatedFiles).length === 0) {
    return createSkippedStep('Unit tests', 'no executable changed harness files');
  }

  const { durationMs, value } = await measureAsyncStep(() => runUnitTests(request));
  return value.status === 0
    ? { ...createOkStep('Unit tests', 'related harness suite'), durationMs }
    : createFailureStep('Unit tests', 'failed', {
        stdout: value.stdout,
        stderr: value.stderr,
        durationMs,
      });
}

// Run only the affected harness test closure.
export function createHarnessUnitTestRequest(context, { maxWorkers = 1 } = {}) {
  const relatedFiles = context.harnessTargetFiles.filter((file) => !file.endsWith('.md'));
  const directFiles = expandRelatedTestScope(relatedFiles).filter((file) =>
    /\.(?:test|spec)\.(?:ts|tsx)$/u.test(file)
  );
  return {
    ...(directFiles.length > 0 ? { directFiles } : { relatedFiles }),
    maxWorkers,
    suite: HARNESS_QA_SUITE,
  };
}

const DEPENDENCY_AUDIT_TARGETS = new Set(['package-lock.json', 'package.json']);

export function shouldRunHarnessAudit(targetFiles = []) {
  return targetFiles.some((file) => DEPENDENCY_AUDIT_TARGETS.has(file));
}

function collectHarnessAuditStep(context) {
  return shouldRunHarnessAudit(context.harnessTargetFiles)
    ? collectAuditStep()
    : createSkippedStep('Audit', 'dependency authority unchanged');
}

export async function collectHarnessStaticLane(
  context,
  { baseline = context.baseline ?? loadBaseline(), collectors = {} } = {}
) {
  const resolvedCollectors = {
    collectOxlintStep: (nextContext) =>
      runOxlint({ files: nextContext.qualityJsLikeFiles ?? nextContext.jsLikeFiles }).step,
    collectEslintStep,
    collectLineLengthStep,
    collectAiHygieneStep,
    collectStructuralRiskStep,
    collectReadSafeNamingStep,
    collectQaRuleCoverageContractStep,
    collectQaControlStep,
    collectTechnicalDebtStep,
    collectHarnessAuditStep,
    ...collectors,
  };

  return {
    steps: [
      resolvedCollectors.collectOxlintStep(context),
      await resolvedCollectors.collectEslintStep(context),
      resolvedCollectors.collectLineLengthStep(context),
      resolvedCollectors.collectAiHygieneStep(context, baseline),
      resolvedCollectors.collectStructuralRiskStep(context),
      resolvedCollectors.collectReadSafeNamingStep(context),
      resolvedCollectors.collectQaRuleCoverageContractStep(context),
      resolvedCollectors.collectQaControlStep(),
      resolvedCollectors.collectTechnicalDebtStep(),
      collectRetiredControlStep(),
      collectDependencyAdmissionStep(context),
      resolvedCollectors.collectHarnessAuditStep(context),
      collectRuntimeListenerStep(context),
    ],
  };
}

export function collectHarnessTypecheckLane(context) {
  return { typecheckStep: collectTypecheckStep(context) };
}

export async function collectHarnessTestLane(context, { maxWorkers }) {
  return { unitTestStep: await collectUnitTestStep(context, { maxWorkers }) };
}

export async function collectHarnessStepResults({
  baseline = loadBaseline(),
  context,
  collectors = {},
  scheduledStepCollector = collectScheduledHarnessStepResults,
} = {}) {
  if ((context.harnessVerificationTargetFiles ?? context.harnessTargetFiles).length === 0) {
    return {
      skipped: true,
      steps: [
        createOkStep(
          'QA release harness',
          context.harnessTargetFiles.length > 0
            ? 'data-only inventory does not require harness execution'
            : 'no changed harness files'
        ),
      ],
    };
  }

  const formatStep = await (collectors.collectPrettierStep ?? collectPrettierStep)(context);
  if (formatStep.status === 'failed') {
    return { skipped: false, steps: [formatStep] };
  }
  const scheduledSteps = await scheduledStepCollector({ ...context, baseline });
  const steps = [formatStep, ...scheduledSteps];

  return {
    skipped: false,
    steps: steps.map((step) =>
      step.label === 'Oxlint' && step.durationMs == null ? { ...step, durationMs: 0 } : step
    ),
  };
}
