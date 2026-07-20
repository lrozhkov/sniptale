/**
 * npm registry signature verification gate.
 */

import { isExecutedAsScript, runNpm } from '../core/shared.mjs';
import { printNpmCommandGateResult, runNpmCommandGate } from './npm-command-gate.mjs';
import { isAuditObject } from './result-contract.mjs';

const INVALID_SIGNATURE_CODES = new Set(['EATTESTATIONVERIFY', 'EINTEGRITYSIGNATURE']);
export const NPM_AUDIT_SIGNATURES_REPORT_PATH = '.tmp/npm-audit/signatures.json';

function hasPackageIdentity(finding) {
  return (
    isAuditObject(finding) &&
    typeof finding.name === 'string' &&
    finding.name.length > 0 &&
    typeof finding.version === 'string' &&
    finding.version.length > 0 &&
    typeof finding.registry === 'string' &&
    finding.registry.length > 0 &&
    typeof finding.location === 'string' &&
    finding.location.length > 0
  );
}

function describeSignatureSchema(value) {
  if (!isAuditObject(value) || !Array.isArray(value.invalid) || !Array.isArray(value.missing)) {
    return 'root must contain invalid and missing arrays';
  }
  for (const finding of value.missing) {
    if (!hasPackageIdentity(finding)) {
      return 'missing signature findings require name, version, registry, and location';
    }
  }
  for (const finding of value.invalid) {
    if (
      !hasPackageIdentity(finding) ||
      !INVALID_SIGNATURE_CODES.has(finding.code) ||
      typeof finding.message !== 'string' ||
      finding.message.length === 0
    ) {
      return 'invalid signature findings require package identity, a recognized code, and message';
    }
  }
  return null;
}

function toSignatureViolations(parsed) {
  return [
    ...parsed.invalid.map((finding) => ({
      rule: `npm-signature-${finding.code.toLowerCase()}`,
      file: 'package-lock.json',
      message: `${finding.name}@${finding.version} (${finding.registry}): ${finding.message}`,
    })),
    ...parsed.missing.map((finding) => ({
      rule: 'npm-signature-missing',
      file: 'package-lock.json',
      message: `${finding.name}@${finding.version} (${finding.registry}): missing registry signature`,
    })),
  ];
}

export function runAuditSignatures({
  runNpmImpl = runNpm,
  cwd = process.cwd(),
  reportPath = NPM_AUDIT_SIGNATURES_REPORT_PATH,
  reportRoot = cwd,
} = {}) {
  return runNpmCommandGate({
    args: ['audit', 'signatures', '--json'],
    cwd,
    describeSchema: describeSignatureSchema,
    detail: (parsed) =>
      `registry signatures verified; invalid=${parsed.invalid.length}; missing=${parsed.missing.length}`,
    findingCount: (parsed) => parsed.invalid.length + parsed.missing.length,
    reportPath,
    reportRoot,
    runNpmImpl,
    toViolations: toSignatureViolations,
    tool: 'npm audit signatures',
  });
}

if (isExecutedAsScript(import.meta.url)) {
  process.exitCode = printNpmCommandGateResult('npm audit signatures', runAuditSignatures());
}
