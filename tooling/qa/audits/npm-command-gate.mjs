import { runNpm } from '../core/shared.mjs';
import { executeAuditCommand } from './execution-error.mjs';
import { prepareSanitizedAuditReportPath, writeSanitizedAuditReport } from './report-paths.mjs';
import {
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';

export function printNpmCommandGateResult(
  label,
  result,
  { stdout = process.stdout, stderr = process.stderr } = {}
) {
  if (result.status === 'passed') {
    stdout.write(
      [
        `${label}: OK${result.detail ? ` (${result.detail})` : ''}`,
        `report=${result.reportPath}\n`,
      ].join('; ')
    );
    return 0;
  }

  stderr.write(`${label}: failed\n`);
  if (result.reportPath) stderr.write(`Report: ${result.reportPath}\n`);
  if (result.output) stderr.write(`${result.output.trim()}\n`);
  return result.exitCode ?? 1;
}

export function runNpmCommandGate({
  args,
  cwd = process.cwd(),
  describeSchema,
  detail,
  findingCount,
  reportPath,
  reportRoot = cwd,
  runNpmImpl = runNpm,
  toViolations = () => [],
  tool,
}) {
  const absoluteReportPath = prepareSanitizedAuditReportPath(reportPath, { root: reportRoot });
  const result = executeAuditCommand(
    () =>
      runNpmImpl(args, {
        cwd,
        stdio: 'pipe',
      }),
    { tool }
  );

  const status = requireAuditCommandStatus(result, { tool });
  const parsed = parseRequiredAuditJson(result.stdout, {
    commandResult: result,
    describeSchema,
    source: 'stdout',
    tool,
  });
  requireFindingStatusConsistency({
    commandResult: result,
    findingCount: findingCount(parsed),
    status,
    tool,
  });
  writeSanitizedAuditReport(reportPath, parsed, { root: reportRoot });
  const output = result.stdout.trim();
  const violations = toViolations(parsed);
  return status === 0
    ? {
        status: 'passed',
        detail: detail(parsed),
        output,
        reportPath: absoluteReportPath,
        violations,
      }
    : { status: 'failed', output, exitCode: status, reportPath: absoluteReportPath, violations };
}
