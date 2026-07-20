/**
 * History detached-snapshot guardrail.
 * Blocks history/snapshot owners that store or return live mutable snapshot references.
 */

import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript } from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/(?:scenario-editor|editor|video-editor)\/.+history.+\.[cm]?[jt]sx?$/u,
];
const DETACHED_PROPERTY_NAMES = new Set(['current', 'project', 'restoredStep', 'snapshot']);
const HISTORY_ARRAY_PROPERTY_NAMES = new Set(['future', 'past', 'stack']);
const LIVE_REFERENCE_NAME_PATTERN = /(current|project|restored|snapshot|step)/iu;
const CLONE_FUNCTION_NAME_PATTERN = /(?:clone|copy|detach|structuredClone)/iu;

function createViolation(file, line, message) {
  return {
    rule: 'history-detached-snapshots',
    file,
    line,
    message,
  };
}

function isCloneExpression(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  if (ts.isIdentifier(node.expression)) {
    return CLONE_FUNCTION_NAME_PATTERN.test(node.expression.text);
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    return CLONE_FUNCTION_NAME_PATTERN.test(node.expression.name.text);
  }

  return false;
}

function getReferenceName(node) {
  if (ts.isIdentifier(node)) {
    return node.text;
  }

  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  return null;
}

function isLiveReference(node) {
  const referenceName = getReferenceName(node);
  return referenceName !== null && LIVE_REFERENCE_NAME_PATTERN.test(referenceName);
}

function collectDetachedPropertyViolation(relativePath, sourceFile, propertyName, initializer) {
  if (
    !DETACHED_PROPERTY_NAMES.has(propertyName) ||
    !isLiveReference(initializer) ||
    isCloneExpression(initializer)
  ) {
    return [];
  }

  return [
    createViolation(
      relativePath,
      getNodeLine(sourceFile, initializer),
      [
        `History/snapshot property "${propertyName}" stores a live mutable reference.`,
        'Clone snapshots before storing or returning them.',
      ].join(' ')
    ),
  ];
}

function collectHistoryArrayViolation(relativePath, sourceFile, propertyName, initializer) {
  const hasLiveElement =
    ts.isArrayLiteralExpression(initializer) &&
    initializer.elements.some((element) => isLiveReference(element) && !isCloneExpression(element));
  if (!HISTORY_ARRAY_PROPERTY_NAMES.has(propertyName) || !hasLiveElement) {
    return [];
  }

  return [
    createViolation(
      relativePath,
      getNodeLine(sourceFile, initializer),
      [
        `History/snapshot array "${propertyName}" stores a live mutable reference.`,
        'Push detached copies into history stacks.',
      ].join(' ')
    ),
  ];
}

function collectObjectLiteralViolations(relativePath, sourceFile, objectLiteral) {
  const violations = [];

  if (ts.isCallExpression(objectLiteral.parent)) {
    return violations;
  }

  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      continue;
    }

    const propertyName = property.name.text;
    const initializer = property.initializer;
    violations.push(
      ...collectDetachedPropertyViolation(relativePath, sourceFile, propertyName, initializer)
    );
    violations.push(
      ...collectHistoryArrayViolation(relativePath, sourceFile, propertyName, initializer)
    );
  }

  return violations;
}

export function collectHistoryDetachedSnapshotViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const visit = (node) => {
        if (ts.isObjectLiteralExpression(node)) {
          violations.push(...collectObjectLiteralViolations(normalizedPath, sourceFile, node));
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    },
  });

  return violations;
}

export function runHistoryDetachedSnapshotCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectHistoryDetachedSnapshotViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runHistoryDetachedSnapshotCheck({
    files: explicitFiles,
    scope,
  });
  process.exit(
    emitScopedReportCliResult({
      labels: {
        skippedRepoWide: 'History detached-snapshot repo-wide check skipped: no code files\n',
        skippedWorkspace: 'History detached-snapshot check skipped: no changed code files\n',
        reportOnlyHeader: 'History detached-snapshot report found violations:',
        failureHeader: 'History detached-snapshot violations found:',
        passedRepoWide: 'History detached-snapshot repo-wide guardrail passed\n',
        passedWorkspace: 'History detached-snapshot guardrail passed\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
