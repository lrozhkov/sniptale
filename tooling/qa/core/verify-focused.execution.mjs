import { collectAiLimitReport } from './ai-limit-utils.mjs';
import { filterImportOnlyDiffFiles, filterImportOrMockOnlyDiffFiles } from './import-only-diff.mjs';
import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { runCodeStep } from './focused-qa-helpers.mjs';
import { filterAllowedViolations } from './shared.mjs';
import { lintWithEslint } from './verify-eslint.mjs';
import { runFocusedDeadExportsCheck } from './verify-focused.dead-exports.helpers.mjs';
import { runFocusedOxlintStep } from './verify-focused.oxlint-step.helpers.mjs';
import { formatDeadExportsReport } from './verify-dead-exports.mjs';
import { FOCUSED_CODE_VIOLATION_STEPS } from './verify-focused.code-steps.mjs';
import { runFocusedUnitTests } from './verify-focused.test-steps.mjs';
import { runFocusedTriggeredChecks } from './verify-focused-triggered.mjs';
import { runLineLengthCheck } from '../guards/quality/verify-line-length.mjs';
import { runManualMockExportParityCheck } from '../guards/quality/verify-manual-mock-export-parity.mjs';
import { runManifestPermissionsCheck } from '../guards/architecture/verify-manifest-permissions.mjs';
import { runRuntimeTopologyCheck } from '../guards/architecture/verify-runtime-topology.mjs';
import { runSecurityCheck } from '../guards/security/verify-security.mjs';
import { runSonarjsCheck } from './verify-sonarjs.mjs';
import { timeAsyncStep, timeSyncStep } from './step-timing.helpers.mjs';

async function runEslintStep(jsLikeFiles) {
  const behavioralJsLikeFiles = filterImportOnlyDiffFiles(jsLikeFiles);
  if (behavioralJsLikeFiles.length === 0) {
    return createSkippedStep('ESLint');
  }

  const eslintResult = await lintWithEslint({
    files: behavioralJsLikeFiles,
    rulePrefix: '@typescript-eslint/',
    strict: true,
  });
  if (!eslintResult.failed) {
    return createOkStep('ESLint', `type-aware rules; files=${behavioralJsLikeFiles.length}`);
  }

  return createFailureStep('ESLint', 'failed', {
    stdout: eslintResult.output,
  });
}

function runAiLimitsStep(codeFiles, baseline) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const aiResult =
    behavioralCodeFiles.length === 0
      ? { skipped: true, violations: [] }
      : {
          skipped: false,
          violations: filterAllowedViolations(
            collectAiLimitReport(behavioralCodeFiles).violations,
            baseline
          ),
        };

  return createViolationStep('AI limits', 'AI limit violations found:', aiResult);
}

function runManualMockExportParityStep(targetFiles) {
  return createViolationStep(
    'Mock export parity',
    'Manual mock export parity violations found:',
    runManualMockExportParityCheck({ targetFiles })
  );
}

function runFocusedCodeSteps(codeFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  return FOCUSED_CODE_VIOLATION_STEPS.map(([label, header, runner]) =>
    timeSyncStep(() => {
      return createViolationStep(
        label,
        header,
        runCodeStep(behavioralCodeFiles, () =>
          runner({ files: behavioralCodeFiles, scope: 'workspace' })
        )
      );
    })
  );
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
  if (securityResult.eslintResult.failed) {
    return createFailureStep('Security', 'failed', {
      stdout: securityResult.eslintResult.output,
    });
  }

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

function runDeadExportsStep(codeFiles) {
  const behavioralCodeFiles = filterImportOrMockOnlyDiffFiles(codeFiles);
  const deadExportsResult = runFocusedDeadExportsCheck(behavioralCodeFiles);
  if (deadExportsResult.skipped) {
    return createSkippedStep('Dead exports');
  }

  const { summary } = deadExportsResult;
  if (summary.unusedValueExportCount === 0 && summary.unusedTypeExportCount === 0) {
    return createOkStep('Dead exports');
  }

  return createFailureStep('Dead exports', 'violations found', {
    stderr: formatDeadExportsReport(deadExportsResult.report),
  });
}

function runFocusedPolicySteps({
  existingTargetFiles,
  shouldRunManifestPermissions,
  shouldRunRuntimeTopology,
}) {
  return [
    timeSyncStep(() =>
      runConditionalViolationStep(
        'Runtime topology',
        shouldRunRuntimeTopology(existingTargetFiles),
        'Runtime topology violations found:',
        () => runRuntimeTopologyCheck()
      )
    ),
    timeSyncStep(() =>
      runConditionalViolationStep(
        'Manifest permissions',
        shouldRunManifestPermissions(existingTargetFiles),
        'Manifest permission violations found:',
        () => runManifestPermissionsCheck()
      )
    ),
  ];
}

export async function collectFocusedStepResults({
  addedFiles = [],
  baseline,
  codeFiles,
  existingTargetFiles,
  jsLikeFiles,
  qualityCodeFiles = codeFiles,
  qualityJsLikeFiles = jsLikeFiles,
  qualityTargetFiles = existingTargetFiles,
  targetFiles,
  shouldRunManifestPermissions,
  shouldRunRuntimeTopology,
}) {
  return [
    timeSyncStep(() => runFocusedOxlintStep(qualityJsLikeFiles)),
    await timeAsyncStep(() => runEslintStep(qualityJsLikeFiles)),
    await timeAsyncStep(() => runSonarjsStep(qualityCodeFiles)),
    timeSyncStep(() => runChangedLineReadabilityStep(qualityCodeFiles)),
    timeSyncStep(() => runAiLimitsStep(qualityCodeFiles, baseline)),
    timeSyncStep(() => runManualMockExportParityStep(qualityTargetFiles)),
    ...runFocusedCodeSteps(qualityCodeFiles),
    ...(await runFocusedTriggeredChecks({
      targetFiles: existingTargetFiles,
      qualityTargetFiles,
      typecheckTargetFiles: targetFiles ?? existingTargetFiles,
      jsLikeFiles,
    })),
    ...runFocusedPolicySteps({
      existingTargetFiles,
      shouldRunManifestPermissions,
      shouldRunRuntimeTopology,
    }),
    await timeAsyncStep(() => runSecurityStep(codeFiles)),
    timeSyncStep(() => runDeadExportsStep(codeFiles)),
    ...(await runFocusedUnitTests({
      // Manifest replay proves behavior preservation for exact relocations. Raw files still run
      // through security/dead-export lanes above; path-only files do not expand owner-test scope.
      codeFiles: qualityCodeFiles,
      newFiles: addedFiles.filter((file) => qualityCodeFiles.includes(file)),
      targetFiles: qualityTargetFiles,
    })),
  ];
}
