import { isAuditObject } from '../result-contract.mjs';
import { isOsvGroupScore } from './severity.mjs';

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
    value.ids.every((id) => typeof id === 'string' && id.length > 0) &&
    isOsvGroupScore(value.max_severity)
  );
}

function isVulnerability(value) {
  const aliasesValid =
    value?.aliases === undefined ||
    (Array.isArray(value.aliases) && value.aliases.every((item) => typeof item === 'string'));
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
    (entry.groups !== undefined && !Array.isArray(entry.groups))
  ) {
    return `${label} has an invalid package shape`;
  }
  if (!(entry.groups ?? []).every(isGroup)) return `${label} has an invalid group`;
  return entry.vulnerabilities.every(isVulnerability)
    ? null
    : `${label} has an invalid vulnerability`;
}

export function describeOsvSchema(value) {
  if (!isAuditObject(value) || !Array.isArray(value.results)) {
    return 'root must be an object with a results array';
  }
  for (const [resultIndex, result] of value.results.entries()) {
    if (
      !isAuditObject(result) ||
      !isAuditObject(result.source) ||
      typeof result.source.path !== 'string' ||
      result.source.path.length === 0 ||
      !Array.isArray(result.packages)
    ) {
      return `result ${resultIndex} must contain a source path and packages array`;
    }
    for (const [packageIndex, entry] of result.packages.entries()) {
      const problem = describePackage(entry, resultIndex, packageIndex);
      if (problem) return problem;
    }
  }
  return null;
}

export function countOsvFindings(parsed) {
  return parsed.results.reduce(
    (total, result) =>
      total + result.packages.reduce((count, entry) => count + entry.vulnerabilities.length, 0),
    0
  );
}
