import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import {
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../runtime/process/shared-cli.mjs';
import { PRODUCT_SOURCE_ROOTS } from '../../policy/quality/quality.config.mjs';
import { resolveAstGrepExecutable, runToolCommand } from '../../tools/tool-cli.mjs';
import {
  AST_GREP_CORE_GROUP_IDS,
  isAstGrepAuditExcludedPath,
  selectAstGrepPolicies,
} from './ast-grep.rules.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from '../profiles/index.mjs';
import {
  AuditExecutionError,
  auditResultError,
  mergeAuditCommandResults,
} from '../contracts/execution-error.mjs';
import {
  isAuditObject,
  parseRequiredAuditJson,
  requireAuditCommandStatus,
} from '../contracts/result-contract.mjs';

export const AST_GREP_CONFIG_PATH = 'tooling/configs/qa/ast-grep/sgconfig.yml';
export const AST_GREP_RULE_PATH = 'tooling/configs/qa/ast-grep/rules/core.yml';
export const AST_GREP_TOOL_VERSION = JSON.parse(
  fs.readFileSync(
    new URL('../../../../node_modules/@ast-grep/cli/package.json', import.meta.url),
    'utf8'
  )
).version;

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeTargetFiles(files, root) {
  return files.map((file) => toPolicyPath(file, root));
}

function toPolicyPath(file, root) {
  return path.relative(root, path.resolve(file)).replaceAll(path.sep, '/');
}

export function filterAstGrepAuditFiles(
  files,
  groupIds = AST_GREP_CORE_GROUP_IDS,
  { root = repoRoot } = {}
) {
  const policies = selectAstGrepPolicies(groupIds).filter((policy) => policy.astGrepPattern);
  return files.filter((file) => !isAstGrepAuditExcludedPath(toPolicyPath(file, root), policies));
}

function isRepoFile(absoluteFile) {
  const repoRootWithSeparator = `${repoRoot}${path.sep}`;
  return absoluteFile === repoRoot || absoluteFile.startsWith(repoRootWithSeparator);
}

function runAstGrepScan({ executable, scanPaths, cwd, runCommandImpl }) {
  return {
    cwd,
    result: runToolCommand(
      executable,
      [
        'scan',
        ...scanPaths,
        '--config',
        path.join(repoRoot, AST_GREP_CONFIG_PATH),
        '--json=pretty',
        '--include-metadata',
        '--warning',
      ],
      { cwd },
      runCommandImpl
    ),
  };
}

function assertScanSucceeded(result) {
  requireAuditCommandStatus(result, { statuses: [0], tool: 'ast-grep scan' });
}

function describeAstGrepSchema(value) {
  if (!Array.isArray(value)) return 'root must be an array';
  for (const [index, match] of value.entries()) {
    if (
      !isAuditObject(match) ||
      typeof match.file !== 'string' ||
      match.file.length === 0 ||
      typeof match.ruleId !== 'string' ||
      match.ruleId.length === 0 ||
      !isAuditObject(match.range) ||
      !isAuditObject(match.range.start) ||
      !Number.isInteger(match.range.start.line)
    ) {
      return `match ${index} requires file, ruleId, and range.start.line`;
    }
  }
  return null;
}

function collectAstGrepMatches(scanResults) {
  return scanResults.flatMap(({ cwd, result }) =>
    parseRequiredAuditJson(result.stdout, {
      commandResult: result,
      describeSchema: describeAstGrepSchema,
      source: 'stdout',
      tool: 'ast-grep',
    }).map((match) => ({
      ...match,
      file: path.isAbsolute(match.file) ? match.file : path.join(cwd, match.file),
    }))
  );
}

function createSkippedResult(reason, skipReasonId) {
  return {
    skipped: true,
    files: [],
    violations: [],
    skipReasonId,
    ...(reason ? { reason } : {}),
  };
}

function runExplicitAstGrepScans({ files, executable, runCommandImpl }) {
  const absoluteFiles = files.map((file) => path.resolve(file));
  const repoFiles = absoluteFiles.filter(isRepoFile);
  const externalFiles = absoluteFiles.filter((file) => !isRepoFile(file));
  const scans = [];

  if (repoFiles.length > 0) {
    const scan = runAstGrepScan({
      executable,
      scanPaths: repoFiles.map((file) => path.relative(repoRoot, file)),
      cwd: repoRoot,
      runCommandImpl,
    });
    assertScanSucceeded(scan.result);
    scans.push(scan);
  }

  for (const absoluteFile of externalFiles) {
    const scan = runAstGrepScan({
      executable,
      scanPaths: [path.basename(absoluteFile)],
      cwd: path.dirname(absoluteFile),
      runCommandImpl,
    });
    assertScanSucceeded(scan.result);
    scans.push(scan);
  }

  return scans;
}

function runWorkspaceAstGrepScan({ executable, runCommandImpl }) {
  const scan = runAstGrepScan({
    executable,
    scanPaths: [...PRODUCT_SOURCE_ROOTS, 'scripts'],
    cwd: repoRoot,
    runCommandImpl,
  });
  assertScanSucceeded(scan.result);
  return [scan];
}

function toAstGrepViolation(match, policy, root) {
  const file = toPolicyPath(match.file, root);
  if (typeof policy.allow === 'function' && policy.allow(file)) {
    return null;
  }

  return {
    rule: policy.violationRule ?? policy.rule,
    file,
    line: match.range?.start?.line != null ? match.range.start.line + 1 : undefined,
    message: policy.message,
  };
}

function collectAstGrepViolations({
  matches,
  policies,
  targetRelativeFiles,
  hasExplicitFiles,
  root,
}) {
  const policyByRule = new Map(policies.map((policy) => [policy.rule, policy]));
  const knownRuleIds = new Set(
    selectAstGrepPolicies(AST_GREP_CORE_GROUP_IDS).map(({ rule }) => rule)
  );
  return matches
    .map((match) => {
      const policy = policyByRule.get(match.ruleId);
      if (!policy) {
        if (knownRuleIds.has(match.ruleId)) return null;
        throw new Error(`ast-grep returned unexpected rule identity: ${match.ruleId}`);
      }

      const normalizedFile = toPolicyPath(match.file, root);
      if (hasExplicitFiles && !targetRelativeFiles.has(normalizedFile)) {
        return null;
      }
      return toAstGrepViolation(match, policy, root);
    })
    .filter(Boolean);
}

export function createAstGrepIdentity({ files, groupIds, pathRoot = repoRoot }) {
  const normalizedFiles = [...files].map((file) => toPolicyPath(file, pathRoot)).sort();
  const inputEntries = normalizedFiles.map((file) => {
    const absolute = path.resolve(pathRoot, file);
    return [file, fs.existsSync(absolute) ? digest(fs.readFileSync(absolute)) : 'missing'];
  });
  const configDigest = digest(fs.readFileSync(path.join(repoRoot, AST_GREP_CONFIG_PATH)));
  const ruleDigest = digest(fs.readFileSync(path.join(repoRoot, AST_GREP_RULE_PATH)));
  const rootIdentity =
    path.resolve(pathRoot) === repoRoot ? 'repository-root' : path.resolve(pathRoot);
  return Object.freeze({
    schemaVersion: 1,
    toolVersion: AST_GREP_TOOL_VERSION,
    configDigest,
    ruleDigest,
    inputDigest: digest(JSON.stringify(inputEntries)),
    scopeDigest: digest(
      JSON.stringify({
        files: normalizedFiles,
        groupIds: [...groupIds].sort(),
      })
    ),
    rootDigest: digest(rootIdentity),
  });
}

function createAstGrepResult({
  files,
  groupIds,
  pathRoot,
  policies,
  scanResults,
  targetRelativeFiles,
}) {
  try {
    return {
      skipped: false,
      files: [...targetRelativeFiles],
      identity: createAstGrepIdentity({
        files: [...targetRelativeFiles],
        groupIds,
        pathRoot,
      }),
      violations: collectAstGrepViolations({
        matches: collectAstGrepMatches(scanResults),
        policies,
        targetRelativeFiles,
        hasExplicitFiles: files.length > 0,
        root: pathRoot,
      }),
    };
  } catch (error) {
    if (error instanceof AuditExecutionError) throw error;
    throw auditResultError(
      'invalid-output',
      error instanceof Error ? error.message : String(error),
      mergeAuditCommandResults(scanResults.map(({ result }) => result))
    );
  }
}

export function runAstGrepCheck({
  files = [],
  groupIds = AST_GREP_CORE_GROUP_IDS,
  collectFiles = collectCodeFiles,
  fileFilter,
  pathRoot = repoRoot,
  runCommandImpl,
} = {}) {
  const executable = resolveAstGrepExecutable();
  if (!executable) {
    return createSkippedResult(
      'ast-grep is not installed. Run npm install to provision @ast-grep/cli.',
      AUDIT_ADAPTER_SKIP_REASONS.toolUnavailable
    );
  }

  const policies = selectAstGrepPolicies(groupIds).filter((policy) => policy.astGrepPattern);
  const targetFiles = files.length > 0 ? files : collectFiles();
  const effectiveFileFilter = fileFilter ?? (files.length === 0 ? filterAstGrepAuditFiles : null);
  const filteredFiles = effectiveFileFilter
    ? effectiveFileFilter(targetFiles, groupIds)
    : targetFiles;
  const targetRelativeFiles = new Set(normalizeTargetFiles(filteredFiles, pathRoot));
  if (targetRelativeFiles.size === 0) {
    return createSkippedResult(
      'No files matched the configured ast-grep policies.',
      AUDIT_ADAPTER_SKIP_REASONS.noApplicableTargets
    );
  }

  const scanResults =
    files.length > 0 || effectiveFileFilter
      ? runExplicitAstGrepScans({
          files: filteredFiles,
          executable,
          runCommandImpl,
        })
      : runWorkspaceAstGrepScan({ executable, runCommandImpl });

  return createAstGrepResult({
    files,
    groupIds,
    pathRoot,
    policies,
    scanResults,
    targetRelativeFiles,
  });
}

export function assertAstGrepReceiptIdentity(receipt, groupIds) {
  if (receipt?.skipped) {
    if (receipt.files?.length !== 0 || receipt.violations?.length !== 0) {
      throw new Error('ast-grep skipped receipt cannot contain scope or findings');
    }
    return receipt;
  }
  const expected = createAstGrepIdentity({ files: receipt.files, groupIds });
  for (const key of Object.keys(expected)) {
    if (receipt.identity?.[key] !== expected[key]) {
      throw new Error(`ast-grep receipt identity mismatch: ${key}`);
    }
  }
  return receipt;
}

export function projectAstGrepReceipt(receipt, groupIds) {
  assertAstGrepReceiptIdentity(receipt, AST_GREP_CORE_GROUP_IDS);
  const policies = selectAstGrepPolicies(groupIds);
  const normalizedRuleIds = new Set(
    policies.flatMap(({ rule, violationRule }) => [rule, violationRule].filter(Boolean))
  );
  return {
    ...receipt,
    violations: receipt.violations.filter(({ rule }) => normalizedRuleIds.has(rule)),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const explicitFiles = parseFilesArgument(argv);
  const groupsValue = getOptionValue(argv, '--groups');
  const groupIds = groupsValue ? groupsValue.split(',').map((group) => group.trim()) : undefined;
  const result = runAstGrepCheck({ files: explicitFiles, groupIds });

  if (result.skipped) {
    process.stdout.write(`${result.reason ?? 'ast-grep check skipped'}\n`);
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('ast-grep violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('ast-grep guardrails passed\n');
}
