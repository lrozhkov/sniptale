import { createHash } from 'node:crypto';

import ts from 'typescript';

export function createSourceFile(relativePath, source) {
  const kind = relativePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : relativePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : relativePath.endsWith('.js') ||
          relativePath.endsWith('.mjs') ||
          relativePath.endsWith('.cjs')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, kind);
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

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
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
