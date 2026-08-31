import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import {
  GITLEAKS_BASELINE_PATH,
  GITLEAKS_CONFIG_PATH,
} from '../../policy/external-tools/external-tools.mjs';
import { resolveGitleaksExecutable, runToolCommand } from '../../tools/tool-cli.mjs';
import { applyGitleaksBaseline, normalizeGitleaksFinding } from './gitleaks-baseline.mjs';
import { prepareAuditReportPath, resolveAuditReportPath } from '../contracts/report-paths.mjs';
import { AuditExecutionError } from '../contracts/execution-error.mjs';
import {
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from '../contracts/result-contract.mjs';

export const GITLEAKS_REPORT_PATH = '.tmp/gitleaks/report.json';
export const GITLEAKS_SCAN_SCOPES = Object.freeze(['worktree', 'history']);

function describeGitleaksSchema(value, scope) {
  if (!Array.isArray(value)) return 'root must be an array';
  const fingerprints = new Set();
  for (const [index, finding] of value.entries()) {
    let normalized;
    try {
      normalized = normalizeGitleaksFinding(finding, { scope });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    if (fingerprints.has(normalized.Fingerprint)) {
      return `${scope} finding ${index} duplicates fingerprint ${normalized.Fingerprint}`;
    }
    fingerprints.add(normalized.Fingerprint);
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
  return findings.map((finding) => normalizeGitleaksFinding(finding, { scope }));
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

function createWorktreeSnapshot(root) {
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-gitleaks-'));
  const inventory = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\0')
    .filter(Boolean);
  for (const relativePath of inventory) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const target = path.join(snapshotRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return snapshotRoot;
}

function runGitleaksScope({
  absoluteReportPath,
  configPath,
  executable,
  root,
  runCommandImpl,
  scope,
}) {
  const snapshotRoot =
    scope === 'worktree' && runCommandImpl === undefined ? createWorktreeSnapshot(root) : null;
  prepareAuditReportPath(absoluteReportPath);
  try {
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
        path.isAbsolute(configPath) ? configPath : path.join(root, configPath),
      ],
      { cwd: snapshotRoot ?? root },
      runCommandImpl
    );
    const status = requireAuditCommandStatus(result, { tool: `Gitleaks ${scope} scan` });
    return readGitleaksFindings(absoluteReportPath, scope, status, result);
  } finally {
    fs.rmSync(absoluteReportPath, { force: true });
    if (snapshotRoot) fs.rmSync(snapshotRoot, { force: true, recursive: true });
  }
}

function writeCombinedReport(absoluteReportPath, scopedFindings) {
  const findings = scopedFindings.flatMap(({ findings: scopeFindings, scope }) =>
    scopeFindings.map((finding) => ({ ...finding, SniptaleScope: scope }))
  );
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  const temporaryPath = `${absoluteReportPath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(findings, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, absoluteReportPath);
}

export function runGitleaksCheck({
  baselinePath = GITLEAKS_BASELINE_PATH,
  executable = resolveGitleaksExecutable(),
  configPath = GITLEAKS_CONFIG_PATH,
  reportPath = GITLEAKS_REPORT_PATH,
  root = repoRoot,
  scopes = ['worktree'],
  runCommandImpl,
} = {}) {
  if (!executable) {
    throw new AuditExecutionError(
      'tool-unavailable',
      'Gitleaks CLI is required for the full audit. Install the official binary or set SNIPTALE_GITLEAKS_BIN.'
    );
  }
  validateScopes(scopes);
  const absoluteReportPath = resolveAuditReportPath(reportPath, { root });
  const scopedFindings = scopes.map((scope) => ({
    scope,
    findings: runGitleaksScope({
      absoluteReportPath: scopeReportPath(absoluteReportPath, scope, scopes.length),
      configPath,
      executable,
      root,
      runCommandImpl,
      scope,
    }),
  }));
  writeCombinedReport(absoluteReportPath, scopedFindings);
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    scopes: [...scopes],
    ...applyGitleaksBaseline({
      baselinePath,
      root,
      scopedFindings,
      scopes,
      validateDebtLinks: runCommandImpl === undefined,
    }),
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
