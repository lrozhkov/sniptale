import fs from 'node:fs';
import path from 'node:path';

import {
  fromRelativePath,
  isExecutedAsScript,
  printViolations,
  repoRoot,
} from '../core/shared.mjs';
import { CODEQL_BASELINE_PATH, CODEQL_CONFIG_PATH } from '../policy/index.mjs';
import { resolveCodeqlExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import { applyCodeqlBaseline, formatCodeqlBaselineSummary } from './codeql-baseline.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from './profiles/index.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
} from './result-contract.mjs';

export const CODEQL_STANDARD_SUITE = 'javascript-security-and-quality.qls';
export const CODEQL_CUSTOM_SUITE_PATH = 'tooling/qa/codeql/sniptale-custom.qls';

function toSarifViolations(parsed) {
  const runs = parsed.runs ?? [];
  return runs.flatMap((run) =>
    (run.results ?? []).map((result) => ({
      rule: result.ruleId ?? 'codeql',
      file: result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? '<unknown>',
      line: result.locations?.[0]?.physicalLocation?.region?.startLine,
      message: result.message?.text ?? 'CodeQL finding',
    }))
  );
}

function resolveCodeqlPaths(outputRoot) {
  const root = path.isAbsolute(outputRoot) ? outputRoot : path.join(repoRoot, outputRoot);
  return {
    root,
    databasePath: path.join(root, 'db'),
    sarifPath: path.join(root, 'results.sarif'),
  };
}

function prepareOutputRoot(outputRoot) {
  fs.rmSync(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(outputRoot, { recursive: true });
}

function describeCodeqlSarifSchema(value) {
  if (
    !isAuditObject(value) ||
    value.version !== '2.1.0' ||
    !Array.isArray(value.runs) ||
    value.runs.length === 0
  ) {
    return 'root requires SARIF version 2.1.0 and a non-empty runs array';
  }
  for (const [runIndex, run] of value.runs.entries()) {
    if (!isAuditObject(run) || !Array.isArray(run.results)) {
      return `run ${runIndex} must contain a results array`;
    }
    for (const [resultIndex, result] of run.results.entries()) {
      if (
        !isAuditObject(result) ||
        !isAuditObject(result.message) ||
        typeof result.message.text !== 'string' ||
        result.message.text.length === 0 ||
        typeof result.ruleId !== 'string' ||
        result.ruleId.length === 0 ||
        !Array.isArray(result.locations) ||
        result.locations.length === 0 ||
        !isAuditObject(result.locations[0]) ||
        !isAuditObject(result.locations[0].physicalLocation) ||
        !isAuditObject(result.locations[0].physicalLocation.artifactLocation) ||
        typeof result.locations[0].physicalLocation.artifactLocation.uri !== 'string' ||
        result.locations[0].physicalLocation.artifactLocation.uri.length === 0 ||
        !isAuditObject(result.locations[0].physicalLocation.region) ||
        !Number.isInteger(result.locations[0].physicalLocation.region.startLine) ||
        result.locations[0].physicalLocation.region.startLine < 1
      ) {
        return `run ${runIndex} result ${resultIndex} has an invalid SARIF result shape`;
      }
    }
  }
  return null;
}

function readCodeqlSarif(sarifPath, commandResult) {
  const sarif = fs.existsSync(sarifPath) ? fs.readFileSync(sarifPath, 'utf8') : null;
  return parseRequiredAuditJson(sarif, {
    commandResult,
    describeSchema: describeCodeqlSarifSchema,
    source: `SARIF report ${sarifPath}`,
    tool: 'CodeQL',
  });
}

function runCodeqlCommand(executable, args, runCommandImpl) {
  const result = runToolCommand(executable, args, { cwd: repoRoot }, runCommandImpl);
  requireAuditCommandStatus(result, { statuses: [0], tool: 'CodeQL command' });
  return result;
}

function createCodeqlDatabase({ executable, databasePath, configPath, runCommandImpl }) {
  return runCodeqlCommand(
    executable,
    [
      'database',
      'create',
      databasePath,
      '--language=javascript-typescript',
      '--source-root',
      repoRoot,
      '--overwrite',
      '--codescanning-config',
      configPath,
    ],
    runCommandImpl
  );
}

function analyzeCodeqlDatabase({
  executable,
  databasePath,
  sarifPath,
  customSuitePath = fromRelativePath(CODEQL_CUSTOM_SUITE_PATH),
  runCommandImpl,
}) {
  return runCodeqlCommand(
    executable,
    [
      'database',
      'analyze',
      databasePath,
      CODEQL_STANDARD_SUITE,
      customSuitePath,
      '--format=sarif-latest',
      '--output',
      sarifPath,
      '--threads=0',
    ],
    runCommandImpl
  );
}

export function runCodeqlCheck({
  executable = resolveCodeqlExecutable(),
  configPath = CODEQL_CONFIG_PATH,
  baselinePath = CODEQL_BASELINE_PATH,
  customSuitePath = fromRelativePath(CODEQL_CUSTOM_SUITE_PATH),
  outputRoot = '.tmp/codeql',
  sourceRoot = repoRoot,
  runCommandImpl,
} = {}) {
  if (!executable) {
    return {
      skipped: true,
      violations: [],
      skipReasonId: AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable,
      reason:
        'CodeQL CLI is not installed or not on PATH. Install it globally or set SNIPTALE_CODEQL_BIN.',
    };
  }

  const { root, databasePath, sarifPath } = resolveCodeqlPaths(outputRoot);
  prepareOutputRoot(root);
  createCodeqlDatabase({ executable, databasePath, configPath, runCommandImpl });
  const analyzeResult = analyzeCodeqlDatabase({
    executable,
    databasePath,
    sarifPath,
    customSuitePath,
    runCommandImpl,
  });

  const rawViolations = toSarifViolations(readCodeqlSarif(sarifPath, analyzeResult));
  const filtered = applyCodeqlBaseline({
    baselinePath,
    sourceRoot,
    violations: rawViolations,
  });
  return {
    skipped: false,
    sarifPath,
    summaryText: formatCodeqlBaselineSummary(filtered),
    violations: filtered.violations,
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runCodeqlCheck();

  if (result.skipped) {
    process.stderr.write(`${result.reason ?? 'CodeQL check skipped'}\n`);
    process.exit(1);
  }

  if (result.violations.length > 0) {
    printViolations('CodeQL findings found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('CodeQL passed\n');
}
