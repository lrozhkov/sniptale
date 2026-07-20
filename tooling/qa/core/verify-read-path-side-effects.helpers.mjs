import ts from 'typescript';
import { getCallExpressionName, getFunctionLikeName } from './typescript-ast-helpers.mjs';
import { matchesWordBoundaryPrefix } from './name-prefix-helpers.mjs';

const READ_PREFIXES = ['get', 'list', 'load', 'read', 'fetch', 'resolve', 'ensure'];
const MUTATING_CALL_PREFIXES = [
  'set',
  'put',
  'save',
  'write',
  'update',
  'upsert',
  'delete',
  'remove',
  'sync',
  'migrate',
  'repair',
  'cleanup',
  'bootstrap',
  'reconnect',
];

function matchesReadFunctionName(functionName) {
  return matchesWordBoundaryPrefix(functionName, READ_PREFIXES);
}

function isMutatingCallName(callName) {
  return matchesWordBoundaryPrefix(callName, MUTATING_CALL_PREFIXES);
}

function collectLocalCalledFunctionNames(node, localFunctionNames) {
  const calledFunctionNames = new Set();

  if (!node.body) {
    return calledFunctionNames;
  }

  const visit = (current) => {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const calledFunctionName = current.expression.text;
      if (localFunctionNames.has(calledFunctionName)) {
        calledFunctionNames.add(calledFunctionName);
      }
    }

    ts.forEachChild(current, visit);
  };

  ts.forEachChild(node.body, visit);
  return calledFunctionNames;
}

function functionBodyHasMutatingCall(node) {
  if (!node.body) {
    return false;
  }

  let found = false;
  const visit = (current) => {
    if (found) {
      return;
    }

    const callName = getCallExpressionName(current);
    if (callName && isMutatingCallName(callName)) {
      found = true;
      return;
    }

    ts.forEachChild(current, visit);
  };

  ts.forEachChild(node.body, visit);
  return found;
}

function collectNamedFunctionNodes(sourceFile) {
  const functionNodes = new Map();

  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      const functionName = getFunctionLikeName(node);
      if (functionName) {
        functionNodes.set(functionName, node);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return functionNodes;
}

function collectFunctionAnalyses(sourceFile) {
  const functionNodes = collectNamedFunctionNodes(sourceFile);
  const localFunctionNames = new Set(functionNodes.keys());
  const functionAnalyses = new Map();

  for (const [functionName, node] of functionNodes.entries()) {
    functionAnalyses.set(functionName, {
      directMutatingCall: functionBodyHasMutatingCall(node),
      localCalledFunctionNames: collectLocalCalledFunctionNames(node, localFunctionNames),
      node,
    });
  }

  return functionAnalyses;
}

function resolveSideEffectfulFunctions(functionAnalyses) {
  const sideEffectfulFunctions = new Set(
    [...functionAnalyses.entries()]
      .filter(([, analysis]) => analysis.directMutatingCall)
      .map(([functionName]) => functionName)
  );

  let changed = true;
  while (changed) {
    changed = false;

    for (const [functionName, analysis] of functionAnalyses.entries()) {
      if (sideEffectfulFunctions.has(functionName)) {
        continue;
      }

      if (
        [...analysis.localCalledFunctionNames].some((calledName) =>
          sideEffectfulFunctions.has(calledName)
        )
      ) {
        sideEffectfulFunctions.add(functionName);
        changed = true;
      }
    }
  }

  return sideEffectfulFunctions;
}

export function collectFileReadPathFunctionViolations(sourceFile) {
  const functionAnalyses = collectFunctionAnalyses(sourceFile);
  const sideEffectfulFunctions = resolveSideEffectfulFunctions(functionAnalyses);

  return [...functionAnalyses.entries()]
    .filter(
      ([functionName]) =>
        matchesReadFunctionName(functionName) && sideEffectfulFunctions.has(functionName)
    )
    .map(([functionName, analysis]) => ({
      functionName,
      node: analysis.node,
    }));
}
