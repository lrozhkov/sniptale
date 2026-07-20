/**
 * Diff-aware logging guardrail.
 * Blocks raw console.* usage in production src/** code outside explicit low-level tracing seams.
 */

import fs from 'node:fs';
import ts from 'typescript';

import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from './shared.mjs';
import { isProductionSrcTypeScriptFile, normalizeRepoSrcPath } from './src-production-targets.mjs';

const DISALLOWED_CONSOLE_METHODS = new Set(['debug', 'error', 'info', 'log', 'warn']);
export const LOGGING_ALLOWLISTED_FILES = new Set([
  'packages/platform/src/observability/message-tracer/console.ts',
  'packages/platform/src/observability/message-tracer/index.ts',
]);

function isLoggingTarget(relativePath) {
  return isProductionSrcTypeScriptFile(relativePath);
}

function isAllowlistedLoggingFile(relativePath) {
  return LOGGING_ALLOWLISTED_FILES.has(normalizeRepoSrcPath(relativePath));
}

function isDisallowedConsoleCall(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'console' &&
    DISALLOWED_CONSOLE_METHODS.has(expression.name.text)
  );
}

function createViolation(relativePath, line, method) {
  return {
    rule: 'raw-console-logging',
    file: relativePath,
    line,
    message: [
      `uses console.${method} in production code.`,
      'Use @sniptale/platform/observability/logger unless this file is an allowlisted tracing seam.',
    ].join(' '),
  };
}

export function collectLoggingViolations(
  files,
  { changedLineMap = new Map(), untrackedFiles = new Set() } = {}
) {
  const violations = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const relativePath = toRelativePath(filePath);
    const normalizedPath = normalizeRepoSrcPath(relativePath);
    if (!isLoggingTarget(normalizedPath) || isAllowlistedLoggingFile(normalizedPath)) {
      continue;
    }

    const changedLineNumbers = untrackedFiles.has(normalizedPath)
      ? null
      : (changedLineMap.get(normalizedPath) ?? null);
    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    function visit(node) {
      if (ts.isCallExpression(node) && isDisallowedConsoleCall(node.expression)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile)).line + 1;
        if (changedLineNumbers == null || changedLineNumbers.has(line)) {
          violations.push(createViolation(normalizedPath, line, node.expression.name.text));
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return violations;
}

export function runLoggingCheck({ files = [], scope = 'workspace' } = {}) {
  if (files.length > 0) {
    return {
      files: files.map(toRelativePath),
      violations: collectLoggingViolations(files, {
        untrackedFiles: new Set(files.map(toRelativePath)),
      }),
    };
  }

  const targets = collectChangedTargets({ scope });
  const loggingFiles = targets.changedFiles.filter(isLoggingTarget);

  return {
    files: loggingFiles,
    violations: collectLoggingViolations(loggingFiles, {
      changedLineMap: targets.changedLineMap,
      untrackedFiles: targets.untrackedFiles,
    }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const scope = argv.includes('--staged') ? 'staged' : 'workspace';
  const result = runLoggingCheck({ files, scope });

  if (result.violations.length > 0) {
    printViolations('Logging policy violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Logging policy passed\n');
}
