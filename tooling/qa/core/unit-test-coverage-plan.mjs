import { resolveCoverageTargetFiles } from './verify-test-coverage.mjs';

export function resolveCoveragePlan({
  codeFiles,
  coverageEnabled = true,
  coverageTargetResolver = resolveCoverageTargetFiles,
  relatedFilesOverride,
  releaseMode,
}) {
  if (!coverageEnabled && relatedFilesOverride !== undefined) {
    return {
      mode: 'skip',
      coverageTargetFiles: [],
      coverageCheckFiles: [],
      detail: 'coverage handled by qa:audit',
      relatedFiles: [...relatedFilesOverride],
    };
  }

  if (releaseMode) {
    return {
      mode: 'full',
      coverageTargetFiles: coverageTargetResolver({ mode: 'full' }),
      coverageCheckFiles: [],
      detail: 'release full-suite coverage',
      relatedFiles: [],
    };
  }

  const coverageTargetFiles = coverageTargetResolver({ files: codeFiles });
  if (coverageTargetFiles.length === 0) {
    return {
      mode: 'skip',
      coverageTargetFiles: [],
      coverageCheckFiles: [],
      detail: 'skipped: no changed production files in rollout scope',
      relatedFiles: codeFiles,
    };
  }

  return {
    mode: 'diff',
    coverageTargetFiles,
    coverageCheckFiles: codeFiles,
    detail: 'diff coverage for rollout-covered changed production files',
    relatedFiles: codeFiles,
  };
}

export function createPlannedCoverage({
  codeFiles,
  coverageDetailOverride,
  coverageEnabled,
  directFilesOverride,
  fullSuiteOverride,
  relatedFilesOverride,
  releaseMode,
}) {
  const coveragePlan = resolveCoveragePlan({
    codeFiles,
    coverageEnabled,
    relatedFilesOverride,
    releaseMode,
  });
  return {
    ...coveragePlan,
    ...(coverageEnabled ? {} : { coverageCheckFiles: [], coverageTargetFiles: [], mode: 'skip' }),
    directFiles: [...directFilesOverride],
    forceFullSuite: fullSuiteOverride,
    relatedFiles: relatedFilesOverride ?? coveragePlan.relatedFiles,
    detail:
      coverageDetailOverride ??
      (coverageEnabled ? coveragePlan.detail : 'coverage handled by qa:audit'),
  };
}

export function getCoverageMode(coveragePlan) {
  return coveragePlan.mode === 'full' ? 'full' : 'diff';
}

export function hasCoverage(coveragePlan) {
  return coveragePlan.mode !== 'skip';
}
