import { collectDeadCommentedCodeViolations } from '../../quality/dead-commented-code.mjs';
import { filterImportOrMockOnlyDiffFiles } from '../../../analysis/imports/import-only-diff/check.mjs';
import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
  createViolationStep,
} from '../focused-qa-results.mjs';
import { runCodeStep } from '../focused-qa-helpers.mjs';
import { filterAllowedViolations } from '../../../policy/baselines/shared-baseline.mjs';
import { runFocusedDeadExportsCheck } from './dead-exports.mjs';
import { runFocusedOxlintWithProjections } from './oxlint-step.mjs';
import { requiresFullOxlintClosure } from '../../../guards/quality/verify-oxlint.mjs';
import { formatDeadExportsReport } from '../../../guards/quality/dead-code/dead-exports/check.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS, FOCUSED_CONTEXTUAL_VIOLATION_STEPS } from './code-steps.mjs';
import { runFocusedUnitTests } from './test-steps.mjs';
import {
  runDependencyGraphTriggeredChecks,
  runFocusedTriggeredStaticChecks,
  runFocusedTypecheckStep,
} from '../focused-triggered/execution.mjs';
import { collectScheduledFocusedStepResults } from './scheduler.mjs';
import { collectOwnerGuardStep } from '../../shared/owner-guard-step-helpers.mjs';
import { runLineLengthCheck } from '../../../guards/quality/readability/line-length/check.mjs';
import { runManualMockExportParityCheck } from '../../../guards/quality/mocks/manual-export-parity/check.mjs';
import { runManifestPermissionsCheck } from '../../../guards/architecture/manifest-permissions/check.mjs';
import { runRuntimeTopologyCheck } from '../../../guards/architecture/runtime-topology/check.mjs';
import { runHtmlSanitizerOwnershipCheck } from '../../../guards/security/html-sanitizer-ownership/check.mjs';
import { runUnifiedAstGrepReceipt } from '../../../audits/ast-grep/unified-ast-grep.mjs';
import { runMessagingCheck } from '../../../guards/boundaries/verify-messaging.mjs';
import { runStructuralRiskCheck } from '../../../analysis/structural-risk/check.mjs';
import {
  timeAsyncStep,
  timeSyncStep,
} from '../../../runtime/observability/step-timing.helpers.mjs';

function runDeadCommentedCodeStep(codeFiles, baseline) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const result =
    behavioralCodeFiles.length === 0
      ? { skipped: true, violations: [] }
      : {
          skipped: false,
          violations: filterAllowedViolations(
            collectDeadCommentedCodeViolations(behavioralCodeFiles),
            baseline
          ),
        };

  return createViolationStep('Dead commented code', 'Dead commented code found:', result);
}

function runStructuralRiskStep(codeFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  return createViolationStep(
    'Structural risk',
    'Structural risk violations found:',
    runStructuralRiskCheck({
      files: behavioralCodeFiles,
      reportScope: 'current-diff',
      enforce: true,
    })
  );
}

function runManualMockExportParityStep(targetFiles) {
  return createViolationStep(
    'Mock export parity',
    'Manual mock export parity violations found:',
    runManualMockExportParityCheck({ targetFiles })
  );
}

export function resolveFocusedCodeStepFiles(options, codeFiles, behavioralCodeFiles) {
  return options?.preserveImportOnly ? codeFiles : behavioralCodeFiles;
}

async function runFocusedCodeSteps(codeFiles, targetFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const astGrepReceipt =
    codeFiles.length > 0 ? runUnifiedAstGrepReceipt({ files: codeFiles }) : null;
  const steps = [];
  for (const [label, header, runner, options] of FOCUSED_CODE_VIOLATION_STEPS) {
    const stepCodeFiles = resolveFocusedCodeStepFiles(
      { preserveImportOnly: true, ...options },
      codeFiles,
      behavioralCodeFiles
    );
    steps.push(
      await timeAsyncStep(async () =>
        createViolationStep(
          label,
          header,
          await runCodeStep(stepCodeFiles, () =>
            runner({ astGrepReceipt, files: stepCodeFiles, scope: 'workspace' })
          )
        )
      )
    );
  }
  for (const { label, header } of FOCUSED_CONTEXTUAL_VIOLATION_STEPS) {
    steps.push(
      await timeAsyncStep(async () =>
        createViolationStep(
          label,
          header,
          runMessagingCheck({ astGrepReceipt, files: codeFiles, targetFiles })
        )
      )
    );
  }
  return steps;
}

function runConditionalViolationStep(label, shouldRun, header, runner) {
  if (!shouldRun) {
    return createSkippedStep(label);
  }

  return createViolationStep(label, header, runner());
}

async function runSecurityStep(codeFiles) {
  if (codeFiles.length === 0) {
    return createSkippedStep('HTML sanitizer ownership');
  }

  const securityResult = runHtmlSanitizerOwnershipCheck(codeFiles);
  return createViolationStep(
    'HTML sanitizer ownership',
    'HTML sanitizer ownership violations found:',
    {
      violations: securityResult.violations,
    }
  );
}

function runChangedLineReadabilityStep(codeFiles) {
  return createViolationStep(
    'Changed-line readability',
    'Changed-line length violations found:',
    runLineLengthCheck({ files: codeFiles, scope: 'workspace' })
  );
}

function runDeadExportsStep(targetFiles, { deadExportsRunner = runFocusedDeadExportsCheck } = {}) {
  const deadExportsResult = deadExportsRunner(targetFiles);
  if (deadExportsResult.skipped) {
    return createSkippedStep('Dead exports');
  }

  const { summary } = deadExportsResult;
  const indexDetail = deadExportsResult.sourceIndexStats
    ? `source-index=${deadExportsResult.sourceIndexStats.cacheStatus}; ` +
      `parsed=${deadExportsResult.sourceIndexStats.parsedFileCount}; ` +
      `reused=${deadExportsResult.sourceIndexStats.reusedFileCount}`
    : '';
  if (summary.unusedValueExportCount === 0 && summary.unusedTypeExportCount === 0) {
    return createOkStep('Dead exports', indexDetail);
  }

  return createFailureStep('Dead exports', 'violations found', {
    stderr: formatDeadExportsReport(deadExportsResult.report),
    detail: indexDetail,
  });
}

export function runFocusedPolicySteps({ shouldRunManifestPermissions, shouldRunRuntimeTopology }) {
  return [
    timeSyncStep(() =>
      runConditionalViolationStep(
        'Runtime topology',
        shouldRunRuntimeTopology,
        'Runtime topology violations found:',
        () => runRuntimeTopologyCheck()
      )
    ),
    timeSyncStep(() =>
      runConditionalViolationStep(
        'Manifest permissions',
        shouldRunManifestPermissions,
        'Manifest permission violations found:',
        () => runManifestPermissionsCheck()
      )
    ),
  ];
}

export async function collectFocusedLightLane({
  baseline,
  codeFiles,
  existingTargetFiles,
  jsLikeFiles,
  qualityCodeFiles = codeFiles,
  qualityTargetFiles = existingTargetFiles,
  targetFiles = existingTargetFiles,
  shouldRunManifestPermissions,
  shouldRunRuntimeTopology,
}) {
  return {
    qualitySteps: [
      timeSyncStep(() => runChangedLineReadabilityStep(qualityCodeFiles)),
      timeSyncStep(() => runDeadCommentedCodeStep(qualityCodeFiles, baseline)),
      timeSyncStep(() => runStructuralRiskStep(qualityCodeFiles)),
      timeSyncStep(() => runManualMockExportParityStep(qualityTargetFiles)),
      ...(await runFocusedCodeSteps(qualityCodeFiles, targetFiles)),
    ],
    triggeredStaticSteps: runFocusedTriggeredStaticChecks({
      deferOwnerGuards: true,
      targetFiles: existingTargetFiles,
      qualityTargetFiles,
      jsLikeFiles,
    }),
    policySteps: runFocusedPolicySteps({
      shouldRunManifestPermissions,
      shouldRunRuntimeTopology,
    }),
  };
}

export function collectFocusedOwnerLane({ lane }) {
  return { ownerStep: collectOwnerGuardStep(lane) };
}

export async function collectFocusedLintLane({
  codeFiles,
  jsLikeFiles,
  qualityJsLikeFiles = jsLikeFiles,
  shouldRunFullOxlint,
}) {
  const oxlintResult = timeSyncStep(() =>
    runFocusedOxlintWithProjections(qualityJsLikeFiles, { fullClosure: shouldRunFullOxlint })
  );
  return {
    loggingStep: oxlintResult.loggingStep,
    oxlintStep: oxlintResult.oxlintStep,
    securityStep: await timeAsyncStep(() => runSecurityStep(codeFiles)),
  };
}

export async function collectFocusedGraphLane(
  { existingTargetFiles, targetFiles },
  {
    deadExportsRunner = runFocusedDeadExportsCheck,
    dependencyGraphRunner = runDependencyGraphTriggeredChecks,
  } = {}
) {
  return {
    dependencySteps: await dependencyGraphRunner(existingTargetFiles),
    deadExportsStep: timeSyncStep(() => runDeadExportsStep(targetFiles, { deadExportsRunner })),
  };
}

export async function collectFocusedTypecheckLane(
  { existingTargetFiles, targetFiles },
  { checkerCount, maxConcurrency = 1 } = {}
) {
  return {
    typecheckStep: await runFocusedTypecheckStep(targetFiles ?? existingTargetFiles, {
      checkerCount,
      maxConcurrency,
    }),
  };
}

export async function collectFocusedTestLane(
  {
    addedFiles = [],
    codeFiles,
    existingTargetFiles,
    qualityCodeFiles = codeFiles,
    qualityTargetFiles = existingTargetFiles,
  },
  { maxWorkers, pool } = {}
) {
  return {
    testSteps: await runFocusedUnitTests(
      {
        // Manifest replay proves behavior preservation for exact relocations. Raw files still run
        // through security/dead-export lanes above; path-only files do not expand owner-test scope.
        codeFiles: qualityCodeFiles,
        newFiles: addedFiles.filter((file) => qualityCodeFiles.includes(file)),
        targetFiles: qualityTargetFiles,
      },
      { maxWorkers, pool }
    ),
  };
}

export async function collectFocusedStepResults(context, dependencies) {
  const workerContext = {
    ...context,
    shouldRunManifestPermissions: context.shouldRunManifestPermissions(context.existingTargetFiles),
    shouldRunRuntimeTopology: context.shouldRunRuntimeTopology(context.existingTargetFiles),
    shouldRunFullOxlint: requiresFullOxlintClosure(context.targetFiles),
  };
  return collectScheduledFocusedStepResults(workerContext, dependencies);
}

export { requiresFullOxlintClosure } from '../../../guards/quality/verify-oxlint.mjs';
