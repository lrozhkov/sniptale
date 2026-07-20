import {
  COVERAGE_THRESHOLDS,
  findCoverageRolloutGroup,
  isCoverageExcluded,
  isCoverageTargetFile,
} from './verify-test-coverage.registry.mjs';

export function resolveCoverageThreshold(relativePath) {
  if (!isCoverageTargetFile(relativePath)) {
    return null;
  }

  const exactRolloutGroup = findCoverageRolloutGroup(relativePath, { exactOnly: true });
  if (exactRolloutGroup) {
    return COVERAGE_THRESHOLDS[exactRolloutGroup.threshold];
  }

  if (isCoverageExcluded(relativePath)) {
    return null;
  }

  const rolloutGroup = findCoverageRolloutGroup(relativePath);
  if (rolloutGroup) {
    return COVERAGE_THRESHOLDS[rolloutGroup.threshold];
  }

  return null;
}

export function requiresRelatedUnitTests(relativeFiles) {
  return relativeFiles.some((file) => resolveCoverageThreshold(file) !== null);
}
