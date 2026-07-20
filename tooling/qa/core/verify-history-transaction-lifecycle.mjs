/**
 * History transaction lifecycle guardrail.
 * Blocks effect-driven history session owners that begin transactions without
 * colocated commit and cancel paths in the same owner file.
 */

import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';

const TARGET_FILE_PATTERNS = [
  /^apps\/extension\/src\/content\/components\/.+\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/content\/hooks\/.+\.[cm]?[jt]sx?$/u,
];
const EFFECT_HOOK_NAMES = new Set(['useEffect', 'useLayoutEffect']);

function createViolation(file, line, receiver, missingMethods) {
  return {
    rule: 'history-transaction-lifecycle',
    file,
    line,
    message: [
      `Effect-driven history owner for \`${receiver}\` begins a transaction without ${missingMethods.join(
        ' and '
      )} in the same file.`,
      'Grouped history sessions must provide both commit and cancel lifecycle paths.',
    ].join(' '),
  };
}

function getEffectHookName(node) {
  if (!ts.isCallExpression(node)) {
    return null;
  }

  const expression = node.expression;
  if (!ts.isIdentifier(expression)) {
    return null;
  }

  return EFFECT_HOOK_NAMES.has(expression.text) ? expression.text : null;
}

function collectTransactionReceivers(node, methodName, sourceFile) {
  const receivers = [];

  function visit(current) {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === methodName
    ) {
      receivers.push({
        line: getNodeLine(sourceFile, current),
        receiver: current.expression.expression.getText(sourceFile),
      });
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return receivers;
}

function collectEffectDrivenTransactionStarts(sourceFile) {
  const starts = [];

  function visit(node) {
    const hookName = getEffectHookName(node);
    if (!hookName) {
      ts.forEachChild(node, visit);
      return;
    }

    const callback = node.arguments[0];
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      starts.push(...collectTransactionReceivers(callback.body, 'beginTransaction', sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return starts;
}

function collectReceiverSet(sourceFile, methodName) {
  const receivers = new Set();

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === methodName
    ) {
      receivers.add(node.expression.expression.getText(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return receivers;
}

export function collectHistoryTransactionLifecycleViolations(files) {
  const violations = [];

  scanRepoScopedTypeScriptFiles(files, {
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ normalizedPath, sourceFile }) => {
      const transactionStarts = collectEffectDrivenTransactionStarts(sourceFile);
      if (transactionStarts.length === 0) {
        return;
      }

      const commitReceivers = collectReceiverSet(sourceFile, 'commitTransaction');
      const cancelReceivers = collectReceiverSet(sourceFile, 'cancelTransaction');

      for (const start of transactionStarts) {
        const missingMethods = [];
        if (!commitReceivers.has(start.receiver)) {
          missingMethods.push('commitTransaction(...)');
        }
        if (!cancelReceivers.has(start.receiver)) {
          missingMethods.push('cancelTransaction(...) cleanup');
        }

        if (missingMethods.length === 0) {
          continue;
        }

        violations.push(
          createViolation(normalizedPath, start.line, start.receiver, missingMethods)
        );
      }
    },
  });

  return violations;
}

export function runHistoryTransactionLifecycleCheck({ files = [] } = {}) {
  return runScopedCodeFileCheck({
    collectFiles: collectCodeFiles,
    collectViolations: collectHistoryTransactionLifecycleViolations,
    files,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runHistoryTransactionLifecycleCheck({ files: explicitFiles });

  if (result.skipped) {
    process.stdout.write('History transaction lifecycle check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('History transaction lifecycle violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('History transaction lifecycle guardrail passed\n');
}
