import { collectControlDiscovery, readControlPolicy } from '../../control-inventory/discovery.mjs';
import { collectControlPolicyViolations } from '../../control-inventory/policy.mjs';
import { QA_CONTROL_CATALOG } from '../../catalog/catalog.mjs';
import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
  createViolationStep,
} from '../../checkpoint/focused-qa-results.mjs';
import { HARNESS_QA_SUITE } from '../../scope/qa-scope.mjs';
import {
  measureAsyncStep,
  measureSyncStep,
} from '../../../runtime/observability/step-timing.helpers.mjs';
import {
  DEFAULT_OXLINT_ROOTS,
  requiresFullOxlintClosure,
  runOxlint,
} from '../../../guards/quality/verify-oxlint.mjs';
import { runFormatterWrite } from '../../../guards/quality/verify-oxfmt.mjs';
import { runTypecheck } from '../../../proof/typecheck/execution/check.mjs';
import { requiresFullTypecheckControlProof } from '../../../proof/typecheck/typecheck-project-map.mjs';
import { runUnitTests } from '../../../proof/unit/verify-unit-tests.mjs';
import { expandRelatedTestScope } from '../../../proof/unit/unit-test-plan.mjs';
import { runDependencyAdmissionCheck } from '../../../guards/security/verify-dependency-admission.mjs';
import { collectScheduledHarnessStepResults } from './scheduler.mjs';

function collectMeasuredViolationStep(label, header, runner) {
  const { durationMs, value } = measureSyncStep(runner);
  return { ...createViolationStep(label, header, value), durationMs };
}

export function collectHarnessFormatterStep(context, { formatterWriter = runFormatterWrite } = {}) {
  return measureAsyncStep(async () => {
    const result = formatterWriter(context.allExistingTargetFiles ?? context.existingTargetFiles);
    if (result.candidateFiles.length === 0) {
      return createSkippedStep('Format');
    }

    return createOkStep(
      'Format',
      `formatted=${result.writtenFiles.length}; barrier=sequential-before-verification`
    );
  }).then(({ durationMs, value }) => ({ ...value, durationMs }));
}

export function collectCompositionIntegrityViolations({
  catalog = QA_CONTROL_CATALOG,
  discovery = collectControlDiscovery(),
  policy = readControlPolicy(),
  policyOptions,
} = {}) {
  // Importing the catalog validates its identities, proof files, and scheduler metadata.
  if (catalog.length === 0) {
    return [
      {
        rule: 'qa-catalog-empty',
        file: 'tooling/qa/composition/catalog/catalog.data.mjs',
        line: 1,
        message: 'QA catalog must contain at least one control',
      },
    ];
  }
  return collectControlPolicyViolations(discovery, policy, policyOptions);
}

function collectCompositionIntegrityStep() {
  return collectMeasuredViolationStep(
    'QA composition integrity',
    'QA composition integrity violations found:',
    () => ({ skipped: false, violations: collectCompositionIntegrityViolations() })
  );
}

function collectTypecheckStep(context, { checkerCount } = {}) {
  if (!shouldRunHarnessTypecheck(context)) {
    return createSkippedStep('Typecheck');
  }

  const { durationMs, value } = measureSyncStep(() => runTypecheck({ checkerCount }));
  return value.status === 0
    ? {
        ...createOkStep(
          'Typecheck',
          `typescript=${value.typecheckToolVersion}; checkers=${value.typecheckCheckerCount}`
        ),
        durationMs,
      }
    : createFailureStep('Typecheck', 'failed', {
        stdout: value.stdout,
        stderr: value.stderr,
        durationMs,
      });
}

export function shouldRunHarnessTypecheck(context) {
  return requiresFullTypecheckControlProof(context.harnessTargetFiles);
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

export async function collectHarnessStaticLane(context, { collectors = {} } = {}) {
  const resolvedCollectors = {
    collectCompositionIntegrityStep,
    collectDependencyAdmissionStep,
    ...collectors,
  };

  return {
    steps: [
      resolvedCollectors.collectCompositionIntegrityStep(),
      resolvedCollectors.collectDependencyAdmissionStep(context),
    ],
  };
}

export function collectHarnessOxlintLane(context) {
  const files = requiresFullOxlintClosure(context.harnessTargetFiles)
    ? DEFAULT_OXLINT_ROOTS
    : (context.qualityJsLikeFiles ?? context.jsLikeFiles);
  return { oxlintStep: runOxlint({ files }).step };
}

export function collectHarnessTypecheckLane(context, options) {
  return { typecheckStep: collectTypecheckStep(context, options) };
}

export async function collectHarnessTestLane(context, { maxWorkers }) {
  return { unitTestStep: await collectUnitTestStep(context, { maxWorkers }) };
}

export async function collectHarnessStepResults({
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

  const formatStep = await (collectors.collectFormatterStep ?? collectHarnessFormatterStep)(
    context
  );
  if (formatStep.status === 'failed') {
    return { skipped: false, steps: [formatStep] };
  }
  const scheduledSteps = await scheduledStepCollector(context);
  const steps = [formatStep, ...scheduledSteps];

  return {
    skipped: false,
    steps: steps.map((step) =>
      step.label === 'Oxlint' && step.durationMs == null ? { ...step, durationMs: 0 } : step
    ),
  };
}
