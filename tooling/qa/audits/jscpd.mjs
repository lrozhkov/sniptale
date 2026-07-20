import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, printViolations, repoRoot } from '../core/shared.mjs';
import { JSCPD_BASELINE_PATH, JSCPD_CONFIG_PATH } from '../policy/index.mjs';
import { EXTERNAL_AUDIT_SCAN_TARGETS } from '../policy/index.mjs';
import {
  collectJscpdBaselineViolations,
  formatJscpdBaselineSummary,
  readJscpdBaseline,
  readJscpdDebtRegistry,
} from './jscpd-baseline.mjs';
import { formatJscpdFamilySummary, summarizeJscpdFamilies } from './jscpd-family-summary.mjs';
import { resolveJscpdExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from './profiles/index.mjs';
import { auditResultError } from './execution-error.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from './result-contract.mjs';

export { formatJscpdFamilySummary, summarizeJscpdFamilies } from './jscpd-family-summary.mjs';

export const JSCPD_REPORT_PATH = '.tmp/jscpd/jscpd-report.json';
export const JSCPD_SCAN_TARGETS = EXTERNAL_AUDIT_SCAN_TARGETS;

function toDuplicationViolation(entry) {
  return {
    rule: 'jscpd-duplicate',
    file: entry.firstFile?.name ?? '<unknown>',
    line: entry.firstFile?.start,
    message: `duplicates ${entry.secondFile?.name ?? '<unknown>'} (${entry.lines} lines)`,
  };
}

function createSkippedJscpdResult() {
  return {
    skipped: true,
    violations: [],
    skipReasonId: AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable,
    reason: 'jscpd is not installed. Run npm install to provision devDependencies.',
  };
}

function resolveJscpdReportPath(reportPath) {
  return path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath);
}

function prepareJscpdReportPath(absoluteReportPath) {
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  fs.rmSync(absoluteReportPath, { force: true });
}

function validateJscpdScanTargets(scanTargets) {
  for (const target of scanTargets) {
    const absolutePath = path.join(repoRoot, target);
    let stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        throw new Error(`jscpd scan root does not exist: ${target}`);
      }
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new Error(`jscpd scan root is not a directory: ${target}`);
    }
  }
}

function runJscpdScan({ configPath, executable, runCommandImpl, scanTargets }) {
  validateJscpdScanTargets(scanTargets);
  return runToolCommand(
    executable,
    ['--config', configPath, ...scanTargets],
    { cwd: repoRoot },
    runCommandImpl
  );
}

function describeJscpdSchema(value) {
  if (!isAuditObject(value) || !Array.isArray(value.duplicates)) {
    return 'root must be an object with a duplicates array';
  }
  for (const [index, duplicate] of value.duplicates.entries()) {
    if (
      !isAuditObject(duplicate) ||
      !Number.isInteger(duplicate.lines) ||
      !isAuditObject(duplicate.firstFile) ||
      typeof duplicate.firstFile.name !== 'string' ||
      !isAuditObject(duplicate.secondFile) ||
      typeof duplicate.secondFile.name !== 'string'
    ) {
      return `duplicate ${index} requires lines and two named files`;
    }
  }
  return null;
}

function readJscpdDuplicates(absoluteReportPath, status, commandResult) {
  const report = fs.existsSync(absoluteReportPath)
    ? fs.readFileSync(absoluteReportPath, 'utf8')
    : null;
  const parsed = parseRequiredAuditJson(report, {
    commandResult,
    describeSchema: describeJscpdSchema,
    source: `report ${absoluteReportPath}`,
    tool: 'jscpd',
  });
  requireFindingStatusConsistency({
    commandResult,
    findingCount: parsed.duplicates.length,
    status,
    tool: 'jscpd',
  });
  return parsed.duplicates;
}

function createJscpdResult({ absoluteReportPath, baselinePath, debtRegistryPath, duplicates }) {
  const familySummary = summarizeJscpdFamilies(duplicates, {
    limit: Number.POSITIVE_INFINITY,
    sampleLimit: Number.POSITIVE_INFINITY,
  });
  const baseline = readJscpdBaseline(baselinePath);
  const registry = baseline ? readJscpdDebtRegistry(debtRegistryPath) : null;
  const baselineViolations = collectJscpdBaselineViolations(familySummary, baseline, registry);
  const violations = baselineViolations ?? duplicates.map(toDuplicationViolation);
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    familySummary,
    summaryText: formatJscpdBaselineSummary({
      baseline,
      familySummary,
      formatFamilySummary: formatJscpdFamilySummary,
      registry,
      violations,
    }),
    violations,
  };
}

export function runJscpdCheck({
  configPath = JSCPD_CONFIG_PATH,
  baselinePath = JSCPD_BASELINE_PATH,
  debtRegistryPath,
  executable = resolveJscpdExecutable(),
  reportPath = JSCPD_REPORT_PATH,
  runCommandImpl,
  scanTargets = JSCPD_SCAN_TARGETS,
} = {}) {
  if (!executable) {
    return createSkippedJscpdResult();
  }

  const absoluteReportPath = resolveJscpdReportPath(reportPath);
  prepareJscpdReportPath(absoluteReportPath);
  const commandResult = runJscpdScan({
    configPath,
    executable,
    runCommandImpl,
    scanTargets,
  });
  const status = requireAuditCommandStatus(commandResult, { tool: 'jscpd scan' });
  if (
    status === 1 &&
    !fs.existsSync(absoluteReportPath) &&
    typeof commandResult.stderr === 'string' &&
    commandResult.stderr.trim().length > 0
  ) {
    throw auditResultError('unexpected-exit', commandResult.stderr.trim(), commandResult);
  }
  return createJscpdResult({
    absoluteReportPath,
    baselinePath,
    debtRegistryPath,
    duplicates: readJscpdDuplicates(absoluteReportPath, status, commandResult),
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runJscpdCheck();

  if (result.skipped) {
    process.stderr.write(`${result.reason ?? 'jscpd check skipped'}\n`);
    process.exit(1);
  }

  if (result.violations.length > 0) {
    process.stderr.write(`jscpd report: ${result.reportPath}\n`);
    if (result.summaryText) {
      process.stderr.write(`${result.summaryText}\n\n`);
    }
    printViolations('jscpd duplications found:', result.violations);
    process.exit(1);
  }

  process.stdout.write(`jscpd passed; report=${result.reportPath}\n`);
}
