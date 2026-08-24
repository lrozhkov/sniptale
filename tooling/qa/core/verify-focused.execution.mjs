import { collectAiHygieneReport } from './ai-hygiene-utils.mjs';
import { filterImportOrMockOnlyDiffFiles } from './import-only-diff.mjs';
import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { runCodeStep } from './focused-qa-helpers.mjs';
import { filterAllowedViolations } from './shared.mjs';
import { runFocusedDeadExportsCheck } from './verify-focused.dead-exports.helpers.mjs';
import { runFocusedOxlintStep } from './verify-focused.oxlint-step.helpers.mjs';
import { requiresFullOxlintClosure } from './verify-oxlint.mjs';
import { formatDeadExportsReport } from './verify-dead-exports.mjs';
import {
  FOCUSED_CODE_VIOLATION_STEPS,
  FOCUSED_CONTEXTUAL_VIOLATION_STEPS,
} from './verify-focused.code-steps.mjs';
import { runFocusedUnitTests } from './verify-focused.test-steps.mjs';
import {
  runDependencyGraphTriggeredChecks,
  runFocusedTriggeredStaticChecks,
  runFocusedTypecheckStep,
} from './verify-focused-triggered.execution.mjs';
import { collectScheduledFocusedStepResults } from './verify-focused.scheduler.mjs';
import { collectOwnerGuardStep } from './owner-guard-step-helpers.mjs';
import { runLineLengthCheck } from '../guards/quality/verify-line-length.mjs';
import { runManualMockExportParityCheck } from '../guards/quality/verify-manual-mock-export-parity.mjs';
import { runManifestPermissionsCheck } from '../guards/architecture/verify-manifest-permissions.mjs';
import { runRuntimeTopologyCheck } from '../guards/architecture/verify-runtime-topology.mjs';
import { runSecurityCheck } from '../guards/security/verify-security.mjs';
import { runMessagingCheck } from './verify-messaging.mjs';
import { runSonarjsCheck } from './verify-sonarjs.mjs';
import { runStructuralRiskCheck } from './verify-structural-risk.mjs';
import { timeAsyncStep, timeSyncStep } from './step-timing.helpers.mjs';

function runAiHygieneStep(codeFiles, baseline) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const result =
    behavioralCodeFiles.length === 0
      ? { skipped: true, violations: [] }
      : {
          skipped: false,
          violations: filterAllowedViolations(
            collectAiHygieneReport(behavioralCodeFiles).violations,
            baseline
          ),
        };

  return createViolationStep('AI hygiene', 'AI hygiene violations found:', result);
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

async function runFocusedCodeSteps(codeFiles, targetFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const steps = [];
  for (const [label, header, runner] of FOCUSED_CODE_VIOLATION_STEPS) {
    steps.push(
      await timeAsyncStep(async () =>
        createViolationStep(
          label,
          header,
          await runCodeStep(behavioralCodeFiles, () =>
            runner({ files: behavioralCodeFiles, scope: 'workspace' })
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
          runMessagingCheck({ files: behavioralCodeFiles, targetFiles })
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
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  if (behavioralCodeFiles.length === 0) {
    return createSkippedStep('Security');
  }

  const securityResult = await runSecurityCheck(behavioralCodeFiles);
  return createViolationStep('Security', 'Security violations found:', {
    violations: securityResult.violations,
  });
}

async function runSonarjsStep(codeFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  if (behavioralCodeFiles.length === 0) {
    return createSkippedStep('SonarJS');
  }

  return createViolationStep(
    'SonarJS',
    'SonarJS violations found:',
    await runSonarjsCheck({ files: behavioralCodeFiles, scope: 'workspace' })
  );
}

function runChangedLineReadabilityStep(codeFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  return createViolationStep(
    'Changed-line readability',
    'Changed-line length violations found:',
    runLineLengthCheck({ files: behavioralCodeFiles, scope: 'workspace' })
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
      timeSyncStep(() => runAiHygieneStep(qualityCodeFiles, baseline)),
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
  qualityCodeFiles = codeFiles,
  qualityJsLikeFiles = jsLikeFiles,
  shouldRunFullOxlint,
}) {
  return {
    oxlintStep: timeSyncStep(() =>
      runFocusedOxlintStep(qualityJsLikeFiles, { fullClosure: shouldRunFullOxlint })
    ),
    sonarjsStep: await timeAsyncStep(() => runSonarjsStep(qualityCodeFiles)),
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

export { requiresFullOxlintClosure } from './verify-oxlint.mjs';
