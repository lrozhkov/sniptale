export function parseToggleState({ ok, error }, endpoint) {
  if (ok) return true;
  if (/\(HTTP 404\)/u.test(error ?? '')) return false;
  throw new Error(`Unable to snapshot ${endpoint}: ${error || 'unknown GitHub API failure'}`);
}

export function requireSelectedActionsSnapshot(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.github_owned_allowed !== 'boolean' ||
    typeof value.verified_allowed !== 'boolean' ||
    !Array.isArray(value.patterns_allowed)
  ) {
    throw new Error('Selected Actions rollback state is unavailable or malformed.');
  }
  return value;
}
