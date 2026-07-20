import { classifyCvssEvidence } from './cvss.mjs';
import { severityFromOsvGroupScore } from './severity.mjs';

const BLOCKING_SEVERITIES = new Set(['HIGH', 'CRITICAL']);
const CLASSIFIED_SEVERITIES = new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']);

function normalizeNamedSeverity(value, vulnerabilityId) {
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

function vulnerabilitySeverity(vulnerability, groups) {
  const evidence = [];
  const direct = normalizeNamedSeverity(
    vulnerability.database_specific?.severity,
    vulnerability.id
  );
  if (direct) evidence.push(direct);
  const groupSeverities = [];
  for (const group of groups) {
    const severity = severityFromOsvGroupScore(group.max_severity);
    if (severity) groupSeverities.push(severity);
  }
  evidence.push(...groupSeverities);
  for (const entry of vulnerability.severity ?? []) {
    const severity = classifyCvssEvidence(entry, groupSeverities);
    if (!severity) {
      throw new Error(
        [
          `OSV-Scanner returned vulnerability ${vulnerability.id}`,
          `with unclassifiable ${entry.type} evidence ${entry.score}`,
        ].join(' ')
      );
    }
    evidence.push(severity);
  }
  return evidence.reduce(
    (highest, severity) =>
      [...CLASSIFIED_SEVERITIES].indexOf(severity) > [...CLASSIFIED_SEVERITIES].indexOf(highest)
        ? severity
        : highest,
    'UNKNOWN'
  );
}

function relatedGroups(vulnerability, groups) {
  const ids = new Set([vulnerability.id, ...(vulnerability.aliases ?? [])]);
  return groups.filter((group) => group.ids.some((id) => ids.has(id)));
}

function toViolation(source, packageEntry, vulnerability, severity) {
  const packageLabel = `${packageEntry.package.name}@${packageEntry.package.version}`;
  return {
    rule: vulnerability.id,
    file: source.path,
    message: `${severity}: ${packageLabel}: ${vulnerability.summary ?? vulnerability.details}`,
  };
}

export function collectOsvViolations(parsed) {
  const violations = [];
  for (const result of parsed.results) {
    for (const packageEntry of result.packages) {
      for (const vulnerability of packageEntry.vulnerabilities) {
        const severity = vulnerabilitySeverity(
          vulnerability,
          relatedGroups(vulnerability, packageEntry.groups ?? [])
        );
        if (!CLASSIFIED_SEVERITIES.has(severity)) {
          throw new Error(
            `OSV-Scanner returned vulnerability ${vulnerability.id} with unknown or unsupported severity ${severity}`
          );
        }
        if (BLOCKING_SEVERITIES.has(severity)) {
          violations.push(toViolation(result.source, packageEntry, vulnerability, severity));
        }
      }
    }
  }
  return violations;
}
