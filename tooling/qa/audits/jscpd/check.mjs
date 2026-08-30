import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';
import {
  JSCPD_BASELINE_PATH,
  JSCPD_CONFIG_PATH,
} from '../../policy/external-tools/external-tools.mjs';
import { EXTERNAL_AUDIT_SCAN_TARGETS } from '../../policy/external-tools/external-tools.mjs';
import { runToolCommand } from '../../tools/tool-cli.mjs';
import {
  createJscpdDetectorIdentity,
  JSCPD_WORKERS,
  normalizeJscpdClones,
  resolveJscpdNativeRuntime,
} from './jscpd-detector.mjs';
import {
  collectJscpdBaselineViolations,
  formatJscpdBaselineSummary,
  readJscpdBaseline,
  summarizeJscpdFamilies,
} from './jscpd-baseline-contract.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from '../profiles/index.mjs';
import { auditResultError } from '../contracts/execution-error.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
  requireFindingStatusConsistency,
} from '../contracts/result-contract.mjs';

export const JSCPD_REPORT_PATH = '.tmp/jscpd/jscpd-report.json';
export const JSCPD_SCAN_TARGETS = EXTERNAL_AUDIT_SCAN_TARGETS;
export const JSCPD_TIMEOUT_MS = 120_000;

function createSkippedJscpdResult() {
  return {
    skipped: true,
    violations: [],
    skipReasonId: AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable,
    reason: 'jscpd is not installed. Run npm install to provision devDependencies.',
  };
}

function readJscpdConfig(configPath, root) {
  const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Required jscpd config is malformed: ${absoluteConfigPath}`, { cause: error });
  }
  if (
    !isAuditObject(config) ||
    typeof config.output !== 'string' ||
    config.output.trim().length === 0 ||
    path.isAbsolute(config.output) ||
    config.output.split(/[\\/]/u).includes('..') ||
    config.reporters?.length !== 1 ||
    config.reporters[0] !== 'json' ||
    config.threshold !== 0 ||
    config.exitCode !== 1 ||
    !Array.isArray(config.ignorePattern)
  ) {
    throw new Error(
      'jscpd blocking config must define one JSON report output with threshold 0 and exit code 1'
    );
  }
  return config;
}

function resolveJscpdReportPath(reportPath, configPath, root) {
  const configuredReportPath = path.join(
    readJscpdConfig(configPath, root).output,
    'jscpd-report.json'
  );
  const selectedReportPath = reportPath ?? configuredReportPath;
  return path.isAbsolute(selectedReportPath)
    ? selectedReportPath
    : path.join(root, selectedReportPath);
}

function prepareJscpdReportPath(absoluteReportPath) {
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  fs.rmSync(absoluteReportPath, { force: true });
}

function validateJscpdScanTargets(scanTargets, root) {
  for (const target of scanTargets) {
    const absolutePath = path.join(root, target);
    let stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        throw new Error(`jscpd scan root does not exist: ${target}`, { cause: error });
      }
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new Error(`jscpd scan root is not a directory: ${target}`);
    }
  }
}

function runJscpdScan({
  configPath,
  executable,
  killSignal,
  root,
  runCommandImpl,
  scanTargets,
  timeoutMs,
}) {
  validateJscpdScanTargets(scanTargets, root);
  return runToolCommand(
    executable,
    [
      '--config',
      configPath,
      '--workers',
      String(JSCPD_WORKERS),
      '--no-colors',
      ...[...scanTargets].sort(),
    ],
    { cwd: root, killSignal, timeout: timeoutMs },
    runCommandImpl
  );
}

function describeJscpdSchema(value) {
  if (
    !isAuditObject(value) ||
    !Array.isArray(value.duplicates) ||
    !isAuditObject(value.statistics) ||
    !isAuditObject(value.statistics.total) ||
    !isAuditObject(value.statistics.formats)
  ) {
    return 'root must contain duplicates and complete statistics';
  }
  for (const [index, duplicate] of value.duplicates.entries()) {
    if (
      !isAuditObject(duplicate) ||
      !Number.isInteger(duplicate.lines) ||
      !Number.isInteger(duplicate.tokens) ||
      typeof duplicate.format !== 'string' ||
      !isAuditObject(duplicate.firstFile) ||
      typeof duplicate.firstFile.name !== 'string' ||
      !Number.isInteger(duplicate.firstFile.start) ||
      !Number.isInteger(duplicate.firstFile.end) ||
      !isAuditObject(duplicate.firstFile.startLoc) ||
      !isAuditObject(duplicate.firstFile.endLoc) ||
      !isAuditObject(duplicate.secondFile) ||
      typeof duplicate.secondFile.name !== 'string' ||
      !Number.isInteger(duplicate.secondFile.start) ||
      !Number.isInteger(duplicate.secondFile.end) ||
      !isAuditObject(duplicate.secondFile.startLoc) ||
      !isAuditObject(duplicate.secondFile.endLoc)
    ) {
      return `duplicate ${index} requires v5 format, lines, tokens, and complete endpoints`;
    }
  }
  if (
    !Number.isInteger(value.statistics.total.sources) ||
    !Number.isInteger(value.statistics.total.clones) ||
    value.statistics.total.clones !== value.duplicates.length
  ) {
    return 'statistics.total must contain sources and the exact clone count';
  }
  return null;
}

function readJscpdDuplicates(absoluteReportPath, commandResult) {
  const report = fs.existsSync(absoluteReportPath)
    ? fs.readFileSync(absoluteReportPath, 'utf8')
    : null;
  const parsed = parseRequiredAuditJson(report, {
    commandResult,
    describeSchema: describeJscpdSchema,
    source: `report ${absoluteReportPath}`,
    tool: 'jscpd',
  });
  return parsed;
}

function createJscpdResult({ absoluteReportPath, baselinePath, detector, duplicates, root }) {
  const findings = normalizeJscpdClones(duplicates, { root });
  const familySummary = summarizeJscpdFamilies(findings);
  const baseline = readJscpdBaseline(baselinePath, { root });
  const violations = collectJscpdBaselineViolations(familySummary, baseline);
  return {
    skipped: false,
    reportPath: absoluteReportPath,
    detector,
    findings,
    familySummary,
    summaryText: formatJscpdBaselineSummary(familySummary, violations),
    violations,
  };
}

export function runJscpdCheck({
  baselinePath = JSCPD_BASELINE_PATH,
  configPath = JSCPD_CONFIG_PATH,
  executable,
  reportPath,
  root = repoRoot,
  controlRoot = repoRoot,
  runCommandImpl,
  scanTargets = JSCPD_SCAN_TARGETS,
  timeoutMs = JSCPD_TIMEOUT_MS,
  killSignal = 'SIGTERM',
} = {}) {
  if (executable === null) {
    return createSkippedJscpdResult();
  }
  const runtime = resolveJscpdNativeRuntime({ root: controlRoot });
  if (
    executable !== undefined &&
    runCommandImpl === undefined &&
    path.resolve(executable) !== path.resolve(runtime.executable)
  ) {
    throw new Error('jscpd executable overrides are allowed only for injected test runners');
  }
  const resolvedExecutable = executable ?? runtime.executable;
  const detector = createJscpdDetectorIdentity({
    configPath,
    controlRoot,
    executionKind: runCommandImpl === undefined ? 'native' : 'injected-test-runner',
    root,
    runtime,
    scanTargets,
  });

  const absoluteReportPath = resolveJscpdReportPath(reportPath, configPath, root);
  prepareJscpdReportPath(absoluteReportPath);
  const commandResult = runJscpdScan({
    configPath,
    executable: resolvedExecutable,
    killSignal,
    root,
    runCommandImpl,
    scanTargets,
    timeoutMs,
  });
  const status = requireAuditCommandStatus(commandResult, { tool: 'jscpd scan' });
  if (status === 1 && !fs.existsSync(absoluteReportPath)) {
    throw auditResultError(
      'unexpected-exit',
      commandResult.stderr?.trim() || 'jscpd blocking scan did not produce its report',
      commandResult
    );
  }
  const report = readJscpdDuplicates(absoluteReportPath, commandResult);
  requireFindingStatusConsistency({
    commandResult,
    findingCount: report.duplicates.length,
    status,
    tool: 'jscpd',
  });
  if (
    detector.execution.kind === 'native' &&
    detector.scope.populationCount > 0 &&
    readJscpdConfig(configPath, root).ignorePattern.length === 0 &&
    report.statistics.total.sources === 0
  ) {
    throw new Error('jscpd native report is vacuous for a non-empty admitted source population');
  }
  return createJscpdResult({
    absoluteReportPath,
    baselinePath,
    detector,
    duplicates: report.duplicates,
    root,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runJscpdCheck();

  if (result.skipped) {
    process.stderr.write(`${result.reason ?? 'jscpd check skipped'}\n`);
    process.exit(1);
  }

  process.stdout.write(`${result.summaryText}; report=${result.reportPath}\n`);
  if (result.violations.length > 0) process.exit(1);
}
