import ts from 'typescript';
import {
  getCallExpressionName,
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
} from './typescript-ast-helpers.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/u;
const DESTRUCTIVE_CALL_NAME_PATTERN = /^(?:hide|close|remove|destroy|dispose)[A-Z_]/u;
const REBUILD_CALL_NAME_PATTERN =
  /^(?:append|insert|mount|open|render|show|set[A-Z])[A-Za-z0-9_]*$/u;
const STALE_GUARD_PATTERN = /\b(?:token|requestId|abort|stale|generation|version|sequence)\b/u;
const RECOVERY_CALL_PATTERN = /\b(?:restore|rollback|revert|recover|reset)[A-Za-z0-9_]*\b/u;

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function collectBodySignals(node, sourceFile) {
  const signals = {
    awaitPositions: [],
    destructivePositions: [],
    rebuildPositions: [],
  };

  const visit = (child) => {
    if (isFunctionNode(child)) {
      return;
    }

    if (ts.isAwaitExpression(child)) {
      signals.awaitPositions.push(child.getStart(sourceFile));
    }

    const callName = getCallExpressionName(child);
    if (callName) {
      const position = child.getStart(sourceFile);

      if (DESTRUCTIVE_CALL_NAME_PATTERN.test(callName)) {
        signals.destructivePositions.push(position);
      }

      if (REBUILD_CALL_NAME_PATTERN.test(callName)) {
        signals.rebuildPositions.push(position);
      }
    }

    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node.body, visit);
  return signals;
}

function hasExplicitRecovery(bodyText) {
  return /\b(?:catch|finally)\b/u.test(bodyText) && RECOVERY_CALL_PATTERN.test(bodyText);
}

export function collectDestructiveAsyncSwapCandidates(file) {
  if (TEST_FILE_PATTERN.test(file) || !/\.(?:ts|tsx)$/u.test(file)) {
    return [];
  }

  const sourceFile = createTypeScriptSourceFile(file);
  const candidates = [];

  const visit = (node) => {
    if (!isFunctionNode(node) || !node.body) {
      ts.forEachChild(node, visit);
      return;
    }

    const bodyText = node.body.getText(sourceFile);
    if (STALE_GUARD_PATTERN.test(bodyText) || hasExplicitRecovery(bodyText)) {
      ts.forEachChild(node, visit);
      return;
    }

    const { awaitPositions, destructivePositions, rebuildPositions } = collectBodySignals(
      node,
      sourceFile
    );
    const firstAwaitPosition = Math.min(...awaitPositions);
    const hasAsyncGap = Number.isFinite(firstAwaitPosition);
    const hasPreAwaitDestructive = destructivePositions.some(
      (position) => position < firstAwaitPosition
    );
    const hasPostAwaitRebuild = rebuildPositions.some((position) => position > firstAwaitPosition);

    if (hasAsyncGap && hasPreAwaitDestructive && hasPostAwaitRebuild) {
      candidates.push({
        functionName: getFunctionLikeName(node) ?? '<anonymous>',
        line: getNodeLine(sourceFile, node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return candidates;
}
