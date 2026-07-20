import fs from 'node:fs';

import { isExecutedAsScript, printViolations, repoRoot } from '../core/shared.mjs';
import { GITLEAKS_BASELINE_PATH, GITLEAKS_CONFIG_PATH } from '../policy/index.mjs';
import { resolveGitleaksExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import { applyGitleaksBaseline, gitleaksHistoryFingerprint } from './gitleaks-baseline.mjs';
import { prepareAuditReportPath, resolveAuditReportPath } from './report-paths.mjs';
import { AuditExecutionError } from './execution-error.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';

export const GITLEAKS_REPORT_PATH = '.tmp/gitleaks/report.json';
export const GITLEAKS_SCAN_SCOPES = Object.freeze(['worktree', 'history']);

function describeGitleaksSchema(value, scope) {
  if (!Array.isArray(value)) return 'root must be an array';
  const fingerprints = new Set();
  for (const [index, finding] of value.entries()) {
    if (
      !isAuditObject(finding) ||
      typeof finding.RuleID !== 'string' ||
      finding.RuleID.length === 0 ||
      typeof finding.File !== 'string' ||
      finding.File.length === 0 ||
      !Number.isInteger(finding.StartLine) ||
      typeof finding.Fingerprint !== 'string' ||
      finding.Fingerprint.length === 0
    ) {
      return `finding ${index} requires RuleID, File, StartLine, and Fingerprint`;
    }
    if (scope !== 'history') continue;
    if (!/^[0-9a-f]{40}$/u.test(finding.Commit ?? '')) {
      return `history finding ${index} requires a 40-character Commit`;
    }
    if (finding.Fingerprint !== gitleaksHistoryFingerprint(finding)) {
      return `history finding ${index} fingerprint does not match its complete tuple`;
    }
    if (fingerprints.has(finding.Fingerprint)) {
      return `history finding ${index} duplicates fingerprint ${finding.Fingerprint}`;
    }
    fingerprints.add(finding.Fingerprint);
  }
  return null;
}

function readGitleaksFindings(absoluteReportPath, scope, status, commandResult) {
  const report = fs.existsSync(absoluteReportPath)
    ? fs.readFileSync(absoluteReportPath, 'utf8')
    : null;
  const findings = parseRequiredAuditJson(report, {
    commandResult,
    describeSchema: (value) => describeGitleaksSchema(value, scope),
    source: `report ${absoluteReportPath}`,
    tool: 'Gitleaks',
  });
  requireFindingStatusConsistency({
    commandResult,
    findingCount: findings.length,
    status,
    tool: 'Gitleaks',
  });
  return findings;
}

function validateScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new TypeError('Gitleaks scopes must be a non-empty array');
  }
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError('Gitleaks scopes must be unique');
  }
  const invalid = scopes.filter((scope) => !GITLEAKS_SCAN_SCOPES.includes(scope));
  if (invalid.length > 0) throw new TypeError(`Unknown Gitleaks scopes: ${invalid.join(', ')}`);
}

function scopeReportPath(absoluteReportPath, scope, scopeCount) {
  if (scopeCount === 1) return absoluteReportPath;
  return absoluteReportPath.replace(/\.json$/u, `.${scope}.json`);
}

function gitleaksScopeArguments(scope) {
  return scope === 'history' ? ['git', '.'] : ['dir', '.'];
}

function runGitleaksScope({ absoluteReportPath, configPath, executable, runCommandImpl, scope }) {
  prepareAuditReportPath(absoluteReportPath);
  const result = runToolCommand(
    executable,
    [
      ...gitleaksScopeArguments(scope),
      '--report-format',
      'json',
      '--report-path',
      absoluteReportPath,
      '--redact',
      '--no-banner',
      '--config',
      configPath,
    ],
    { cwd: repoRoot },
    runCommandImpl
  );
  const status = requireAuditCommandStatus(result, { tool: `Gitleaks ${scope} scan` });
  return readGitleaksFindings(absoluteReportPath, scope, status, result);
}

function writeCombinedReport(absoluteReportPath, scopedFindings) {
  const findings = scopedFindings.flatMap(({ findings: scopeFindings, scope }) =>
    scopeFindings.map((finding) => ({ ...finding, SniptaleScope: scope }))
  );
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(findings, null, 2)}\n`);
}

export function runGitleaksCheck({
  baselinePath = GITLEAKS_BASELINE_PATH,
  executable = resolveGitleaksExecutable(),
  configPath = GITLEAKS_CONFIG_PATH,
  reportPath = GITLEAKS_REPORT_PATH,
  scopes = ['worktree'],
  runCommandImpl,
} = {}) {
  if (!executable) {
    throw new AuditExecutionError(
      'tool-unavailable',
      'Gitleaks CLI is required for qa:audit. Install the official binary or set SNIPTALE_GITLEAKS_BIN.'
    );
  }
  validateScopes(scopes);
  const absoluteReportPath = resolveAuditReportPath(reportPath);
  const scopedFindings = scopes.map((scope) => ({
    scope,
    findings: runGitleaksScope({
      absoluteReportPath: scopeReportPath(absoluteReportPath, scope, scopes.length),
      configPath,
      executable,
      runCommandImpl,
      scope,
    }),
  }));
  writeCombinedReport(absoluteReportPath, scopedFindings);
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    scopes: [...scopes],
    ...applyGitleaksBaseline({ baselinePath, scopedFindings, scopes }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  try {
    const result = runGitleaksCheck();
    if (result.violations.length > 0) {
      process.stderr.write(`Gitleaks report: ${result.reportPath}\n`);
      printViolations('Gitleaks secrets found:', result.violations);
      process.exit(1);
    }
    process.stdout.write(`Gitleaks passed; report=${result.reportPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Gitleaks failed: ${message}\n`);
    process.exit(1);
  }
}
