export const JSCPD_BASELINE_FAMILY_KEYS = [
  'count',
  'debtId',
  'family',
  'lines',
  'sampleFingerprint',
];

export function hasExactJscpdBaselineFamilyKeys(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const keys = Object.keys(entry).sort();
  return (
    keys.length === JSCPD_BASELINE_FAMILY_KEYS.length &&
    keys.every((key, index) => key === JSCPD_BASELINE_FAMILY_KEYS[index])
  );
}

export function createJscpdBaselineScope(entry) {
  return {
    count: entry.count,
    family: entry.family,
    lines: entry.lines,
    sampleFingerprint: entry.sampleFingerprint,
  };
}
