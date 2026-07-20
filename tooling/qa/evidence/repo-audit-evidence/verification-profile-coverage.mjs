const FULL_DIFF_SCOPED_TOOLS = new Set([
  'verify-line-length.mjs',
  'verify-hotspot-regression.mjs',
  'verify-instance-ownership.mjs',
  'verify-read-path-side-effects.mjs',
  'verify-read-safe-naming.mjs',
  'verify-lifecycle-intent.mjs',
  'verify-success-failure-asymmetry.mjs',
  'verify-destructive-async-swaps.mjs',
  'verify-storage-write-patterns.mjs',
  'verify-parser-snapshot-purity.mjs',
  'verify-history-detached-snapshots.mjs',
  'verify-history-revision-semantics.mjs',
  'verify-history-transaction-lifecycle.mjs',
  'verify-ui-automation-seams.mjs',
]);

const FULL_HYBRID_SCOPED_TOOLS = new Set(['verify-unit-tests.mjs', 'verify-test-coverage.mjs']);

function collectCoverageState(
  tool,
  entryKind,
  fullWrapperTools,
  focusedWrapperTools,
  triggerTools
) {
  if (entryKind === 'advisory') {
    return {
      fullScope: null,
      focusedScope: null,
      manualOnly: false,
    };
  }

  const fullScope = fullWrapperTools.includes(tool)
    ? FULL_HYBRID_SCOPED_TOOLS.has(tool)
      ? 'hybrid-scoped'
      : FULL_DIFF_SCOPED_TOOLS.has(tool)
        ? 'diff-scoped'
        : 'repo-wide'
    : null;
  const focusedScope = focusedWrapperTools.includes(tool)
    ? 'always-run'
    : triggerTools.includes(tool)
      ? 'trigger-scoped'
      : null;

  return {
    fullScope,
    focusedScope,
    manualOnly: fullScope == null && focusedScope == null,
  };
}

export function collectToolCoverage({
  qualityScripts,
  fullWrapperTools,
  focusedWrapperTools,
  focusedTriggerCoveredTools,
}) {
  const scriptRows = qualityScripts.map((entry) => ({
    tool: entry.tool,
    script: entry.script,
    entryKind: entry.entryKind,
    ...collectCoverageState(
      entry.tool,
      entry.entryKind,
      fullWrapperTools,
      focusedWrapperTools,
      focusedTriggerCoveredTools
    ),
  }));
  const wrapperOnlyRows = [
    ...new Set([...fullWrapperTools, ...focusedWrapperTools, ...focusedTriggerCoveredTools]),
  ]
    .filter((tool) => !qualityScripts.some((entry) => entry.tool === tool))
    .sort()
    .map((tool) => ({
      tool,
      script: null,
      entryKind: 'wrapper-only',
      ...collectCoverageState(
        tool,
        'wrapper-only',
        fullWrapperTools,
        focusedWrapperTools,
        focusedTriggerCoveredTools
      ),
    }));

  return [...scriptRows, ...wrapperOnlyRows].sort(
    (left, right) =>
      left.tool.localeCompare(right.tool) ||
      (left.script ?? '').localeCompare(right.script ?? '') ||
      left.entryKind.localeCompare(right.entryKind)
  );
}
