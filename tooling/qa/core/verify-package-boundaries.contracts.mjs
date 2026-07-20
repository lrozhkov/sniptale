import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import ts from 'typescript';

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

export function contractLifecycleGlobalErrors(file, packageName, contents) {
  if (!CONTRACT_PACKAGE_NAMES.has(packageName) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) {
    return [];
  }
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
  const globals = new Set();
  const visit = (node) => {
    if (
      ts.isIdentifier(node) &&
      FORBIDDEN_CONTRACT_GLOBALS.has(node.text) &&
      !isPropertyName(node)
    ) {
      globals.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...globals]
    .sort()
    .map((globalName) => `contract package uses lifecycle global: ${file} -> ${globalName}`);
}
