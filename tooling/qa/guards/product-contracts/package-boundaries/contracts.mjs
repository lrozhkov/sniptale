import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import ts from 'typescript';

import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

const CONTRACT_PACKAGE_NAMES = new Set(['@sniptale/foundation', '@sniptale/runtime-contracts']);
const FORBIDDEN_CONTRACT_GLOBALS = new Set(['chrome', 'document', 'navigator', 'window']);

function readJson(root, path) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  } catch {
    return null;
  }
}

export function packageTypescriptConfigErrors(root, packageName, packageRoot) {
  const configPath = `${packageRoot}/tsconfig.json`;
  const config = readJson(root, configPath);
  if (!config) return [`invalid package TypeScript config: ${configPath}`];
  const inputs = [...(config.files ?? []), ...(config.include ?? [])];
  return inputs
    .filter((input) =>
      posix.normalize(posix.join(packageRoot, input)).startsWith('apps/extension/')
    )
    .map(() => `package TypeScript config includes app owner: ${packageName}`);
}

function isPropertyName(node) {
  const parent = node.parent;
  return Boolean(
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node)
  );
}

function addBindingNames(name, names) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements ?? []) {
    if (!ts.isOmittedExpression(element)) addBindingNames(element.name, names);
  }
}

function isLexicalScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isFunctionLike(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCatchClause(node)
  );
}

function nearestScope(node, functionScoped = false) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (functionScoped && (ts.isSourceFile(current) || ts.isFunctionLike(current))) ||
      (!functionScoped && isLexicalScope(current))
    ) {
      return current;
    }
  }
  return null;
}

function collectScopeBindings(source) {
  const bindings = new Map();
  const add = (scope, name) => {
    if (!scope) return;
    const names = bindings.get(scope) ?? new Set();
    addBindingNames(name, names);
    bindings.set(scope, names);
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const declarationList = node.parent;
      const functionScoped = (declarationList.flags & ts.NodeFlags.BlockScoped) === 0;
      add(nearestScope(node, functionScoped), node.name);
    } else if (ts.isParameter(node)) {
      add(nearestScope(node), node.name);
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      add(nearestScope(node), node.name);
    } else if (ts.isImportClause(node) && node.name) {
      add(source, node.name);
    } else if (ts.isImportSpecifier(node)) {
      add(source, node.name);
    } else if (ts.isNamespaceImport(node)) {
      add(source, node.name);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      add(node, node.variableDeclaration.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bindings;
}

function isBound(node, name, bindings) {
  for (let current = node.parent; current; current = current.parent) {
    if (isLexicalScope(current) && bindings.get(current)?.has(name)) return true;
  }
  return false;
}

function isDeclarationName(node) {
  const parent = node.parent;
  return Boolean(
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node)
  );
}

export function contractLifecycleGlobalErrors(file, packageName, contents) {
  if (!CONTRACT_PACKAGE_NAMES.has(packageName) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) {
    return [];
  }
  const source = getSourceSnapshot({ filePath: file, text: contents }).sourceFile;
  const bindings = collectScopeBindings(source);
  const globals = new Set();
  const visit = (node) => {
    if (
      ts.isIdentifier(node) &&
      FORBIDDEN_CONTRACT_GLOBALS.has(node.text) &&
      !isPropertyName(node) &&
      !isDeclarationName(node) &&
      !isBound(node, node.text, bindings)
    ) {
      globals.add(node.text);
    }
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'globalThis' &&
      !isBound(node.expression, 'globalThis', bindings)
    ) {
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteral(node.argumentExpression)
          ? node.argumentExpression.text
          : null;
      if (name && FORBIDDEN_CONTRACT_GLOBALS.has(name)) globals.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...globals]
    .sort()
    .map((globalName) => `contract package uses lifecycle global: ${file} -> ${globalName}`);
}
