/**
 * npm audit gate.
 */

import { isExecutedAsScript, runNpm } from '../core/shared.mjs';
import { printNpmCommandGateResult, runNpmCommandGate } from './npm-command-gate.mjs';
import { isAuditObject } from './result-contract.mjs';

export const NPM_AUDIT_REPORT_PATH = '.tmp/npm-audit/results.json';

const AUDIT_SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const AUDIT_SEVERITY_RANK = new Map(AUDIT_SEVERITIES.map((severity, index) => [severity, index]));

function isClassifiableVia(value) {
  if (typeof value === 'string') return value.length > 0;
  return (
    isAuditObject(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    AUDIT_SEVERITIES.includes(value.severity)
  );
}

function isClassifiableFix(value) {
  if (typeof value === 'boolean') return true;
  return (
    isAuditObject(value) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
    typeof value.isSemVerMajor === 'boolean'
  );
}

function describeVulnerability(value, packageName) {
  if (
    !isAuditObject(value) ||
    value.name !== packageName ||
    !AUDIT_SEVERITIES.includes(value.severity) ||
    typeof value.isDirect !== 'boolean' ||
    !Array.isArray(value.via) ||
    value.via.length === 0 ||
    !value.via.every(isClassifiableVia) ||
    !Array.isArray(value.effects) ||
    !value.effects.every((effect) => typeof effect === 'string' && effect.length > 0) ||
    typeof value.range !== 'string' ||
    value.range.length === 0 ||
    !Array.isArray(value.nodes) ||
    !value.nodes.every((node) => typeof node === 'string' && node.length > 0) ||
    !isClassifiableFix(value.fixAvailable)
  ) {
    return `vulnerability ${packageName} is incomplete or unclassifiable`;
  }
  return null;
}

function describeNpmAuditSchema(value) {
  if (
    !isAuditObject(value) ||
    value.auditReportVersion !== 2 ||
    !isAuditObject(value.vulnerabilities) ||
    !isAuditObject(value.metadata) ||
    !isAuditObject(value.metadata.vulnerabilities)
  ) {
    return 'root requires auditReportVersion, vulnerabilities, and metadata.vulnerabilities';
  }
  const counts = value.metadata.vulnerabilities;
  for (const severity of [...AUDIT_SEVERITIES, 'total']) {
    if (!Number.isInteger(counts[severity]) || counts[severity] < 0) {
      return `metadata.vulnerabilities.${severity} must be a non-negative integer`;
    }
  }
  const observedCounts = Object.fromEntries(AUDIT_SEVERITIES.map((severity) => [severity, 0]));
  for (const [packageName, vulnerability] of Object.entries(value.vulnerabilities)) {
    const schemaProblem = describeVulnerability(vulnerability, packageName);
    if (schemaProblem) return schemaProblem;
    observedCounts[vulnerability.severity] += 1;
  }
  for (const severity of AUDIT_SEVERITIES) {
    if (counts[severity] !== observedCounts[severity]) {
      return `metadata.vulnerabilities.${severity} contradicts vulnerability records`;
    }
  }
  const observedTotal = Object.keys(value.vulnerabilities).length;
  if (counts.total !== observedTotal) {
    return 'metadata.vulnerabilities.total contradicts vulnerability records';
  }
  return null;
}

function effectiveVulnerabilitySeverity(vulnerability) {
  const severities = [
    vulnerability.severity,
    ...vulnerability.via.filter((via) => isAuditObject(via)).map((via) => via.severity),
  ];
  return severities.reduce((highest, severity) =>
    AUDIT_SEVERITY_RANK.get(severity) > AUDIT_SEVERITY_RANK.get(highest) ? severity : highest
  );
}

function countActionableVulnerabilities(parsed) {
  return Object.values(parsed.vulnerabilities).filter((vulnerability) =>
    ['high', 'critical'].includes(effectiveVulnerabilitySeverity(vulnerability))
  ).length;
}

export function runAudit({
  runNpmImpl = runNpm,
  cwd = process.cwd(),
  reportPath = NPM_AUDIT_REPORT_PATH,
  reportRoot = cwd,
} = {}) {
  return runNpmCommandGate({
    args: ['audit', '--audit-level=high', '--json'],
    cwd,
    describeSchema: describeNpmAuditSchema,
    detail: () => 'live npm audit',
    findingCount: countActionableVulnerabilities,
    reportPath,
    reportRoot,
    runNpmImpl,
    tool: 'npm audit',
  });
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = printNpmCommandGateResult('npm audit', runAudit());
}
