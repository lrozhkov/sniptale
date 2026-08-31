import path from 'node:path';
import ts from 'typescript';

import { getParseableSourceSnapshot } from './source-snapshot.mjs';

const MODULE_REFERENCE_CALLS = new Set([
  'importOriginal',
  'jest.mock',
  'require',
  'vi.doMock',
  'vi.importActual',
  'vi.importMock',
  'vi.mock',
]);

export function createTypeScriptSourceFile(filePath, text = null, { version = 'current' } = {}) {
  return getParseableSourceSnapshot({ filePath, text: text ?? undefined, version }).sourceFile;
}

export function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getFunctionLikeName(node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node)) &&
    node.name
  ) {
    return node.name.text;
  }

  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }

  return null;
}

export function getPropertyAccessChain(node) {
  if (ts.isIdentifier(node)) {
    return [node.text];
  }

  if (ts.isPropertyAccessExpression(node)) {
    const chain = getPropertyAccessChain(node.expression);
    return chain ? [...chain, node.name.text] : null;
  }

  if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    return getPropertyAccessChain(node.expression);
  }

  return null;
}

export function getCallExpressionName(node) {
  if (!ts.isCallExpression(node)) {
    return null;
  }

  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }

  return null;
}

export function toRootRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function appendModuleReferenceLiteral(references, sourceFile, literal, rangeNode) {
  references.push({
    literal,
    line: getNodeLine(sourceFile, rangeNode),
    startLine: getNodeLine(sourceFile, rangeNode),
    endLine: sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd()).line + 1,
  });
}

function collectModuleReferenceNode(node, sourceFile, references) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      appendModuleReferenceLiteral(references, sourceFile, node.moduleSpecifier, node);
    }
  } else if (ts.isCallExpression(node)) {
    const callee = node.expression.getText(sourceFile);
    if (
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        MODULE_REFERENCE_CALLS.has(callee)) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      appendModuleReferenceLiteral(references, sourceFile, node.arguments[0], node);
    }
  } else if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    appendModuleReferenceLiteral(references, sourceFile, node.argument.literal, node);
  }
  ts.forEachChild(node, (child) => collectModuleReferenceNode(child, sourceFile, references));
}

export function collectModuleReferenceLiterals(sourceFile) {
  const references = [];
  collectModuleReferenceNode(sourceFile, sourceFile, references);
  return references;
}
