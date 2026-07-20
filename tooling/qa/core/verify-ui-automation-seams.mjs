/**
 * UI automation seam advisory.
 * Reports browser-automation primitives in production orchestration files outside explicit DOM-driver seams.
 */

import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript, toRelativePath } from './shared.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { getNodeLine, scanRepoScopedTypeScriptFiles } from './repo-scoped-typescript-scan.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/content\/parser\/export-manager.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/runtime\/(?:bridge\/react|message-bridge)\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/overlay\/(?:ai\/pick\/controller|app|scenario|screenshot|toolbar)\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/selection\/frame-runtime\/react\/.+\.[cm]?[jt]sx?$/u,
];

function createViolation(file, line, message) {
  return {
    rule: 'ui-automation-seams',
    file,
    line,
    message,
  };
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function collectNodeViolations(relativePath, sourceFile, node) {
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'KeyboardEvent'
  ) {
    return [
      createViolation(
        relativePath,
        getNodeLine(sourceFile, node),
        'KeyboardEvent-driven UI automation must stay inside explicit DOM-driver seams.'
      ),
    ];
  }

  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'click'
  ) {
    return [
      createViolation(
        relativePath,
        getNodeLine(sourceFile, node),
        'Programmatic click automation must stay inside explicit DOM-driver seams.'
      ),
    ];
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'setTimeout'
  ) {
    return [
      createViolation(
        relativePath,
        getNodeLine(sourceFile, node),
        'Polling and delay-based UI automation should be isolated behind a DOM-driver seam.'
      ),
    ];
  }

  return [];
}

export function collectUiAutomationSeamViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      const visit = (node) => {
        violations.push(...collectNodeViolations(relativePath, sourceFile, node));

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runUiAutomationSeamCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });

  return {
    skipped: targetFiles.length === 0,
    files: targetFiles.map(toRelativePath),
    violations: collectUiAutomationSeamViolations(targetFiles),
  };
}

export function runChangedUiAutomationSeamCheck() {
  return runUiAutomationSeamCheck({ scope: 'workspace' });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runUiAutomationSeamCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'UI automation seam violations found:',
        passedRepoWide: 'UI automation seam repo report passed\n',
        passedWorkspace: 'UI automation seam guardrail passed\n',
        reportOnlyHeader: 'UI automation seam violations found:',
        skippedRepoWide: 'UI automation seam repo report skipped: no code files\n',
        skippedWorkspace: 'UI automation seam check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
