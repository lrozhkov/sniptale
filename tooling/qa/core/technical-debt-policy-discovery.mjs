import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {
  CODE_FILE_PATTERN,
  collectPolicyManifestFiles,
  POLICY_DISCOVERY_SOURCE_MANIFEST,
  POLICY_SOURCE_PATTERN,
  preparePolicySourceManifest,
  sortPolicyStrings,
} from './technical-debt-policy-sources.mjs';

export { POLICY_DISCOVERY_SOURCE_MANIFEST } from './technical-debt-policy-sources.mjs';

const CODE_EXTENSIONS = ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'];
const TEST_FILE_PATTERN = /\.(?:test|spec)[.-]/u;

function unwrapCollection(expression) {
  if (
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapCollection(expression.expression);
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    ts.isIdentifier(expression.expression.expression) &&
    expression.expression.expression.text === 'Object' &&
    expression.expression.name.text === 'freeze' &&
    expression.arguments.length === 1
  ) {
    return unwrapCollection(expression.arguments[0]);
  }
  return expression;
}

function isCollectionExpression(expression) {
  const value = unwrapCollection(expression);
  return (
    ts.isArrayLiteralExpression(value) ||
    ts.isObjectLiteralExpression(value) ||
    (ts.isNewExpression(value) &&
      ts.isIdentifier(value.expression) &&
      ['Map', 'Set'].includes(value.expression.text))
  );
}

function nodeName(node, sourceFile) {
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  return `anonymous-${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function locatorSegment(value) {
  return encodeURIComponent(value).replaceAll('*', '%2A');
}

function discoverSourceSurfaces(relativePath, source) {
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  if (sourceFile.parseDiagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(
      sourceFile.parseDiagnostics[0].messageText,
      '\n'
    );
    throw new SyntaxError(`Cannot discover policy surfaces in ${relativePath}: ${message}`);
  }
  const locators = [];
  const occurrences = new Map();
  const scopes = [];
  function add(kind, name) {
    const prefix = scopes.length > 0 ? `${scopes.map(locatorSegment).join('/')}/` : '';
    const base = `${kind}:${prefix}${locatorSegment(name)}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    locators.push(occurrence === 0 ? base : `${base}[${occurrence}]`);
  }
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      scopes.length === 0 &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isCollectionExpression(node.initializer)
    ) {
      add('binding', node.name.text);
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      isCollectionExpression(node.initializer)
    ) {
      add('property', node.name.text);
    }
    const functionLike = ts.isFunctionLike(node);
    if (functionLike) {
      const name = nodeName(node, sourceFile);
      scopes.push(name);
    }
    ts.forEachChild(node, visit);
    if (functionLike) scopes.pop();
  }
  visit(sourceFile);
  return sortPolicyStrings(new Set(locators));
}

function moduleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function resolveModule(importer, specifier, files) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  return (
    [base, ...CODE_EXTENSIONS.map((extension) => `${base}${extension}`)].find((candidate) =>
      files.has(candidate)
    ) ?? null
  );
}

function collectReverseImports(root, codeFiles) {
  const fileSet = new Set(codeFiles);
  const reverse = new Map();
  for (const importer of codeFiles) {
    const source = fs.readFileSync(path.join(root, importer), 'utf8');
    const sourceFile = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, true);
    for (const specifier of moduleSpecifiers(sourceFile)) {
      const target = resolveModule(importer, specifier, fileSet);
      if (!target) continue;
      const consumers = reverse.get(target) ?? new Set();
      consumers.add(importer);
      reverse.set(target, consumers);
    }
  }
  return reverse;
}

function literalConsumers(sourcePath, policySources) {
  const basename = path.posix.basename(sourcePath);
  return policySources
    .filter(({ file }) => file !== sourcePath)
    .filter(({ source }) => source.includes(basename))
    .map(({ file }) => file);
}

export function collectPolicySurfaceInventory(
  root,
  { sourceManifest = POLICY_DISCOVERY_SOURCE_MANIFEST } = {}
) {
  const manifest = preparePolicySourceManifest(root, sourceManifest);
  const codeFiles = collectPolicyManifestFiles(root, manifest, (file) =>
    CODE_FILE_PATTERN.test(file)
  );
  const policyFiles = collectPolicyManifestFiles(root, manifest, (file) =>
    POLICY_SOURCE_PATTERN.test(file)
  );
  const policySources = policyFiles.map((file) => ({
    file,
    source: fs.readFileSync(path.join(root, file), 'utf8'),
  }));
  const reverseImports = collectReverseImports(root, codeFiles);
  const surfaces = codeFiles
    .filter((file) => !TEST_FILE_PATTERN.test(file))
    .flatMap((sourcePath) => {
      const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
      const consumers = sortPolicyStrings([sourcePath, ...(reverseImports.get(sourcePath) ?? [])]);
      return discoverSourceSurfaces(sourcePath, source).map((locator) => ({
        key: `${sourcePath}#${locator}`,
        sourcePath,
        locator,
        consumers,
      }));
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    surfaces,
    consumersFor(sourcePath) {
      if (CODE_FILE_PATTERN.test(sourcePath)) {
        return sortPolicyStrings([sourcePath, ...(reverseImports.get(sourcePath) ?? [])]);
      }
      return sortPolicyStrings(literalConsumers(sourcePath, policySources));
    },
  };
}
