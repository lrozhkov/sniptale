import fs from 'node:fs';
import path from 'node:path';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  repoRoot,
} from '../core/shared.mjs';
import { SEMGREP_RULES_PATH } from '../policy/index.mjs';
import { resolveRepositoryWritePath } from '../policy/repository-contained-paths.mjs';
import { resolveSemgrepCommand, runToolCommand } from '../tools/tool-cli.mjs';
import { AuditExecutionError } from './execution-error.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from './profiles/index.mjs';
import { prepareSanitizedAuditReportPath, writeSanitizedAuditReport } from './report-paths.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';

const SEMGREP_SETTINGS_RELATIVE_PATH = '.tmp/semgrep/settings.yml';
export const SEMGREP_REPORT_PATH = '.tmp/semgrep/results.json';

function toSemgrepViolation(result) {
  return {
    rule: result.check_id,
    file: result.path,
    line: result.start?.line,
    message: result.extra?.message ?? 'Semgrep finding',
  };
}

function describeSemgrepSchema(value) {
  if (!isAuditObject(value) || !Array.isArray(value.results)) {
    return 'root must be an object with a results array';
  }
  for (const [index, finding] of value.results.entries()) {
    if (
      !isAuditObject(finding) ||
      typeof finding.check_id !== 'string' ||
      finding.check_id.length === 0 ||
      typeof finding.path !== 'string' ||
      finding.path.length === 0 ||
      !isAuditObject(finding.start) ||
      !Number.isInteger(finding.start.line) ||
      !isAuditObject(finding.extra)
    ) {
      return `finding ${index} requires check_id, path, start.line, and extra`;
    }
  }
  return null;
}

function createSemgrepSkip(files, skipReasonId, reason) {
  return {
    skipped: true,
    files,
    violations: [],
    skipReasonId,
    reason,
  };
}

function collectSemgrepResult(result, { reportPath, reportRoot, targetFiles }) {
  const status = requireAuditCommandStatus(result, { tool: 'Semgrep scan' });
  const parsed = parseRequiredAuditJson(result.stdout, {
    commandResult: result,
    describeSchema: describeSemgrepSchema,
    source: 'stdout',
    tool: 'Semgrep',
  });
  requireFindingStatusConsistency({
    commandResult: result,
    findingCount: parsed.results.length,
    status,
    tool: 'Semgrep',
  });
  const violations = parsed.results.map(toSemgrepViolation);
  writeSanitizedAuditReport(
    reportPath,
    {
      schemaVersion: 1,
      artifactKind: 'semgrep-results',
      findingCount: violations.length,
      findings: violations,
    },
    { root: reportRoot }
  );
  return {
    skipped: false,
    files: targetFiles,
    reportPath: resolveRepositoryWritePath(reportRoot, reportPath),
    violations,
  };
}

export function runSemgrepCheck({
  files = [],
  rulesPath = SEMGREP_RULES_PATH,
  collectFiles = collectSemgrepScanTargets,
  commandSpec = resolveSemgrepCommand(),
  reportPath = SEMGREP_REPORT_PATH,
  reportRoot = repoRoot,
  runCommandImpl,
} = {}) {
  prepareSanitizedAuditReportPath(reportPath, { root: reportRoot });
  if (!commandSpec) {
    return createSemgrepSkip(
      [],
      AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable,
      'Semgrep is not installed or not on PATH. Install it globally or set SNIPTALE_SEMGREP_BIN.'
    );
  }

  const targetFiles = files.length > 0 ? files : collectFiles();
  if (targetFiles.length === 0) {
    return createSemgrepSkip(
      [],
      AUDIT_ADAPTER_SKIP_REASONS.noApplicableTargets,
      'No files matched the configured Semgrep scan scope.'
    );
  }

  const result = runSemgrepScan({ commandSpec, files: targetFiles, rulesPath, runCommandImpl });
  return collectSemgrepResult(result, {
    reportPath,
    reportRoot,
    targetFiles,
  });
}

export function collectSemgrepScanTargets() {
  return collectCodeFiles();
}

export function prepareSemgrepSettings(commandSpec, { root = repoRoot } = {}) {
  try {
    let settingsPath = resolveRepositoryWritePath(root, SEMGREP_SETTINGS_RELATIVE_PATH);
    if (commandSpec.env?.SEMGREP_SETTINGS_FILE !== settingsPath) {
      throw new Error(
        `Semgrep settings path must be ${SEMGREP_SETTINGS_RELATIVE_PATH} inside the repository`
      );
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    settingsPath = resolveRepositoryWritePath(root, SEMGREP_SETTINGS_RELATIVE_PATH);
    fs.rmSync(settingsPath, { force: true });
    return settingsPath;
  } catch (error) {
    if (error instanceof AuditExecutionError) throw error;
    throw new AuditExecutionError(
      'bootstrap-failed',
      `Semgrep settings bootstrap failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function runSemgrepScan({ commandSpec, files, rulesPath, runCommandImpl }) {
  const scanPaths = files.length > 0 ? files : collectSemgrepScanTargets();
  prepareSemgrepSettings(commandSpec);
  return runToolCommand(
    commandSpec.command,
    [
      ...commandSpec.args,
      'scan',
      '--config',
      rulesPath,
      '--json',
      '--quiet',
      '--error',
      '--metrics=off',
      '--disable-version-check',
      ...scanPaths,
    ],
    {
      cwd: repoRoot,
      env: commandSpec.env,
    },
    runCommandImpl
  );
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runSemgrepCheck({ files: parseFilesArgument(process.argv.slice(2)) });

  if (result.skipped) {
    process.stderr.write(`${result.reason ?? 'Semgrep check skipped'}\n`);
    process.exit(1);
  }

  if (result.violations.length > 0) {
    process.stderr.write(`Semgrep report: ${result.reportPath}\n`);
    printViolations('Semgrep violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write(`Semgrep passed; report=${result.reportPath}\n`);
}
