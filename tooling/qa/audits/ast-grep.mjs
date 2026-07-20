import path from 'node:path';

import {
  collectCodeFiles,
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  repoRoot,
} from '../core/shared.mjs';
import { PRODUCT_SOURCE_ROOTS } from '../core/quality.config.mjs';
import { resolveAstGrepExecutable, runToolCommand } from '../tools/tool-cli.mjs';
import {
  buildInlineAstGrepRules,
  isAstGrepAuditExcludedPath,
  selectAstGrepPolicies,
} from './ast-grep.rules.mjs';
import { collectAstGrepMatches } from './ast-grep-output.mjs';
import { AUDIT_ADAPTER_SKIP_REASONS } from './profiles/index.mjs';
import {
  AuditExecutionError,
  auditResultError,
  mergeAuditCommandResults,
} from './execution-error.mjs';
import { requireAuditCommandStatus } from './result-contract.mjs';

function normalizeTargetFiles(files, root) {
  return files.map((file) => toPolicyPath(file, root));
}

function toPolicyPath(file, root) {
  return path.relative(root, path.resolve(file)).replaceAll(path.sep, '/');
}

export function filterAstGrepAuditFiles(
  files,
  groupIds = ['messaging', 'browser-adapters'],
  { root = repoRoot } = {}
) {
  const policies = selectAstGrepPolicies(groupIds).filter((policy) => policy.astGrepPattern);
  return files.filter((file) => !isAstGrepAuditExcludedPath(toPolicyPath(file, root), policies));
}

function isRepoFile(absoluteFile) {
  const repoRootWithSeparator = `${repoRoot}${path.sep}`;
  return absoluteFile === repoRoot || absoluteFile.startsWith(repoRootWithSeparator);
}

function runAstGrepScan({ executable, inlineRules, scanPaths, cwd, runCommandImpl }) {
  return {
    cwd,
    result: runToolCommand(
      executable,
      [
        'scan',
        ...scanPaths,
        '--inline-rules',
        inlineRules,
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

function createSkippedResult(reason, skipReasonId) {
  return {
    skipped: true,
    files: [],
    violations: [],
    skipReasonId,
    ...(reason ? { reason } : {}),
  };
}

function runExplicitAstGrepScans({ files, executable, inlineRules, runCommandImpl }) {
  const absoluteFiles = files.map((file) => path.resolve(file));
  const repoFiles = absoluteFiles.filter(isRepoFile);
  const externalFiles = absoluteFiles.filter((file) => !isRepoFile(file));
  const scans = [];

  if (repoFiles.length > 0) {
    const scan = runAstGrepScan({
      executable,
      inlineRules,
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
      inlineRules,
      scanPaths: [path.basename(absoluteFile)],
      cwd: path.dirname(absoluteFile),
      runCommandImpl,
    });
    assertScanSucceeded(scan.result);
    scans.push(scan);
  }

  return scans;
}

function runWorkspaceAstGrepScan({ executable, inlineRules, runCommandImpl }) {
  const scan = runAstGrepScan({
    executable,
    inlineRules,
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
  return matches
    .map((match) => {
      const policy = policyByRule.get(match.ruleId);
      if (!policy) {
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

function createAstGrepResult({ files, pathRoot, policies, scanResults, targetRelativeFiles }) {
  try {
    return {
      skipped: false,
      files: [...targetRelativeFiles],
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
  groupIds = ['messaging', 'browser-adapters'],
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

  const inlineRules = buildInlineAstGrepRules(policies);
  const scanResults =
    files.length > 0 || effectiveFileFilter
      ? runExplicitAstGrepScans({ files: filteredFiles, executable, inlineRules, runCommandImpl })
      : runWorkspaceAstGrepScan({ executable, inlineRules, runCommandImpl });

  return createAstGrepResult({ files, pathRoot, policies, scanResults, targetRelativeFiles });
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
