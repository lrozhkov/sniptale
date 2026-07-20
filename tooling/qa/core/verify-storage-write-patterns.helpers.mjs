import ts from 'typescript';

import { matchesWordBoundaryPrefix } from './name-prefix-helpers.mjs';
import { isTestLikeFile, normalizeRepoScopedPath } from './repo-scoped-typescript-scan.mjs';
import { toRelativePath } from './shared.mjs';
import {
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
} from './typescript-ast-helpers.mjs';
import { STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS } from './verify-focused.config.mjs';

const HOT_PATH_SCAN_CALL_NAMES = new Set(['getAll', 'getAllFromIndex', 'openCursor']);
const WRITE_FUNCTION_PREFIXES = ['save', 'update', 'persist', 'write', 'store', 'set'];

function matchesWriteFunctionName(functionName) {
  return matchesWordBoundaryPrefix(functionName, WRITE_FUNCTION_PREFIXES);
}

function createHotPathCleanupViolation(file, functionName, line) {
  return {
    rule: 'storage-write-patterns',
    file,
    line,
    message: [
      `Write-style function "${functionName}" scans full persistence state on the hot path.`,
      'Move cleanup/reconciliation into an explicit maintenance seam.',
    ].join(' '),
  };
}

function shouldInspectFile(relativePath) {
  const normalizedPath = normalizeRepoScopedPath(relativePath);
  return (
    !isTestLikeFile(relativePath) &&
    STORAGE_WRITE_PATTERN_TRIGGER_PATTERNS.some((pattern) => pattern.test(normalizedPath))
  );
}

function functionHasFullScanCall(node) {
  let hasFullScanCall = false;

  const visit = (child) => {
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      HOT_PATH_SCAN_CALL_NAMES.has(child.expression.name.text)
    ) {
      hasFullScanCall = true;
      return;
    }

    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node.body, visit);
  return hasFullScanCall;
}

export function collectHotPathCleanupViolations(files) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!shouldInspectFile(relativePath)) {
      continue;
    }

    const sourceFile = createTypeScriptSourceFile(filePath);

    const visit = (node) => {
      if (
        !(
          ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node)
        ) ||
        !node.body
      ) {
        ts.forEachChild(node, visit);
        return;
      }

      const functionName = getFunctionLikeName(node);
      if (
        !functionName ||
        !matchesWriteFunctionName(functionName) ||
        !functionHasFullScanCall(node)
      ) {
        ts.forEachChild(node, visit);
        return;
      }

      violations.push(
        createHotPathCleanupViolation(relativePath, functionName, getNodeLine(sourceFile, node))
      );
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}
