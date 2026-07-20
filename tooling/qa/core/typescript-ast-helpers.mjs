import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export function createTypeScriptSourceFile(filePath, text = null) {
  return ts.createSourceFile(
    filePath,
    text ?? fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
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
