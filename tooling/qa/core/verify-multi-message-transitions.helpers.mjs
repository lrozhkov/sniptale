import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getFunctionLikeName, toRootRelativePath } from './typescript-ast-helpers.mjs';
import { collectPolicyEntryViolations } from './policy-entry-helpers.mjs';

const MESSAGE_CALL_NAMES = new Set([
  'dispatchMessage',
  'postMessage',
  'sendMessage',
  'sendRuntimeMessage',
]);

export function readMultiMessagePolicy(rootDir, policyPath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, policyPath), 'utf8'));
}

export function getFunctionName(node) {
  return getFunctionLikeName(node) ?? 'anonymousTransition';
}

export { toRootRelativePath };

export function isAllowedOrchestrator(allowedOwners, relativePath, functionName) {
  return allowedOwners.some(
    (entry) => entry.file === relativePath && entry.function === functionName
  );
}

function countMessageCalls(node) {
  let count = 0;

  const visit = (current) => {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isClassDeclaration(current) ||
      ts.isClassExpression(current)
    ) {
      return;
    }

    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      const callName = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : null;

      if (callName && MESSAGE_CALL_NAMES.has(callName)) {
        count += 1;
      }
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return count;
}

function applySequentialStatements(statements, states) {
  let nextStates = states;

  for (const statement of statements) {
    const openStates = nextStates.filter((state) => state.open);
    const closedStates = nextStates.filter((state) => !state.open);
    nextStates = [
      ...closedStates,
      ...openStates.flatMap((state) => applyStatement(statement, state)),
    ];
  }

  return nextStates;
}

function applyBranch(statement, state) {
  if (ts.isBlock(statement)) {
    return applySequentialStatements(statement.statements, [state]);
  }

  return applyStatement(statement, state);
}

function applySwitchClause(clause, state) {
  return applySequentialStatements(clause.statements, [state]);
}

function applyIfStatement(statement, baseCount) {
  const conditionCount = countMessageCalls(statement.expression);
  const branchState = { count: baseCount + conditionCount, open: true };
  const thenStates = applyBranch(statement.thenStatement, branchState);
  const elseStates = statement.elseStatement
    ? applyBranch(statement.elseStatement, branchState)
    : [branchState];
  return [...thenStates, ...elseStates];
}

function applyTryStatement(statement, state) {
  const tryStates = applyBranch(statement.tryBlock, state);
  const catchStates = statement.catchClause ? applyBranch(statement.catchClause.block, state) : [];
  const branchStates = catchStates.length > 0 ? [...tryStates, ...catchStates] : tryStates;
  if (!statement.finallyBlock) {
    return branchStates;
  }

  return applySequentialStatements(statement.finallyBlock.statements, branchStates);
}

function isLoopStatement(statement) {
  return (
    ts.isForStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement)
  );
}

function applyStatement(statement, state) {
  const baseCount = state.count;

  if (ts.isBlock(statement)) {
    return applySequentialStatements(statement.statements, [state]);
  }

  if (ts.isExpressionStatement(statement)) {
    return [{ count: baseCount + countMessageCalls(statement.expression), open: true }];
  }

  if (ts.isVariableStatement(statement)) {
    return [{ count: baseCount + countMessageCalls(statement), open: true }];
  }

  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
    return [{ count: baseCount + countMessageCalls(statement), open: false }];
  }

  if (ts.isIfStatement(statement)) {
    return applyIfStatement(statement, baseCount);
  }

  if (ts.isTryStatement(statement)) {
    return applyTryStatement(statement, state);
  }

  if (ts.isSwitchStatement(statement)) {
    const baseState = { count: baseCount + countMessageCalls(statement.expression), open: true };
    return statement.caseBlock.clauses.flatMap((clause) => applySwitchClause(clause, baseState));
  }

  if (isLoopStatement(statement)) {
    const loopBase = { count: baseCount + countMessageCalls(statement), open: true };
    return applyBranch(statement.statement, loopBase);
  }

  return [{ count: baseCount + countMessageCalls(statement), open: true }];
}

export function getMaxMessagePathCount(node) {
  if (!node.body) {
    return 0;
  }

  const body = ts.isBlock(node.body)
    ? node.body.statements
    : [ts.factory.createExpressionStatement(node.body)];
  return Math.max(
    ...applySequentialStatements(body, [{ count: 0, open: true }]).map((state) => state.count)
  );
}

export function collectMultiMessagePolicyViolations(allowedOwners, policyPath, rootDir) {
  return collectPolicyEntryViolations(allowedOwners, {
    metadataRule: 'multi-message-orchestration-policy-metadata',
    metadataMessage: (entry) =>
      `Orchestration policy entry "${entry?.file ?? '<unknown>'}" is missing ` +
      'file/function/owner/justification/reviewNote metadata.',
    missingTargetRule: 'multi-message-orchestration-policy-missing-target',
    missingTargetMessage: (entry) =>
      `Orchestration policy entry "${entry.file}" points to a missing file. ` +
      'Update the registry to the real orchestration owner.',
    policyPath,
    requiredFields: ['file', 'function', 'owner', 'justification', 'reviewNote'],
    rootDir,
  });
}
