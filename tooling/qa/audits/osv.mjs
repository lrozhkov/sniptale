import fs from 'node:fs';

import { isExecutedAsScript, printViolations, repoRoot } from '../core/shared.mjs';
import { prepareAuditReportPath, resolveAuditReportPath } from './report-paths.mjs';
import { resolveOsvScannerExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import {
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';
import { countOsvFindings, describeOsvSchema } from './osv/schema.mjs';
import { collectOsvViolations } from './osv/violations.mjs';
import { AuditExecutionError } from './execution-error.mjs';

export const OSV_REPORT_PATH = '.tmp/osv/results.json';

export function runOsvCheck({
  executable = resolveOsvScannerExecutable(),
  reportPath = OSV_REPORT_PATH,
  runCommandImpl,
} = {}) {
  if (!executable) {
    throw new AuditExecutionError(
      'tool-unavailable',
      'OSV-Scanner CLI is required for qa:audit. Install the official binary or set SNIPTALE_OSV_SCANNER_BIN.'
    );
  }

  const absoluteReportPath = resolveAuditReportPath(reportPath);
  prepareAuditReportPath(absoluteReportPath);
  const result = runToolCommand(
    executable,
    ['scan', '-L', 'package-lock.json', '--format', 'json'],
    { cwd: repoRoot },
    runCommandImpl
  );
  const status = requireAuditCommandStatus(result, { tool: 'OSV-Scanner scan' });
  const parsed = parseRequiredAuditJson(result.stdout, {
    commandResult: result,
    describeSchema: describeOsvSchema,
    source: 'stdout',
    tool: 'OSV-Scanner',
  });
  requireFindingStatusConsistency({
    commandResult: result,
    findingCount: countOsvFindings(parsed),
    status,
    tool: 'OSV-Scanner',
  });
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    summaryText: 'Blocking severity: high/critical',
    violations: collectOsvViolations(parsed),
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
