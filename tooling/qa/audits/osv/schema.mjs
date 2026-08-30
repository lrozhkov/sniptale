import path from 'node:path';

import { isAuditObject } from '../contracts/result-contract.mjs';

const CLASSIFIED_SEVERITIES = new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

function decimalDigits(value) {
  return value.length > 0 && [...value].every((character) => character >= '0' && character <= '9');
}

function isCanonicalScoreString(value) {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  const parts = value.split('.');
  if (parts.length > 2 || !decimalDigits(parts[0])) return false;
  if (parts.length === 2 && !decimalDigits(parts[1])) return false;
  if (parts[0].length > 1 && parts[0].startsWith('0')) return false;
  const integer = Number(parts[0]);
  if (integer < 10) return true;
  if (integer > 10) return false;
  return parts.length === 1 || [...parts[1]].every((character) => character === '0');
}

export function isOsvGroupScore(value) {
  return value === undefined || value === '' || isCanonicalScoreString(value);
}

export function severityFromOsvGroupScore(value) {
  if (value === undefined || value === '') return null;
  if (!isOsvGroupScore(value)) {
    throw new TypeError(`Invalid OSV group severity: ${JSON.stringify(value)}`);
  }
  const score = Number(value);
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MODERATE';
  return score > 0 ? 'LOW' : null;
}

export function normalizeOsvNamedSeverity(value, vulnerabilityId) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).toUpperCase();
  const severity = normalized === 'MEDIUM' ? 'MODERATE' : normalized;
  if (!CLASSIFIED_SEVERITIES.has(severity)) {
    throw new Error(
      `OSV-Scanner returned vulnerability ${vulnerabilityId} with unknown or unsupported severity ${normalized}`
    );
  }
  return severity;
}

function hasPackageIdentity(value) {
  return (
    isAuditObject(value) &&
    ['name', 'version', 'ecosystem'].every(
      (field) => typeof value[field] === 'string' && value[field].length > 0
    )
  );
}

function isGroup(value) {
  return (
    isAuditObject(value) &&
    Array.isArray(value.ids) &&
    value.ids.length > 0 &&
    new Set(value.ids).size === value.ids.length &&
    value.ids.every((id) => typeof id === 'string' && id.length > 0) &&
    isOsvGroupScore(value.max_severity)
  );
}

function isVulnerability(value) {
  const aliasesValid =
    value?.aliases === undefined ||
    (Array.isArray(value.aliases) &&
      new Set(value.aliases).size === value.aliases.length &&
      value.aliases.every((item) => typeof item === 'string' && item.length > 0));
  const severityValid =
    value?.severity === undefined ||
    (Array.isArray(value.severity) &&
      value.severity.every(
        (entry) =>
          isAuditObject(entry) &&
          ['CVSS_V2', 'CVSS_V3', 'CVSS_V4'].includes(entry.type) &&
          typeof entry.score === 'string' &&
          entry.score.length > 0
      ));
  const databaseSeverityValid =
    value?.database_specific === undefined ||
    (isAuditObject(value.database_specific) &&
      (value.database_specific.severity === undefined ||
        (typeof value.database_specific.severity === 'string' &&
          value.database_specific.severity.length > 0)));
  return (
    isAuditObject(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    [value.summary, value.details].some((text) => typeof text === 'string' && text.length > 0) &&
    aliasesValid &&
    severityValid &&
    databaseSeverityValid
  );
}

function describePackage(entry, resultIndex, packageIndex) {
  const label = `result ${resultIndex} package ${packageIndex}`;
  if (
    !isAuditObject(entry) ||
    !hasPackageIdentity(entry.package) ||
    !Array.isArray(entry.vulnerabilities) ||
    !Array.isArray(entry.groups)
  ) {
    return `${label} has an invalid package shape`;
  }
  if (!entry.groups.every(isGroup)) return `${label} has an invalid group`;
  if (!entry.vulnerabilities.every(isVulnerability)) return `${label} has an invalid vulnerability`;
  const vulnerabilities = new Map();
  const admittedIds = new Set();
  for (const vulnerability of entry.vulnerabilities) {
    if (vulnerabilities.has(vulnerability.id)) return `${label} has duplicate vulnerability ids`;
    vulnerabilities.set(vulnerability.id, vulnerability);
    admittedIds.add(vulnerability.id);
    for (const alias of vulnerability.aliases ?? []) admittedIds.add(alias);
  }
  const groupKeys = new Set();
  for (const group of entry.groups) {
    if (group.ids.some((id) => !admittedIds.has(id)))
      return `${label} group references an unknown id`;
    const key = [...group.ids].sort().join('\0');
    if (groupKeys.has(key)) return `${label} has duplicate groups`;
    groupKeys.add(key);
  }
  for (const vulnerability of entry.vulnerabilities) {
    const identities = new Set([vulnerability.id, ...(vulnerability.aliases ?? [])]);
    const related = entry.groups.filter((group) => group.ids.some((id) => identities.has(id)));
    if (related.length !== 1) return `${label} vulnerability must belong to exactly one group`;
  }
  return null;
}

function normalizeSource(sourcePath, { lockRoots, root }) {
  const absolute = path.isAbsolute(sourcePath)
    ? path.normalize(sourcePath)
    : path.resolve(root, sourcePath);
  const normalizedLocks = new Map(
    lockRoots.map((lockRoot) => [path.resolve(root, lockRoot), lockRoot.replaceAll('\\', '/')])
  );
  const normalized = normalizedLocks.get(absolute);
  if (!normalized)
    throw new Error(`OSV-Scanner returned an unrequested lock source: ${sourcePath}`);
  return normalized;
}

export function describeOsvSchema(
  value,
  { lockRoots = ['package-lock.json'], root = process.cwd() } = {}
) {
  if (!isAuditObject(value) || !Array.isArray(value.results)) {
    return 'root must be an object with a results array';
  }
  for (const [resultIndex, result] of value.results.entries()) {
    if (
      !isAuditObject(result) ||
      !isAuditObject(result.source) ||
      result.source.type !== 'lockfile' ||
      typeof result.source.path !== 'string' ||
      result.source.path.length === 0 ||
      !Array.isArray(result.packages)
    ) {
      return `result ${resultIndex} must contain an exact lockfile source and packages array`;
    }
    try {
      normalizeSource(result.source.path, { lockRoots, root });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    for (const [packageIndex, entry] of result.packages.entries()) {
      const problem = describePackage(entry, resultIndex, packageIndex);
      if (problem) return problem;
    }
  }
  return null;
}

export function normalizeOsvReport(parsed, options) {
  const problem = describeOsvSchema(parsed, options);
  if (problem) throw new Error(`OSV-Scanner output is invalid: ${problem}`);
  return {
    ...parsed,
    results: parsed.results.map((result) => ({
      ...result,
      source: {
        path: normalizeSource(result.source.path, options),
        type: 'lockfile',
      },
    })),
  };
}

export function countOsvFindings(parsed) {
  return parsed.results.reduce(
    (total, result) =>
      total + result.packages.reduce((count, entry) => count + entry.groups.length, 0),
    0
  );
}
