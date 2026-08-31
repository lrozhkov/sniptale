import { getTransparentExpressionRoot, hasExportModifier, ts, unwrapExpression } from './ast.mjs';
import { isGeneratedDataFile, TEST_FILE_PATTERN } from './config.mjs';
import {
  classifyArchitecturalLayer,
  isEntrypointOwner,
  isRegisteredOrchestrationOwner,
} from './owner-classifier.mjs';

const ALGORITHM_PATTERN =
  /(?:^|\/)(?:parser|parsers|algorithm|algorithms|reducer|reducers)(?:\/|\.)/u;
const REGISTERED_PURE_ALGORITHM_OWNERS = new Set();

function containsJsx(node) {
  let found = false;
  function visit(current) {
    if (
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function directVariableBindingName(node) {
  const current = getTransparentExpressionRoot(node);
  const declaration = current.parent;
  return ts.isVariableDeclaration(declaration) && declaration.initializer === current
    ? declaration.name
    : null;
}

function functionBindingName(node) {
  const variableBinding = directVariableBindingName(node);
  if (variableBinding && ts.isIdentifier(variableBinding)) return variableBinding.text;
  return ts.isFunctionDeclaration(node) && node.name ? node.name.text : null;
}

const TEST_FIXTURE_BUILDER_PATTERN = /^(?:create|build|make)[A-Z]|(?:Fixture|Mock)$/u;

export function getDeclarativeTestFixtureRoot(relativePath, symbol, node, metrics = null) {
  if (!TEST_FILE_PATTERN.test(relativePath) || !TEST_FIXTURE_BUILDER_PATTERN.test(symbol)) {
    return null;
  }
  if (
    metrics &&
    (metrics.effectFamilies.length > 0 ||
      metrics.stateAuthorities > 0 ||
      metrics.recoveryPressure > 0)
  ) {
    return null;
  }
  let returned = node.body;
  if (returned && ts.isBlock(returned)) {
    if (returned.statements.length !== 1 || !ts.isReturnStatement(returned.statements[0])) {
      return null;
    }
    returned = returned.statements[0].expression;
  }
  const root = returned ? unwrapExpression(returned) : null;
  return root && (ts.isObjectLiteralExpression(root) || ts.isArrayLiteralExpression(root))
    ? root
    : null;
}

function collectModifiedBindings(statement, exported) {
  if (!hasExportModifier(statement)) return;
  if (statement.name && ts.isIdentifier(statement.name)) exported.add(statement.name.text);
  if (!ts.isVariableStatement(statement)) return;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text);
  }
}

function collectNamedExportBindings(statement, exported) {
  if (
    !ts.isExportDeclaration(statement) ||
    statement.moduleSpecifier ||
    !statement.exportClause ||
    !ts.isNamedExports(statement.exportClause)
  ) {
    return;
  }
  for (const element of statement.exportClause.elements) {
    exported.add((element.propertyName ?? element.name).text);
  }
}

function collectDefaultExportBinding(statement, exported) {
  if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
    exported.add(statement.expression.text);
  }
}

function collectExportedBindings(sourceFile) {
  const exported = new Set();
  for (const statement of sourceFile.statements) {
    collectModifiedBindings(statement, exported);
    collectNamedExportBindings(statement, exported);
    collectDefaultExportBinding(statement, exported);
  }
  return exported;
}

function isExportedFunction(node, exportedBindings) {
  if (hasExportModifier(node) || ts.isExportAssignment(getTransparentExpressionRoot(node).parent)) {
    return true;
  }
  const bindingName = functionBindingName(node);
  return bindingName ? exportedBindings.has(bindingName) : false;
}

function chooseProfile(relativePath, symbol, node, metrics, exportedBindings) {
  if (getDeclarativeTestFixtureRoot(relativePath, symbol, node, metrics)) return 'test-fixture';
  if (TEST_FILE_PATTERN.test(relativePath)) return 'test';
  if (isGeneratedDataFile(relativePath)) return 'generated-data';
  if (isEntrypointOwner(relativePath) && isExportedFunction(node, exportedBindings)) {
    return 'entrypoint';
  }
  if (
    /^(?:use[A-Z]|[A-Z])/u.test(symbol) &&
    (containsJsx(node) || /(?:Component|Hook)$/u.test(symbol))
  ) {
    return 'react';
  }
  if (
    (ALGORITHM_PATTERN.test(relativePath) || REGISTERED_PURE_ALGORITHM_OWNERS.has(relativePath)) &&
    metrics.effectFamilies.length === 0 &&
    metrics.stateAuthorities === 0
  ) {
    return 'pure';
  }
  const layer = classifyArchitecturalLayer(relativePath);
  if (layer === 'adapter') return 'adapter';
  if (isRegisteredOrchestrationOwner(relativePath)) return 'orchestration';
  return 'default';
}

export function createFunctionProfileClassifier(sourceFile, relativePath) {
  const exportedBindings = collectExportedBindings(sourceFile);
  return (symbol, node, metrics) =>
    chooseProfile(relativePath, symbol, node, metrics, exportedBindings);
}
