import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { resolveOsvScannerExecutable, runToolCommand } from '../../tools/tool-cli.mjs';
import { AuditExecutionError } from '../contracts/execution-error.mjs';
import { writeSanitizedAuditReport } from '../contracts/report-paths.mjs';
import {
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from '../contracts/result-contract.mjs';
import { countOsvFindings, describeOsvSchema, normalizeOsvReport } from './schema.mjs';
import { collectOsvViolations } from './violations.mjs';

export const OSV_REPORT_PATH = '.tmp/osv/results.json';
export const OSV_LOCK_CONFIG_PATH = 'tooling/configs/ci/dependency-freshness.json';

function readOsvLockRoots({ configPath, root }) {
  const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Required OSV lock-root config is malformed: ${absoluteConfigPath}`, {
      cause: error,
    });
  }
  if (
    config?.schemaVersion !== 1 ||
    !Array.isArray(config.npmLockRoots) ||
    config.npmLockRoots.length === 0 ||
    new Set(config.npmLockRoots).size !== config.npmLockRoots.length ||
    config.npmLockRoots.some(
      (lockRoot) =>
        typeof lockRoot !== 'string' ||
        lockRoot.length === 0 ||
        path.isAbsolute(lockRoot) ||
        lockRoot.split(/[\\/]/u).includes('..') ||
        path.basename(lockRoot) !== 'package-lock.json'
    )
  ) {
    throw new Error('OSV lock-root config must contain unique repository-relative npm locks');
  }
  for (const lockRoot of config.npmLockRoots) {
    const absoluteLockRoot = path.join(root, lockRoot);
    if (!fs.statSync(absoluteLockRoot).isFile()) {
      throw new Error(`OSV lock root is not a file: ${lockRoot}`);
    }
  }
  return config.npmLockRoots;
}

export function runOsvCheck({
  configPath = OSV_LOCK_CONFIG_PATH,
  executable = resolveOsvScannerExecutable(),
  reportPath = OSV_REPORT_PATH,
  root = repoRoot,
  runCommandImpl,
} = {}) {
  if (!executable) {
    throw new AuditExecutionError(
      'tool-unavailable',
      'OSV-Scanner CLI is required for the full audit. Install the official binary or set SNIPTALE_OSV_SCANNER_BIN.'
    );
  }

  const lockRoots = readOsvLockRoots({ configPath, root });
  const result = runToolCommand(
    executable,
    ['scan', 'source', ...lockRoots.flatMap((lockRoot) => ['-L', lockRoot]), '--format', 'json'],
    { cwd: root },
    runCommandImpl
  );
  const status = requireAuditCommandStatus(result, { tool: 'OSV-Scanner scan' });
  const parsed = parseRequiredAuditJson(result.stdout, {
    commandResult: result,
    describeSchema: (value) => describeOsvSchema(value, { lockRoots, root }),
    source: 'stdout',
    tool: 'OSV-Scanner',
  });
  const normalized = normalizeOsvReport(parsed, { lockRoots, root });
  requireFindingStatusConsistency({
    commandResult: result,
    findingCount: countOsvFindings(normalized),
    status,
    tool: 'OSV-Scanner',
  });
  const injectedAbsoluteReport = runCommandImpl !== undefined && path.isAbsolute(reportPath);
  const reportRoot = injectedAbsoluteReport ? path.dirname(reportPath) : root;
  const safeReportPath = injectedAbsoluteReport ? path.basename(reportPath) : reportPath;
  const absoluteReportPath = writeSanitizedAuditReport(safeReportPath, normalized, {
    root: reportRoot,
  });
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    summaryText: 'Blocking severity: high/critical',
    violations: collectOsvViolations(normalized),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  try {
    const result = runOsvCheck();

    if (result.violations.length > 0) {
      process.stderr.write(`OSV-Scanner report: ${result.reportPath}\n`);
      printViolations('OSV-Scanner vulnerabilities found:', result.violations);
      process.exit(1);
    }

    process.stdout.write(`OSV-Scanner passed; report=${result.reportPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`OSV-Scanner failed: ${message}\n`);
    process.exit(1);
  }
}
