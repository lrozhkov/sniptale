import { createHash } from 'node:crypto';

import ts from 'typescript';

import { getParseableSourceSnapshot } from '../source/source-snapshot.mjs';

export function createSourceFile(relativePath, source, { version = 'current' } = {}) {
  return getParseableSourceSnapshot({ filePath: relativePath, text: source, version }).sourceFile;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getNodeEndLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

export function getTransparentExpressionRoot(node) {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      current.parent.kind === ts.SyntaxKind.SatisfiesExpression)
  ) {
    current = current.parent;
  }
  return current;
}

export function unwrapExpression(node) {
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

function functionName(node, sourceFile) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(node)) {
    return parent.name?.getText(sourceFile) ?? node.name?.getText(sourceFile) ?? '<anonymous>';
  }
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression.getText(sourceFile);
    return `${callee} callback`;
  }
  return '<anonymous>';
}

export function isFunctionNode(node, { includeConstructor = true } = {}) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    (includeConstructor && ts.isConstructorDeclaration(node))
  );
}

export function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
  );
}

function findBindingIdentifier(name, node) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text === name ? node : null;
  if (ts.isBindingElement(node)) return findBindingIdentifier(name, node.name);
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    for (const element of node.elements) {
      const match = findBindingIdentifier(name, element);
      if (match) return match;
    }
  }
  return null;
}

function findDeclarationListBinding(name, declarationList) {
  if (!declarationList) return null;
  for (const declaration of declarationList.declarations) {
    const match = findBindingIdentifier(name, declaration.name);
    if (match) return match;
  }
  return null;
}

function findNamedStatementBinding(name, statement) {
  const namedDeclaration =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement);
  return namedDeclaration && statement.name?.text === name ? statement.name : null;
}

function findImportBinding(name, statement) {
  if (!ts.isImportDeclaration(statement)) return null;
  const clause = statement.importClause;
  if (clause?.name?.text === name) return clause.name;
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) {
    return bindings.name;
  }
  if (!bindings || !ts.isNamedImports(bindings)) return null;
  return bindings.elements.find((item) => item.name.text === name)?.name ?? null;
}

function findStatementBinding(name, statement) {
  const variableBinding = ts.isVariableStatement(statement)
    ? findDeclarationListBinding(name, statement.declarationList)
    : null;
  return (
    variableBinding ??
    findNamedStatementBinding(name, statement) ??
    findImportBinding(name, statement)
  );
}

function findFunctionBinding(name, node) {
  if (!isFunctionNode(node)) return null;
  for (const parameter of node.parameters ?? []) {
    const match = findBindingIdentifier(name, parameter.name);
    if (match) return match;
  }
  return node.name && ts.isIdentifier(node.name) && node.name.text === name ? node.name : null;
}

function findLoopBinding(name, node) {
  const initializer =
    ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)
      ? node.initializer
      : null;
  return initializer && ts.isVariableDeclarationList(initializer)
    ? findDeclarationListBinding(name, initializer)
    : null;
}

function findScopedStatementBinding(name, node) {
  if (!ts.isBlock(node) && !ts.isSourceFile(node)) return null;
  for (const statement of node.statements) {
    const match = findStatementBinding(name, statement);
    if (match) return match;
  }
  return null;
}

function findLexicalBinding(identifier) {
  const name = identifier.text;
  let current = identifier.parent;
  while (current) {
    const binding =
      findFunctionBinding(name, current) ??
      (ts.isCatchClause(current)
        ? findBindingIdentifier(name, current.variableDeclaration?.name)
        : null) ??
      findLoopBinding(name, current) ??
      findScopedStatementBinding(name, current);
    if (binding) return binding;
    current = current.parent;
  }
  return null;
}

export function createLexicalBindingKey(root, sourceFile, suffix = '') {
  if (root.kind === ts.SyntaxKind.ThisKeyword) {
    let owner = root.parent;
    while (owner && (!isFunctionNode(owner) || ts.isArrowFunction(owner))) owner = owner.parent;
    return `this@${owner?.getStart(sourceFile) ?? 'global'}${suffix}`;
  }
  if (ts.isIdentifier(root)) {
    const declaration = findLexicalBinding(root);
    return `${root.text}@${declaration?.getStart(sourceFile) ?? 'global'}${suffix}`;
  }
  return `${root.getText(sourceFile)}@dynamic${suffix}`;
}

export function collectFunctionNodes(sourceFile) {
  const result = [];
  const nameCounts = new Map();
  function visit(node, parents = []) {
    if (isFunctionNode(node)) {
      const name = functionName(node, sourceFile);
      const ownerNames = parents
        .filter(isFunctionNode)
        .map((parent) => functionName(parent, sourceFile));
      const base = [...ownerNames, name].join('.') || '<anonymous>';
      const count = (nameCounts.get(base) ?? 0) + 1;
      nameCounts.set(base, count);
      result.push({ node, symbol: count === 1 ? base : `${base}#${count}` });
    }
    ts.forEachChild(node, (child) => visit(child, [...parents, node]));
  }
  visit(sourceFile);
  return result;
}

export function createNormalizedNodeHashes(node, sourceFile, symbol) {
  const printer = ts.createPrinter({ removeComments: true });
  const print = (target) =>
    printer.printNode(ts.EmitHint.Unspecified, target, sourceFile).replace(/\s+/gu, ' ').trim();
  const normalizedBody = node.body ? print(node.body) : '';
  const parameters = node.parameters?.map(print) ?? [];
  const returnType = node.type ? print(node.type) : '';
  const signatureSymbol = symbol.replace(/#\d+$/u, '');
  return {
    astHash: sha256(normalizedBody),
    signatureHash: sha256(JSON.stringify({ symbol: signatureSymbol, parameters, returnType })),
  };
}

export function createNormalizedSourceHash(sourceFile) {
  const printer = ts.createPrinter({ removeComments: true });
  return sha256(printer.printFile(sourceFile).replace(/\s+/gu, ' ').trim());
}

export function getCallName(node, sourceFile) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return null;
  return node.expression.getText(sourceFile);
}

export { ts };
