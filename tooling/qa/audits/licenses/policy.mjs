import { isAuditObject, parseRequiredAuditJson } from '../result-contract.mjs';

const POLICY_FIELDS = new Set([
  '$comment',
  'deniedLicenses',
  'firstPartyLicense',
  'mode',
  'reviewedExceptions',
]);
const REVIEWED_EXCEPTION_FIELDS = new Set([
  'approvalOwner',
  'artifactInclusion',
  'debtId',
  'dependencyScope',
  'expiresOn',
  'licenseExpression',
  'packageName',
  'reason',
  'resolvedVersion',
]);
const POLICY_MODES = new Set(['hardfail', 'report-only']);

function hasExactFields(value, expected) {
  const fields = Object.keys(value);
  return fields.length === expected.size && fields.every((field) => expected.has(field));
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function describeReviewedException(value, index) {
  if (!isAuditObject(value) || !hasExactFields(value, REVIEWED_EXCEPTION_FIELDS)) {
    return `reviewedExceptions[${index}] must contain the exact reviewed-decision fields`;
  }
  for (const field of REVIEWED_EXCEPTION_FIELDS) {
    if (!isNonemptyString(value[field])) {
      return `reviewedExceptions[${index}].${field} must be a non-empty string`;
    }
  }
  if (!isCalendarDate(value.expiresOn)) {
    return `reviewedExceptions[${index}].expiresOn must be a valid YYYY-MM-DD date`;
  }
  return null;
}

function describeLicensePolicy(value) {
  if (!isAuditObject(value)) return 'root must be an object';
  const permittedFields =
    value.$comment === undefined
      ? new Set([...POLICY_FIELDS].filter((field) => field !== '$comment'))
      : POLICY_FIELDS;
  if (!hasExactFields(value, permittedFields)) {
    return 'root must contain only mode, firstPartyLicense, deniedLicenses, reviewedExceptions, and optional $comment';
  }
  if (!POLICY_MODES.has(value.mode)) {
    return 'mode must be hardfail or report-only';
  }
  if (value.$comment !== undefined && !isNonemptyString(value.$comment)) {
    return '$comment must be a non-empty string when present';
  }
  if (!isNonemptyString(value.firstPartyLicense)) {
    return 'firstPartyLicense must be a non-empty string';
  }
  if (
    !Array.isArray(value.deniedLicenses) ||
    value.deniedLicenses.length === 0 ||
    !value.deniedLicenses.every(isNonemptyString) ||
    new Set(value.deniedLicenses).size !== value.deniedLicenses.length
  ) {
    return 'deniedLicenses must be a non-empty array of unique non-empty strings';
  }
  if (!Array.isArray(value.reviewedExceptions)) {
    return 'reviewedExceptions must be an array';
  }
  for (const [index, exception] of value.reviewedExceptions.entries()) {
    const problem = describeReviewedException(exception, index);
    if (problem) return problem;
  }
  return null;
}

export function parseLicensePolicy(value) {
  return parseRequiredAuditJson(value, {
    describeSchema: describeLicensePolicy,
    source: 'policy file',
    tool: 'License audit',
  });
}
