/**
 * Read-path side-effect guardrail.
 * Blocks get/list/load/read-style functions that perform write/sync mutations in targeted storage/db seams.
 */

import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import {
  emitScopedReportCliResult,
  parseScopedReportCliArgs,
} from '../../../composition/runtime/scoped-report-cli.mjs';
import {
  getCallExpressionName,
  getFunctionLikeName,
} from '../../../analysis/source/typescript-ast-helpers.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from '../../../analysis/source/repo-scoped-typescript-scan.mjs';
import { matchesWordBoundaryPrefix } from '../../quality/naming/name-prefix-helpers.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/composition\/persistence\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/features\/media-hub\/.+\.[cm]?[jt]sx?$/u,
];
const READ_PREFIXES = ['get', 'list', 'load', 'read', 'fetch', 'resolve', 'ensure'];
const WRITER_PREFIXES = [
  'save',
  'write',
  'update',
  'upsert',
  'sync',
  'migrate',
  'repair',
  'cleanup',
  'bootstrap',
];
const RECEIVER_WRITES = new Set(['set', 'put', 'add', 'delete', 'remove', 'clear']);
const PERSISTENCE_RECEIVER_PATTERN = /(?:storage|database|db|store|transaction|objectStore)/iu;

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function collectFunctionNodes(sourceFile) {
  const nodes = new Map();
  const visit = (node) => {
    if (isFunctionNode(node)) {
      const name = getFunctionLikeName(node);
      if (name) nodes.set(name, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

function collectAliases(sourceFile) {
  const aliases = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isIdentifier(node.initializer) || ts.isPropertyAccessExpression(node.initializer))
    ) {
      aliases.set(
        node.name.text,
        ts.isIdentifier(node.initializer) ? node.initializer.text : node.initializer.name.text
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function getCallName(node, aliases) {
  const name = getCallExpressionName(node);
  return name === null ? null : (aliases.get(name) ?? name);
}

function isPersistenceWrite(node, aliases, sourceFile) {
  if (!ts.isCallExpression(node)) return false;
  const name = getCallName(node, aliases);
  if (!name) return false;
  if (matchesWordBoundaryPrefix(name, WRITER_PREFIXES)) return true;
  if (!RECEIVER_WRITES.has(name) || !ts.isPropertyAccessExpression(node.expression)) return false;
  return PERSISTENCE_RECEIVER_PATTERN.test(node.expression.expression.getText(sourceFile));
}

function analyzeFunction(node, functionNames, aliases, sourceFile) {
  const localCalls = new Set();
  let directWrite = false;
  const visit = (current) => {
    if (current !== node && isFunctionNode(current)) return;
    if (isPersistenceWrite(current, aliases, sourceFile)) directWrite = true;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const target = aliases.get(current.expression.text) ?? current.expression.text;
      if (functionNames.has(target)) localCalls.add(target);
    }
    ts.forEachChild(current, visit);
  };
  if (node.body) ts.forEachChild(node.body, visit);
  return { directWrite, localCalls, node };
}

function collectFileReadPathFunctionViolations(sourceFile) {
  const functionNodes = collectFunctionNodes(sourceFile);
  const aliases = collectAliases(sourceFile);
  const functionNames = new Set(functionNodes.keys());
  const analyses = new Map(
    [...functionNodes].map(([name, node]) => [
      name,
      analyzeFunction(node, functionNames, aliases, sourceFile),
    ])
  );
  const writers = new Set(
    [...analyses].filter(([, value]) => value.directWrite).map(([name]) => name)
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, value] of analyses) {
      if (!writers.has(name) && [...value.localCalls].some((call) => writers.has(call))) {
        writers.add(name);
        changed = true;
      }
    }
  }
  return [...analyses]
    .filter(([name]) => matchesWordBoundaryPrefix(name, READ_PREFIXES) && writers.has(name))
    .map(([functionName, value]) => ({ functionName, node: value.node }));
}

function createViolation(file, functionName, line) {
  return {
    rule: 'read-path-side-effects',
    file,
    line,
    message: [
      `Read-style function "${functionName}" performs write/sync side effects.`,
      'Move repair writes out of read paths.',
    ].join(' '),
  };
}

export function collectReadPathSideEffectViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ relativePath, sourceFile }) => {
      violations.push(
        ...collectFileReadPathFunctionViolations(sourceFile).map(({ functionName, node }) =>
          createViolation(relativePath, functionName, getNodeLine(sourceFile, node))
        )
      );
    },
  });

  return violations;
}

export function runReadPathSideEffectCheck({ files = [], scope = 'workspace' } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectReadPathSideEffectViolations,
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runReadPathSideEffectCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Read-path side-effect violations found:',
        passedRepoWide: 'Read-path side-effect repo-wide guardrail passed\n',
        passedWorkspace: 'Read-path side-effect guardrail passed\n',
        reportOnlyHeader: 'Read-path side-effect report found violations:',
        skippedRepoWide: 'Read-path side-effect repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Read-path side-effect check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
