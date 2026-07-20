import { isStableId } from './identifiers.mjs';

export function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export function assertExactKeys(value, allowedKeys, label) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new TypeError(`${label} contains unsupported fields: ${unexpected.join(', ')}`);
  }
}

export function assertId(value, label) {
  if (!isStableId(value)) throw new TypeError(`${label} must be a stable lowercase identifier`);
}

export function assertIsoTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be an ISO timestamp`);
  }
}

export function assertNonNegativeNumber(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

export function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

export function assertStringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  for (const item of value) assertId(item, `${label} item`);
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${label} must not contain duplicates`);
  }
}
