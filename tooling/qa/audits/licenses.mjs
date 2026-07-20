import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, repoRoot, runNpm } from '../core/shared.mjs';
import { LICENSE_POLICY_PATH } from '../policy/index.mjs';
import { describeLicenseLockSchema } from './licenses/containment.mjs';
import { evaluateLicenseInventory, formatLicenseSummary } from './licenses/evaluation.mjs';
import { parseLicensePolicy } from './licenses/policy.mjs';
import { parseLicenseSbom } from './licenses/sbom.mjs';
import { executeAuditCommand } from './execution-error.mjs';
import { parseRequiredAuditJson, requireAuditCommandStatus } from './result-contract.mjs';

export const LICENSE_REPORT_PATH = '.tmp/licenses/summary.json';
export const LICENSE_SBOM_PATH = '.tmp/licenses/sbom.cdx.json';

function resolveReportPath(reportPath) {
  return path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath);
}

function prepareOutputPaths(paths) {
  for (const outputPath of paths) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.rmSync(outputPath, { force: true });
  }
}

function readPolicy(policyPath) {
  const absolutePolicyPath = resolveReportPath(policyPath);
  return parseLicensePolicy(fs.readFileSync(absolutePolicyPath, 'utf8'));
}

function readDecisionLock(lockfilePath) {
  const absoluteLockfilePath = resolveReportPath(lockfilePath);
  return parseRequiredAuditJson(fs.readFileSync(absoluteLockfilePath, 'utf8'), {
    describeSchema: describeLicenseLockSchema,
    source: 'lockfile',
    tool: 'License audit',
  });
}

export function runLicenseCheck({
  policyPath = LICENSE_POLICY_PATH,
  lockfilePath = 'package-lock.json',
  reportPath = LICENSE_REPORT_PATH,
  sbomPath = LICENSE_SBOM_PATH,
  runNpmImpl = runNpm,
} = {}) {
  const absoluteReportPath = resolveReportPath(reportPath);
  const absoluteSbomPath = resolveReportPath(sbomPath);
  prepareOutputPaths([absoluteReportPath, absoluteSbomPath]);

  const result = executeAuditCommand(
    () =>
      runNpmImpl(['sbom', '--sbom-format=cyclonedx', '--package-lock-only'], {
        cwd: repoRoot,
        stdio: 'pipe',
      }),
    { tool: 'npm license SBOM' }
  );
  requireAuditCommandStatus(result, { statuses: [0], tool: 'npm license SBOM' });
  const sbom = parseLicenseSbom(result.stdout, result);
  fs.writeFileSync(absoluteSbomPath, `${JSON.stringify(sbom, null, 2)}\n`);
  const policy = readPolicy(policyPath);
  const evaluation = evaluateLicenseInventory({
    lock: readDecisionLock(lockfilePath),
    sbom,
    policy,
  });
  const { summary, violations } = evaluation;
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(summary, null, 2)}\n`);

  return {
    skipped: false,
    reportPath: absoluteReportPath,
    summaryText: formatLicenseSummary(summary),
    violations,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runLicenseCheck();

  if (result.violations.length > 0) {
    process.stderr.write(`License report: ${result.reportPath}\n`);
    for (const violation of result.violations) {
      process.stderr.write(`- ${violation.message}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`License inventory passed; report=${result.reportPath}\n`);
}
