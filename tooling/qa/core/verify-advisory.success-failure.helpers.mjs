import ts from 'typescript';
import { getCallExpressionName } from './typescript-ast-helpers.mjs';

const LOCAL_STATE_TRANSITION_PATTERN = /^(?:close|hide|set)[A-Z_]/u;
const PERSISTENCE_CALL_PATTERN =
  /(?:save|persist|write|update|put|sendRuntimeMessage|sendMessage)/iu;
const STORAGE_MUTATION_NAME_PATTERN = /^(?:set|remove|delete|put)$/u;
const STORAGE_OWNER_PATTERN = /(?:storage|indexedDB|database|db)/iu;
const SAFE_LOCAL_TRANSITION_NAMES = new Set(['setTimeout']);

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function callMatchesPattern(node, pattern) {
  const callName = getCallExpressionName(node);
  return callName !== null && !SAFE_LOCAL_TRANSITION_NAMES.has(callName) && pattern.test(callName);
}

function isPersistenceCallExpression(node) {
  if (callMatchesPattern(node, PERSISTENCE_CALL_PATTERN)) {
    return true;
  }

  if (
    !ts.isPropertyAccessExpression(node.expression) ||
    !STORAGE_MUTATION_NAME_PATTERN.test(node.expression.name.text)
  ) {
    return false;
  }

  return STORAGE_OWNER_PATTERN.test(node.expression.expression.getText());
}

function statementHasAwaitedPersistenceCall(statement) {
  let hasPersistenceCall = false;

  const inspectStatement = (child) => {
    if (hasPersistenceCall || isFunctionNode(child)) {
      return;
    }

    if (ts.isAwaitExpression(child)) {
      let awaitedPersistenceCall = false;
      const inspectAwaitedExpression = (awaitedChild) => {
        if (awaitedPersistenceCall || isFunctionNode(awaitedChild)) {
          return;
        }

        if (ts.isCallExpression(awaitedChild) && isPersistenceCallExpression(awaitedChild)) {
          awaitedPersistenceCall = true;
          return;
        }

        ts.forEachChild(awaitedChild, inspectAwaitedExpression);
      };

      inspectAwaitedExpression(child.expression);
      if (awaitedPersistenceCall) {
        hasPersistenceCall = true;
        return;
      }
    }

    ts.forEachChild(child, inspectStatement);
  };

  inspectStatement(statement);
  return hasPersistenceCall;
}

function findFirstAwaitedPersistenceStatementIndex(node) {
  if (!ts.isBlock(node.body)) {
    return -1;
  }

  return node.body.statements.findIndex(statementHasAwaitedPersistenceCall);
}

function hasLocalStateSetterBefore(node, statementIndex) {
  if (!ts.isBlock(node.body)) {
    return false;
  }

  return node.body.statements
    .slice(0, statementIndex)
    .some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        callMatchesPattern(statement.expression, LOCAL_STATE_TRANSITION_PATTERN)
    );
}

function walkFunctionBody(node, visit) {
  const walk = (child) => {
    if (isFunctionNode(child)) {
      return;
    }

    visit(child);
    ts.forEachChild(child, walk);
  };

  ts.forEachChild(node.body, walk);
}

function hasExplicitFailureHandling(node) {
  let hasFailureHandling = false;

  walkFunctionBody(node, (child) => {
    if (
      hasFailureHandling ||
      !ts.isTryStatement(child) ||
      (child.catchClause == null && child.finallyBlock == null)
    ) {
      return;
    }

    hasFailureHandling = true;
  });

  return hasFailureHandling;
}

export function collectSuccessFailureAsymmetryFinding(args) {
  const { createFinding, functionName, line, node, relativePath } = args;
  const bodyText = node.body.getText();
  const awaitedPersistenceStatementIndex = findFirstAwaitedPersistenceStatementIndex(node);

  if (
    awaitedPersistenceStatementIndex < 0 ||
    !hasLocalStateSetterBefore(node, awaitedPersistenceStatementIndex) ||
    hasExplicitFailureHandling(node) ||
    /\b(?:rollback|revert|restore)\b/u.test(bodyText)
  ) {
    return [];
  }

  return [
    createFinding({
      family: 'Success/failure asymmetry',
      file: relativePath,
      line,
      reason: [
        `Function "${functionName}" updates local state before awaited`,
        'persistence/runtime work without an explicit failure path.',
      ].join(' '),
      hint: 'Keep local state transitions symmetric with persistence/runtime success and failure outcomes.',
    }),
  ];
}
