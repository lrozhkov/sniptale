/**
 * Multi-message transition guardrail.
 * Blocks production owners that chain multiple messaging transitions on one execution path
 * unless the function is explicitly allowlisted as an orchestration owner.
 */

import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript, repoRoot } from './shared.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';
import {
  collectMultiMessagePolicyViolations,
  getFunctionName,
  getMaxMessagePathCount,
  isAllowedOrchestrator,
  readMultiMessagePolicy,
  toRootRelativePath,
} from './verify-multi-message-transitions.helpers.mjs';

const POLICY_PATH = 'tooling/configs/qa/multi-message-orchestration.data.json';
const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/content\/hooks\/.+\.[cm]?[jt]sx?$/u,
  /^src\/popup\/components\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/popup\/components\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/background\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/editor\/.+\.[cm]?[jt]sx?$/u,
  /^src\/gallery\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/gallery\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/(?:composition|contracts|features|foundation|platform|ui|workflows)\/.+\.[cm]?[jt]sx?$/u,
  /^packages\/(?:foundation|runtime-contracts|platform|ui)\/src\/.+\.[cm]?[jt]sx?$/u,
];
function createViolation(file, functionName, line, count) {
  return {
    rule: 'multi-message-transitions',
    file,
    line,
    message: [
      `Function "${functionName}" chains ${count} messaging calls on one execution path.`,
      'Extract an explicit orchestration owner or narrow the messaging responsibility.',
    ].join(' '),
  };
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

export function collectMultiMessageTransitionViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readMultiMessagePolicy(rootDir, policyPath);
  const allowedOwners = policy.allowedOwners ?? [];
  const violations = collectMultiMessagePolicyViolations(allowedOwners, policyPath, rootDir);

  for (const filePath of files) {
    collectFileMultiMessageViolations(filePath, { allowedOwners, violations });
  }

  return violations;
}

function collectFileMultiMessageViolations(filePath, { allowedOwners, violations }) {
  scanRepoScopedTypeScriptFiles([filePath], {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        collectFunctionMultiMessageViolation(node, {
          allowedOwners,
          relativePath: normalizedPath,
          sourceFile,
          violations,
        });
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });
}

function collectFunctionMultiMessageViolation(node, params) {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isMethodDeclaration(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isArrowFunction(node)
  ) {
    return;
  }

  const functionName = getFunctionName(node);
  const messageCallCount = getMaxMessagePathCount(node);
  if (
    messageCallCount < 2 ||
    isAllowedOrchestrator(params.allowedOwners, params.relativePath, functionName)
  ) {
    return;
  }

  params.violations.push(
    createViolation(
      params.relativePath,
      functionName,
      getNodeLine(params.sourceFile, node),
      messageCallCount
    )
  );
}

export function runMultiMessageTransitionCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });

  return {
    skipped: targetFiles.length === 0,
    files: targetFiles.map((filePath) => toRootRelativePath(repoRoot, filePath)),
    violations: collectMultiMessageTransitionViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runMultiMessageTransitionCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Multi-message transition violations found:',
        passedRepoWide: 'Multi-message transition repo report passed\n',
        passedWorkspace: 'Multi-message transition guardrail passed\n',
        reportOnlyHeader: 'Multi-message transition violations found:',
        skippedRepoWide: 'Multi-message transition repo report skipped: no code files\n',
        skippedWorkspace: 'Multi-message transition check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
