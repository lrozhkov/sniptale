export const ADVISORY_CATALOG = Object.freeze({
  'advisory.structural-file': {
    title: 'Structural file pressure',
    hint: 'Split by independent change reason and move state/effects to explicit owners.',
  },
  'advisory.structural-function': {
    title: 'Structural function pressure',
    hint: 'Extract a cohesive operation or narrow adapter without dissolving the transaction boundary.',
  },
  'advisory.ui-proof-gap': {
    title: 'UI proof gap',
    hint: 'Add a behavior/proof matrix and representative visual states before closeout.',
  },
  'advisory.detached-this-method': {
    title: 'Detached this-sensitive method',
    hint: 'Wrap this-sensitive methods in closures or bind them before callback handoff.',
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
