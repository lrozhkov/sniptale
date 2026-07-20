import { toRelativePath } from './shared.mjs';

export function countMatchingAllowances(allowances, targetFiles) {
  const targetFileSet = new Set(targetFiles);
  return allowances.filter((allowance) => targetFileSet.has(allowance.file));
}

export function countMatchingViolations(violations, targetFiles) {
  const targetFileSet = new Set(targetFiles);
  return violations.filter((violation) => targetFileSet.has(violation.file));
}

export function countMatchingWarnings(results, targetFiles) {
  const targetFileSet = new Set(targetFiles);
  return results.reduce((count, result) => {
    const relativePath = toRelativePath(result.filePath);
    return targetFileSet.has(relativePath) ? count + result.warningCount : count;
  }, 0);
}

export function summarizeByRule(entries) {
  return Object.fromEntries(
    [
      ...entries
        .reduce((map, entry) => {
          map.set(entry.rule, (map.get(entry.rule) ?? 0) + 1);
          return map;
        }, new Map())
        .entries(),
    ].sort(([left], [right]) => left.localeCompare(right))
  );
}

export function buildTargetSnapshot({
  label,
  targetFiles,
  allowances,
  eslintResults,
  aiViolations,
  activeViolations,
  activeSecurityViolations,
  lineHotspots,
  tokenHotspots,
  topologyBlockers = [],
}) {
  const allowanceEntries = countMatchingAllowances(allowances, targetFiles);
  const aiLimitEntries = countMatchingViolations(aiViolations, targetFiles);
  const lineHotspotFiles = targetFiles.filter((file) =>
    lineHotspots.some((entry) => entry.file === file)
  );
  const tokenHotspotFiles = targetFiles.filter((file) =>
    tokenHotspots.some((entry) => entry.file === file)
  );

  return {
    label,
    targetFiles,
    warningCount: countMatchingWarnings(eslintResults, targetFiles),
    allowanceCount: allowanceEntries.length,
    allowanceBreakdown: summarizeByRule(allowanceEntries),
    aiViolationCount: aiLimitEntries.length,
    activeViolationCount: countMatchingViolations(activeViolations, targetFiles).length,
    activeSecurityViolationCount: countMatchingViolations(activeSecurityViolations, targetFiles)
      .length,
    lineHotspotCount: lineHotspotFiles.length,
    tokenHotspotCount: tokenHotspotFiles.length,
    hotspotCount: new Set([...lineHotspotFiles, ...tokenHotspotFiles]).size,
    topologyBlockers,
    topologyBlockerCount: topologyBlockers.length,
  };
}

export function compareSnapshots(previous, current) {
  const warningDelta = previous.warningCount - current.warningCount;
  const baselineDelta = previous.allowanceCount - current.allowanceCount;
  const hotspotDelta = previous.hotspotCount - current.hotspotCount;
  const topologyBlockerCount =
    current.topologyBlockerCount ?? current.topologyBlockers?.length ?? 0;
  const topologyBlocked = topologyBlockerCount > 0;
  const mechanicalSplitOnly =
    topologyBlocked && (warningDelta > 0 || baselineDelta > 0 || hotspotDelta > 0);
  const clearedCluster =
    current.warningCount === 0 &&
    current.aiViolationCount === 0 &&
    current.activeViolationCount === 0 &&
    current.activeSecurityViolationCount === 0;
  const burnedDown =
    !topologyBlocked &&
    (warningDelta >= 20 ||
      (warningDelta >= 10 && (baselineDelta > 0 || hotspotDelta > 0)) ||
      clearedCluster);

  return {
    warningDelta,
    baselineDelta,
    hotspotDelta,
    topologyBlockerCount,
    mechanicalSplitOnly,
    clearedCluster,
    burnedDown,
  };
}
