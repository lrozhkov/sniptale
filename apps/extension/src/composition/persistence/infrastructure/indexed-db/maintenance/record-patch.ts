type RecordPatch = Record<string, (value: unknown) => unknown>;

export function patchRecord(
  previousValue: Record<string, unknown>,
  patch: RecordPatch
): {
  applyToCurrent: (currentValue: unknown) => unknown;
  changed: boolean;
  value: Record<string, unknown>;
} {
  const candidateValue = applyPatch(previousValue, patch);
  return {
    applyToCurrent: (currentValue) =>
      isRecord(currentValue) ? applyPatch(currentValue, patch) : currentValue,
    changed: JSON.stringify(previousValue) !== JSON.stringify(candidateValue),
    value: candidateValue,
  };
}

function applyPatch(value: Record<string, unknown>, patch: RecordPatch): Record<string, unknown> {
  const next = { ...value };
  for (const [key, sanitize] of Object.entries(patch)) {
    next[key] = sanitize(value[key]);
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
