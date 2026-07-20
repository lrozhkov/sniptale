import { resolveCoverageTargetFiles } from './verify-test-coverage.mjs';

export function resolveCoveragePlan({ codeFiles, releaseMode }) {
  if (releaseMode) {
    return {
      mode: 'full',
      coverageTargetFiles: resolveCoverageTargetFiles({ mode: 'full' }),
      coverageCheckFiles: [],
      detail: 'release full-suite coverage',
      relatedFiles: [],
    };
  }

  const coverageTargetFiles = resolveCoverageTargetFiles({ files: codeFiles });
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

export function getCoverageMode(coveragePlan) {
  return coveragePlan.mode === 'full' ? 'full' : 'diff';
}

export function hasCoverage(coveragePlan) {
  return coveragePlan.mode !== 'skip';
}
