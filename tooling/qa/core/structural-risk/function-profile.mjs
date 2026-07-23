import { getTransparentExpressionRoot, ts } from './ast.mjs';
import { isGeneratedDataFile, TEST_FILE_PATTERN } from './config.mjs';
import {
  classifyArchitecturalLayer,
  isEntrypointOwner,
  isRegisteredOrchestrationOwner,
} from './owner-classifier.mjs';

const ALGORITHM_PATTERN =
  /(?:^|\/)(?:parser|parsers|algorithm|algorithms|reducer|reducers)(?:\/|\.)/u;

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

function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
  );
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
    ALGORITHM_PATTERN.test(relativePath) &&
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
