import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import {
  CODEQL_BASELINE_PATH,
  CODEQL_CONFIG_PATH,
} from '../../policy/external-tools/external-tools.mjs';
import { resolveCodeqlExecutable, runToolCommand } from '../../tools/tool-cli.mjs';
import { resolveQaResourceProfile } from '../../runtime/scheduling/resource-profile.mjs';
import { applyCodeqlBaseline, formatCodeqlBaselineSummary } from './codeql-baseline.mjs';
import { violationsToSarif, writeCanonicalSarifFile } from '../contracts/canonical-sarif.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from '../profiles/index.mjs';
import {
  materializeReusableCodeqlSarif,
  recordSuccessfulCodeqlProof,
  removeLocalCodeqlProof,
  resolveReusableCodeqlProof,
} from './codeql-proof.mjs';
import { assertCodeqlConfigIsFresh } from './config.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
} from '../contracts/result-contract.mjs';

export const CODEQL_STANDARD_SUITE =
  'codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls';
export const CODEQL_FILTERED_SARIF_PATH = '.tmp/codeql/results.filtered.sarif';

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

function createCodeqlDatabase({
  executable,
  databasePath,
  configPath,
  sourceRoot,
  runCommandImpl,
}) {
  return runCodeqlCommand(
    executable,
    [
      'database',
      'create',
      databasePath,
      '--language=javascript-typescript',
      '--source-root',
      sourceRoot,
      '--overwrite',
      '--codescanning-config',
      configPath,
    ],
    runCommandImpl
  );
}

export function resolveCodeqlRamMiB(profile = resolveQaResourceProfile()) {
  return Math.min(8192, Math.max(4096, profile.memoryMiB - 2048));
}

function analyzeCodeqlDatabase({ executable, databasePath, ramMiB, sarifPath, runCommandImpl }) {
  return runCodeqlCommand(
    executable,
    [
      'database',
      'analyze',
      databasePath,
      CODEQL_STANDARD_SUITE,
      '--format=sarif-latest',
      '--output',
      sarifPath,
      '--threads=0',
      `--ram=${ramMiB}`,
    ],
    runCommandImpl
  );
}

function resolveCodeqlControlPaths({ controlRoot, configPath, baselinePath }) {
  return {
    configPath: configPath ?? path.join(controlRoot, CODEQL_CONFIG_PATH),
    baselinePath:
      baselinePath === undefined ? path.join(controlRoot, CODEQL_BASELINE_PATH) : baselinePath,
  };
}

function collectReusableCodeqlResult({ controlRoot, enabled, sourceRoot }) {
  if (!enabled) return null;
  const reusable = resolveReusableCodeqlProof({ cwd: sourceRoot, controlRoot });
  if (!reusable.matched) {
    removeLocalCodeqlProof({ cwd: sourceRoot });
    return null;
  }
  const filteredSarifPath = materializeReusableCodeqlSarif(reusable, { cwd: sourceRoot });
  recordSuccessfulCodeqlProof({
    cwd: sourceRoot,
    sarifPath: filteredSarifPath,
    source: 'ci:release:reuse',
    reusedFrom: reusable.proof.proofDigest,
  });
  return {
    skipped: false,
    reused: true,
    sarifPath: filteredSarifPath,
    filteredSarifPath,
    summaryText: `CodeQL proof reused: ${reusable.source}; input=${reusable.proof.inputDigest}`,
    violations: [],
  };
}

function collectFreshCodeqlResult({
  controlRoot,
  executable,
  outputRoot,
  paths,
  proofReuseEnabled,
  ramMiB,
  runCommandImpl,
  sourceRoot,
}) {
  if (path.resolve(paths.configPath) === path.join(controlRoot, CODEQL_CONFIG_PATH)) {
    assertCodeqlConfigIsFresh(controlRoot);
  }
  const { root, databasePath, sarifPath } = resolveCodeqlPaths(outputRoot);
  prepareOutputRoot(root);
  createCodeqlDatabase({
    executable,
    databasePath,
    configPath: paths.configPath,
    sourceRoot,
    runCommandImpl,
  });
  const analyzeResult = analyzeCodeqlDatabase({
    executable,
    databasePath,
    ramMiB,
    sarifPath,
    runCommandImpl,
  });
  const filtered = applyCodeqlBaseline({
    baselinePath: paths.baselinePath,
    sourceRoot,
    violations: toSarifViolations(readCodeqlSarif(sarifPath, analyzeResult)),
  });
  const filteredSarifPath = writeCanonicalSarifFile(
    path.join(root, 'results.filtered.sarif'),
    violationsToSarif({
      toolName: 'CodeQL',
      informationUri: 'https://codeql.github.com/',
      violations: filtered.violations,
      root: sourceRoot,
    })
  );
  if (proofReuseEnabled && filtered.violations.length === 0) {
    recordSuccessfulCodeqlProof({ cwd: sourceRoot, sarifPath: filteredSarifPath });
  }
  return {
    skipped: false,
    sarifPath,
    filteredSarifPath,
    summaryText: formatCodeqlBaselineSummary(filtered),
    violations: filtered.violations,
  };
}

export function runCodeqlCheck({
  executable = resolveCodeqlExecutable(),
  configPath,
  baselinePath,
  outputRoot = '.tmp/codeql',
  sourceRoot = repoRoot,
  proofReuse,
  ramMiB = resolveCodeqlRamMiB(),
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

  const controlRoot = process.env.SNIPTALE_TRUSTED_CI_ROOT ?? repoRoot;
  const paths = resolveCodeqlControlPaths({
    controlRoot,
    configPath,
    baselinePath,
  });
  const proofReuseEnabled =
    proofReuse ?? (runCommandImpl === undefined && path.resolve(sourceRoot) === repoRoot);
  const reusable = collectReusableCodeqlResult({
    controlRoot,
    enabled: proofReuseEnabled,
    sourceRoot,
  });
  return (
    reusable ??
    collectFreshCodeqlResult({
      controlRoot,
      executable,
      outputRoot,
      paths,
      proofReuseEnabled,
      ramMiB,
      runCommandImpl,
      sourceRoot,
    })
  );
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
