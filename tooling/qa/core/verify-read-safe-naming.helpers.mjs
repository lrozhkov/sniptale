import ts from 'typescript';
import {
  createTypeScriptSourceFile,
  getFunctionLikeName,
  getNodeLine,
} from './typescript-ast-helpers.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const READ_SAFE_NAME_PATTERN = /^(?:get|load|read|list|prepare|resolve)[A-Z_]/u;
const DIRECT_MUTATION_CALL_PATTERN =
  /^(?:set|save|persist|write|put|remove|delete|migrate|cleanup|repair|reset|bootstrap|sync|hydrate|reconcile)[A-Z_]/u;
const MEMBER_MUTATION_CALL_NAMES = new Set([
  'set',
  'save',
  'persist',
  'write',
  'put',
  'remove',
  'delete',
  'migrate',
  'cleanup',
  'repair',
  'reset',
  'bootstrap',
  'sync',
  'hydrate',
  'reconcile',
  'replaceState',
  'pushState',
  'setItem',
  'removeItem',
]);

function getFunctionName(node) {
  return getFunctionLikeName(node) ?? '<anonymous>';
}

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function collectBindingNames(name, bindings) {
  if (ts.isIdentifier(name)) {
    bindings.add(name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, bindings);
      }
    }
  }
}

function collectLocalBindings(node) {
  const bindings = new Set();

  for (const parameter of node.parameters) {
    collectBindingNames(parameter.name, bindings);
  }

  const visit = (child) => {
    if (isFunctionNode(child)) {
      return;
    }

    if (ts.isVariableDeclaration(child)) {
      collectBindingNames(child.name, bindings);
    }

    if (ts.isCatchClause(child) && child.variableDeclaration) {
      collectBindingNames(child.variableDeclaration.name, bindings);
    }

    ts.forEachChild(child, visit);
  };

  if (node.body) {
    ts.forEachChild(node.body, visit);
  }

  return bindings;
}

function collectImportedBindings(sourceFile) {
  const bindings = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }

    const { importClause } = statement;
    if (importClause.name) {
      bindings.add(importClause.name.text);
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindings.add(namedBindings.name.text);
    }

    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        bindings.add(element.name.text);
      }
    }
  }

  return bindings;
}

function getRootIdentifierText(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain?.(expression)) {
    return getRootIdentifierText(expression.expression);
  }

  if (ts.isElementAccessExpression(expression) || ts.isElementAccessChain?.(expression)) {
    return getRootIdentifierText(expression.expression);
  }

  if (
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isCallExpression(expression) ||
    ts.isCallChain?.(expression)
  ) {
    return getRootIdentifierText(expression.expression);
  }

  return null;
}

function getPropertyNameText(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain?.(expression)) {
    return expression.name.text;
  }

  if (
    (ts.isElementAccessExpression(expression) || ts.isElementAccessChain?.(expression)) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }

  if (
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isCallExpression(expression) ||
    ts.isCallChain?.(expression)
  ) {
    return getPropertyNameText(expression.expression);
  }

  return null;
}

function isMutationCallExpression(node, localBindings, importedBindings) {
  const callee = node.expression;
  const propertyName = getPropertyNameText(callee);
  if (!propertyName) {
    return false;
  }

  if (ts.isIdentifier(callee)) {
    if (
      localBindings.has(callee.text) ||
      !importedBindings.has(callee.text) ||
      !DIRECT_MUTATION_CALL_PATTERN.test(callee.text)
    ) {
      return false;
    }

    return true;
  }

  if (!MEMBER_MUTATION_CALL_NAMES.has(propertyName)) {
    return false;
  }

  const rootIdentifier = getRootIdentifierText(callee);
  if (rootIdentifier && localBindings.has(rootIdentifier)) {
    return false;
  }

  return true;
}

function hasMutationSideEffect(node, importedBindings) {
  const localBindings = collectLocalBindings(node);
  let found = false;

  const visit = (child) => {
    if (found || (isFunctionNode(child) && child !== node)) {
      return;
    }

    if (
      ts.isCallExpression(child) &&
      isMutationCallExpression(child, localBindings, importedBindings)
    ) {
      found = true;
      return;
    }

    ts.forEachChild(child, visit);
  };

  if (node.body) {
    visit(node.body);
  }

  return found;
}

export function collectReadSafeNamingCandidates(filePath) {
  if (TEST_FILE_PATTERN.test(filePath)) {
    return [];
  }

  const sourceFile = createTypeScriptSourceFile(filePath);
  const importedBindings = collectImportedBindings(sourceFile);
  const candidates = [];

  const visit = (node) => {
    if (!isFunctionNode(node) || !node.body) {
      ts.forEachChild(node, visit);
      return;
    }

    const functionName = getFunctionName(node);
    if (
      READ_SAFE_NAME_PATTERN.test(functionName) &&
      hasMutationSideEffect(node, importedBindings)
    ) {
      candidates.push({
        functionName,
        line: getNodeLine(sourceFile, node),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return candidates;
}
