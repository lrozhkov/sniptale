import { normalizeOsvNamedSeverity, severityFromOsvGroupScore } from './schema.mjs';

const BLOCKING_SEVERITIES = new Set(['HIGH', 'CRITICAL']);
const SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function highestSeverity(evidence) {
  return evidence.reduce(
    (highest, severity) =>
      SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(highest) ? severity : highest,
    null
  );
}

function groupMembers(group, vulnerabilities) {
  const groupIds = new Set(group.ids);
  return vulnerabilities.filter((vulnerability) =>
    [vulnerability.id, ...(vulnerability.aliases ?? [])].some((id) => groupIds.has(id))
  );
}

function groupSeverity(group, vulnerabilities) {
  const evidence = [severityFromOsvGroupScore(group.max_severity)].filter(Boolean);
  for (const vulnerability of vulnerabilities) {
    const named = normalizeOsvNamedSeverity(
      vulnerability.database_specific?.severity,
      vulnerability.id
    );
    if (named) evidence.push(named);
  }
  const severity = highestSeverity(evidence);
  if (!severity) {
    throw new Error(
      `OSV-Scanner returned group ${group.ids.join(',')} without classifiable native severity`
    );
  }
  return severity;
}

function toViolation(source, packageEntry, group, vulnerabilities, severity) {
  const packageLabel = `${packageEntry.package.name}@${packageEntry.package.version}`;
  const rule = [...group.ids].sort()[0];
  const detail =
    vulnerabilities[0]?.summary ?? vulnerabilities[0]?.details ?? 'vulnerability group';
  return {
    rule,
    file: source.path,
    message: `${severity}: ${packageLabel}: ${detail}`,
  };
}

export function collectOsvViolations(parsed) {
  const violations = [];
  for (const result of parsed.results) {
    for (const packageEntry of result.packages) {
      for (const group of packageEntry.groups) {
        const vulnerabilities = groupMembers(group, packageEntry.vulnerabilities);
        const severity = groupSeverity(group, vulnerabilities);
        if (BLOCKING_SEVERITIES.has(severity)) {
          violations.push(
            toViolation(result.source, packageEntry, group, vulnerabilities, severity)
          );
        }
      }
    }
  }
  return violations;
}
