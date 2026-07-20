import ts from 'typescript';
import {
  getFunctionLikeName,
  getNodeLine,
  getPropertyAccessChain,
} from './typescript-ast-helpers.mjs';

const VALIDATOR_NAME_PATTERN = /^(?:parse|is|validate|assert|narrow|coerce)/u;

export function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

export { getPropertyAccessChain };

export function getFunctionName(node) {
  return getFunctionLikeName(node);
}

export { getNodeLine };

export function collectFunctionBindings(sourceFile) {
  const bindings = new Map();

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      bindings.set(node.name.text, node);
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      bindings.set(node.name.text, node.initializer);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return bindings;
}

export function getListenerCallbackNode(argument, bindings) {
  if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
    return argument;
  }

  if (ts.isIdentifier(argument)) {
    return bindings.get(argument.text) ?? null;
  }

  return null;
}

function getLastIdentifierText(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  if (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    return getLastIdentifierText(expression.expression);
  }

  return null;
}

function isDirectPropertyAccessOnParam(node, paramName) {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === paramName;
  }

  if (ts.isElementAccessExpression(node)) {
    return ts.isIdentifier(node.expression) && node.expression.text === paramName;
  }

  return false;
}

export function getBoundaryParam(callbackNode, sourceFile) {
  const firstParam = callbackNode.parameters[0];
  if (!firstParam || !ts.isIdentifier(firstParam.name)) {
    return null;
  }

  return {
    firstParam,
    paramName: firstParam.name.text,
    paramType: firstParam.type?.getText(sourceFile),
  };
}

export function collectBoundaryUsage(callbackNode, paramName) {
  let hasDirectPropertyAccess = false;
  let hasValidatorCall = false;
  let hasTypeAssertion = false;

  const visit = (node) => {
    if (isDirectPropertyAccessOnParam(node, paramName)) {
      hasDirectPropertyAccess = true;
    }

    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === paramName
    ) {
      hasTypeAssertion = true;
    }

    if (ts.isCallExpression(node)) {
      const calleeName = getLastIdentifierText(node.expression);
      const referencesParam = node.arguments.some(
        (argument) => ts.isIdentifier(argument) && argument.text === paramName
      );
      if (referencesParam && calleeName && VALIDATOR_NAME_PATTERN.test(calleeName)) {
        hasValidatorCall = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  if (callbackNode.body) {
    visit(callbackNode.body);
  }

  return { hasDirectPropertyAccess, hasValidatorCall, hasTypeAssertion };
}

export function getReturnedBoundaryCallbackNode(node) {
  if (!node.body || !ts.isBlock(node.body)) {
    return null;
  }

  for (const statement of node.body.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression &&
      (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression))
    ) {
      return statement.expression;
    }
  }

  return null;
}

export function getBoundaryFactoryName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text;
  }

  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }

  return null;
}

export function getBoundaryFactoryNode(node, bindings, factoryName) {
  if (ts.isIdentifier(node)) {
    return bindings.get(factoryName) ?? null;
  }

  if (ts.isVariableDeclaration(node)) {
    return node.initializer ?? null;
  }

  return node;
}
