export const ADVISORY_CATALOG = Object.freeze({
  'advisory.structural-file': {
    title: 'Structural file pressure',
    hint: 'Split by independent change reason and move state/effects to explicit owners.',
  },
  'advisory.structural-function': {
    title: 'Structural function pressure',
    hint: 'Extract a cohesive operation or narrow adapter without dissolving the transaction boundary.',
  },
  'advisory.root-scatter': {
    title: 'Root scatter',
    hint: 'Review owner placement, but keep an explicit root file when an extra folder or facade would add navigation without clarifying ownership.',
  },
  'advisory.documentation-prose': {
    title: 'Documentation prose drift',
    hint: 'Link to the generated fact or use a structured include marker; do not duplicate changeable values in prose.',
  },
  'advisory.oversized-inline-literal': {
    title: 'Oversized inline literals',
    hint: 'Move substantial static data to an owned data or fixture file when that improves ownership and reviewability.',
  },
  'advisory.ui-proof-gap': {
    title: 'UI proof gap',
    hint: 'Add a behavior/proof matrix and representative visual states before closeout.',
  },
});

export function createAdvisoryFinding({
  id,
  file,
  line = null,
  symbol = null,
  reason,
  hint,
  severity = 'watch',
}) {
  const definition = ADVISORY_CATALOG[id];
  if (!definition) throw new Error(`Unknown advisory finding id: ${id}`);
  return {
    id,
    family: definition.title,
    file,
    line,
    symbol,
    reason,
    hint: hint ?? definition.hint,
    severity,
  };
}

export function compareAdvisoryFindings(left, right) {
  const severityRank = { attention: 0, watch: 1 };
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    left.id.localeCompare(right.id) ||
    left.file.localeCompare(right.file) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    String(left.symbol ?? '').localeCompare(String(right.symbol ?? '')) ||
    left.reason.localeCompare(right.reason)
  );
}

function structuralDelta(finding) {
  if (!finding.id.startsWith('advisory.structural-')) return null;
  const match = finding.reason.match(/(?:^|,\s*)delta=(-?\d+)(?:,|$)/u);
  return match ? Number(match[1]) : null;
}

export function classifyAdvisoryFindings(findings, { mode = 'checkpoint' } = {}) {
  const buckets = { introduced: [], worsened: [], existing: [] };
  for (const finding of findings) {
    const delta = structuralDelta(finding);
    if (delta !== null) {
      buckets[delta > 0 ? 'worsened' : 'existing'].push(finding);
      continue;
    }
    buckets[mode === 'checkpoint' ? 'introduced' : 'existing'].push(finding);
  }
  return buckets;
}

export function createAdvisoryAnalysis(buckets) {
  return Object.fromEntries(
    Object.entries(buckets).map(([key, findings]) => [
      key,
      findings.map(({ id, file, line, reason, severity }) => ({
        id,
        file,
        line: line ?? null,
        reason,
        severity,
      })),
    ])
  );
}
