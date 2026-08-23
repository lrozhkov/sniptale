import path from 'node:path';

import { runBuild, runExtensionBuildEquivalence } from './verify-build.mjs';
import {
  formatDeadExportsReport,
  runDeadExportsCheck,
  summarizeDeadExportsReport,
} from './verify-dead-exports.mjs';
import {
  createBlockedStep,
  createFailureStep,
  createOkStep,
  createProcessStep,
  createSkippedStep,
  createStringFailureStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { runNamingCheck } from './verify-naming.mjs';
import { runReleaseArchive } from './verify-release-archive.mjs';
import { runSecurityCheck } from '../guards/security/verify-security.mjs';
import { measureAsyncStep, measureSyncStep } from './step-timing.helpers.mjs';
import {
  materializeReusableBuildArchive,
  recordSuccessfulBuildProof,
  resolveReusableBuildProof,
} from './build-proof.mjs';

export function withDuration(step, durationMs) {
  return {
    ...step,
    durationMs,
  };
}

export function collectMeasuredViolationStep(label, header, runner) {
  const { durationMs, value } = measureSyncStep(runner);
  return withDuration(createViolationStep(label, header, value), durationMs);
}

export function collectMeasuredStringFailureStep(label, header, runner) {
  const { durationMs, value } = measureSyncStep(runner);
  return withDuration(createStringFailureStep(label, header, value), durationMs);
}

export function collectNamingStep() {
  return collectMeasuredViolationStep('Naming', 'Naming violations found:', runNamingCheck);
}

export async function collectSecurityStep({ eslintResults = null, files } = {}) {
  if (Array.isArray(files) && files.length === 0) {
    return createSkippedStep('Security');
  }

  const { durationMs, value: securityResult } = await measureAsyncStep(() =>
    runSecurityCheck(files, { eslintResults })
  );
  if (securityResult.eslintResult.failed) {
    return createFailureStep('Security', 'failed', {
      stdout: securityResult.eslintResult.output,
      durationMs,
    });
  }

  return withDuration(
    createViolationStep('Security', 'Security violations found:', {
      violations: securityResult.violations,
    }),
    durationMs
  );
}

export function collectDeadExportsStep({ deadExportsRunner = runDeadExportsCheck } = {}) {
  const { durationMs, value: deadExportsReport } = measureSyncStep(() => deadExportsRunner());
  const deadExportsSummary = summarizeDeadExportsReport(deadExportsReport);
  const sourceIndexDetail = deadExportsReport.sourceIndexStats
    ? `source-index=${deadExportsReport.sourceIndexStats.cacheStatus}; ` +
      `parsed=${deadExportsReport.sourceIndexStats.parsedFileCount}; ` +
      `reused=${deadExportsReport.sourceIndexStats.reusedFileCount}`
    : '';
  if (
    deadExportsSummary.unusedValueExportCount > 0 ||
    deadExportsSummary.unusedTypeExportCount > 0
  ) {
    return createFailureStep('Dead exports', 'violations found', {
      stderr: formatDeadExportsReport(deadExportsReport),
      durationMs,
      detail: sourceIndexDetail,
    });
  }

  return withDuration(createOkStep('Dead exports', sourceIndexDetail), durationMs);
}

const EXTENSION_BUILD_DIRECTORY_TRIGGER = /^apps\/extension\/(?:build|public)\//u;
const EXTENSION_BUILD_FILE_TRIGGER =
  /^apps\/extension\/(?:manifest|package|postcss\.config|tailwind\.config|vite\.config)\.(?:js|json|ts)$/u;

function requiresExtensionBuildEquivalence(targetFiles = []) {
  return targetFiles.some(
    (file) =>
      file === 'package.json' ||
      EXTENSION_BUILD_DIRECTORY_TRIGGER.test(file) ||
      EXTENSION_BUILD_FILE_TRIGGER.test(file)
  );
}

export async function collectBuildStep({
  buildRunner = runBuild,
  buildProofResolver = resolveReusableBuildProof,
  equivalenceRunner = runExtensionBuildEquivalence,
  releaseMode = false,
  targetFiles = [],
} = {}) {
  const reusable = buildProofResolver();
  if (reusable.matched) {
    return createOkStep('Build', `reused verified build/ZIP proof ${reusable.proof.proofDigest}`);
  }
  const { durationMs, value: buildResult } = await measureAsyncStep(() =>
    requiresExtensionBuildEquivalence(targetFiles)
      ? equivalenceRunner({ mode: 'release' })
      : buildRunner({ enforceLint: false, mode: releaseMode ? 'release' : undefined })
  );
  return {
    ...createProcessStep('Build', buildResult),
    durationMs,
  };
}

export async function collectReleaseArchiveStep({
  archiveRunner = runReleaseArchive,
  buildProofRecorder = recordSuccessfulBuildProof,
  buildProofResolver = resolveReusableBuildProof,
  reusableArchiveMaterializer = materializeReusableBuildArchive,
} = {}) {
  const reusable = buildProofResolver();
  if (reusable.matched) {
    const archivePath = reusableArchiveMaterializer(reusable);
    buildProofRecorder({
      archivePath,
      producerId: 'qa-release-archive-owner',
      reusedFrom: reusable.proof.proofDigest,
    });
    return createOkStep('Release archive', `reused verified archive ${path.basename(archivePath)}`);
  }
  const { durationMs, value: archiveResult } = await measureAsyncStep(() => archiveRunner());
  const exitCode = archiveResult.status ?? archiveResult.exitCode ?? 0;
  if (exitCode === 0) {
    const archiveOutput = String(archiveResult.stdout ?? '').trim();
    const archivePath = archiveOutput.replace(/^Release archive:\s*/u, '');
    buildProofRecorder({ archivePath, producerId: 'qa-release-archive-owner' });
    return withDuration(createOkStep('Release archive', archiveOutput), durationMs);
  }

  return {
    ...createProcessStep('Release archive', archiveResult),
    durationMs,
  };
}

export async function appendBuildStepOrBlock(steps, context, collectors) {
  if (steps.some((step) => step.status === 'failed')) {
    steps.push(createBlockedStep('Build', 'earlier hardfail steps failed'));
    return steps;
  }

  steps.push(await collectors.collectBuildStep(context));
  return steps;
}

export async function appendReleaseArchiveStepOrBlock(steps, collectors) {
  const buildStep = [...steps].reverse().find((step) => step.label === 'Build');
  if (buildStep?.status !== 'ok') {
    steps.push(createBlockedStep('Release archive', 'release build did not complete'));
    return steps;
  }

  steps.push(await collectors.collectReleaseArchiveStep());
  return steps;
}
