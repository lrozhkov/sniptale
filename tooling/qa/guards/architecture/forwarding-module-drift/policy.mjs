const POLICY_PATH = 'tooling/qa/guards/architecture/forwarding-module-drift/policy.data.mjs';
const ROOT_KEYS = new Set(['schemaVersion', 'exemptions']);
const ENTRY_KEYS = new Set([
  'consumer',
  'evidence',
  'forwarder',
  'owner',
  'reason',
  'removalCondition',
  'reviewBy',
]);
const REASONS = new Set(['independent-change-reason', 'unresolved-topology']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PATH_PATTERN = /^(?:apps|packages|src|tooling)\/[A-Za-z0-9_./-]+$/u;

function violation(rule, message) {
  return { rule, file: POLICY_PATH, message };
}

function unknownKeys(value, keys) {
  return Object.keys(value)
    .filter((key) => !keys.has(key))
    .sort();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isExactPath(value) {
  return isNonEmptyString(value) && PATH_PATTERN.test(value) && !value.includes('..');
}

function isRealUtcDate(value) {
  if (!isNonEmptyString(value) || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseEntry(value, index, today) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      entry: null,
      violations: [violation('invalid-forwarding-exemption', `Entry ${index} must be an object.`)],
    };
  }
  const extra = unknownKeys(value, ENTRY_KEYS);
  const errors = [];
  if (extra.length > 0) errors.push(`unknown keys: ${extra.join(', ')}`);
  if (!isExactPath(value.forwarder)) errors.push('forwarder must be an exact repository path');
  if (!isExactPath(value.consumer)) errors.push('consumer must be an exact repository path');
  if (!REASONS.has(value.reason)) errors.push('reason is not admitted');
  for (const key of ['owner', 'evidence', 'removalCondition']) {
    if (!isNonEmptyString(value[key])) errors.push(`${key} must be non-empty`);
  }
  if (!isRealUtcDate(value.reviewBy)) {
    errors.push('reviewBy must be an ISO date');
  } else if (value.reviewBy < today) {
    errors.push(`reviewBy ${value.reviewBy} is stale`);
  }
  return errors.length > 0
    ? {
        entry: null,
        violations: [
          violation('invalid-forwarding-exemption', `Entry ${index} ${errors.join('; ')}.`),
        ],
      }
    : { entry: { ...value }, violations: [] };
}

export function validateForwardingModuleDriftPolicy(
  value,
  { today = new Date().toISOString().slice(0, 10) } = {}
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      entries: [],
      violations: [violation('invalid-forwarding-policy', 'Policy root must be an object.')],
    };
  }
  const violations = [];
  const extra = unknownKeys(value, ROOT_KEYS);
  if (extra.length > 0) {
    violations.push(
      violation('invalid-forwarding-policy', `Policy has unknown keys: ${extra.join(', ')}.`)
    );
  }
  if (value.schemaVersion !== 1) {
    violations.push(violation('invalid-forwarding-policy', 'Policy schemaVersion must be 1.'));
  }
  if (!Array.isArray(value.exemptions)) {
    violations.push(violation('invalid-forwarding-policy', 'Policy exemptions must be an array.'));
    return { entries: [], violations };
  }
  const entries = [];
  const seen = new Set();
  value.exemptions.forEach((rawEntry, index) => {
    const parsed = parseEntry(rawEntry, index, today);
    violations.push(...parsed.violations);
    if (!parsed.entry) return;
    const key = `${parsed.entry.forwarder}->${parsed.entry.consumer}`;
    if (seen.has(key)) {
      violations.push(
        violation('duplicate-forwarding-exemption', `Duplicate exemption for ${key}.`)
      );
      return;
    }
    seen.add(key);
    entries.push(parsed.entry);
  });
  return { entries, violations };
}

export const FORWARDING_MODULE_DRIFT_POLICY_PATH = POLICY_PATH;
