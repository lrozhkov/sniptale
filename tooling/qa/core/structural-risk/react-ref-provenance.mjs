import { createLexicalBindingKey, ts } from './ast.mjs';

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      current.kind === ts.SyntaxKind.SatisfiesExpression)
  ) {
    current = current.expression;
  }
  return current;
}

function isReactImport(statement) {
  return (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === 'react'
  );
}

function recordReactImportBindings(clause, direct, namespaces, sourceFile) {
  if (clause?.name) namespaces.add(createLexicalBindingKey(clause.name, sourceFile));
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    namespaces.add(createLexicalBindingKey(bindings.name, sourceFile));
  }
  if (!bindings || !ts.isNamedImports(bindings)) return;
  for (const element of bindings.elements) {
    if ((element.propertyName ?? element.name).text === 'useRef') {
      direct.add(createLexicalBindingKey(element.name, sourceFile));
    }
  }
}

function collectReactUseRefImports(sourceFile) {
  const direct = new Set();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (!isReactImport(statement)) continue;
    recordReactImportBindings(statement.importClause, direct, namespaces, sourceFile);
  }
  return { direct, namespaces };
}

function bindingDeclaresName(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingDeclaresName(element.name, name)
  );
}

function scopeHasVarBinding(scope, name) {
  let shadowed = false;
  function visit(node) {
    if (shadowed || (node !== scope && ts.isFunctionLike(node))) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.BlockScoped) === 0 &&
      bindingDeclaresName(node.name, name)
    ) {
      shadowed = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(scope);
  return shadowed;
}

function hasFunctionScopedVarShadow(identifier, sourceFile) {
  let current = identifier.parent;
  while (current) {
    if (
      (current === sourceFile || ts.isFunctionLike(current)) &&
      scopeHasVarBinding(current, identifier.text)
    ) {
      return true;
    }
    if (current === sourceFile) break;
    current = current.parent;
  }
  return false;
}

function isReactUseRefCall(node, imports, sourceFile) {
  const current = unwrapExpression(node);
  if (!current || !ts.isCallExpression(current)) return false;
  const expression = unwrapExpression(current.expression);
  if (ts.isIdentifier(expression)) {
    if (hasFunctionScopedVarShadow(expression, sourceFile)) return false;
    return imports.direct.has(createLexicalBindingKey(expression, sourceFile));
  }
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'useRef' &&
    ts.isIdentifier(expression.expression) &&
    !hasFunctionScopedVarShadow(expression.expression, sourceFile) &&
    imports.namespaces.has(createLexicalBindingKey(expression.expression, sourceFile))
  );
}

export function collectReactRefBindings(sourceFile) {
  const imports = collectReactUseRefImports(sourceFile);
  const bindings = new Set();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
      isReactUseRefCall(node.initializer, imports, sourceFile)
    ) {
      bindings.add(createLexicalBindingKey(node.name, sourceFile));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return bindings;
}
