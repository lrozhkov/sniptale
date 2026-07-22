import fs from 'node:fs';
import path from 'node:path';

import { createSourceFile, ts } from './structural-risk/ast.mjs';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const CODE_EXTENSION_SET = new Set(CODE_EXTENSIONS);
const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__\/|test\/)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function stripQueryAndHash(specifier) {
  return specifier.replace(/[?#].*$/u, '');
}

function hasExplicitResourceExtension(value) {
  const extension = path.posix.extname(value);
  return extension !== '' && !CODE_EXTENSION_SET.has(extension);
}

function collectPackageTargets(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectPackageTargets);
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(collectPackageTargets);
  return [];
}

function resolveExistingCodeTarget(base, fileSet) {
  const normalized = normalize(base);
  const candidates = [normalized];
  if (!path.posix.extname(normalized)) {
    candidates.push(...CODE_EXTENSIONS.map((extension) => `${normalized}${extension}`));
    candidates.push(...CODE_EXTENSIONS.map((extension) => `${normalized}/index${extension}`));
  }
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function readJson(relativePath, readFile) {
  try {
    return JSON.parse(readFile(relativePath));
  } catch {
    return null;
  }
}

function resolvePackageSpecifier(specifier, fileSet, root, readFile) {
  if (!specifier.startsWith('@sniptale/')) return null;
  const packagePathSuffix = specifier.slice('@sniptale/'.length);
  const separator = packagePathSuffix.indexOf('/');
  const packageName = separator === -1 ? packagePathSuffix : packagePathSuffix.slice(0, separator);
  if (!packageName) return null;
  const exportKey = separator === -1 ? '.' : `.${packagePathSuffix.slice(separator)}`;
  const packagePath = `packages/${packageName}/package.json`;
  const manifest = readJson(packagePath, readFile);
  const declaration = manifest?.exports?.[exportKey];
  if (declaration == null) return null;
  let missingResourceTarget = null;
  for (const target of collectPackageTargets(declaration)) {
    const manifestTarget = normalize(path.posix.join(path.posix.dirname(packagePath), target));
    if (hasExplicitResourceExtension(target)) {
      if (resourceExists(root, manifestTarget, readFile)) {
        return { kind: 'resource', target: manifestTarget };
      }
      missingResourceTarget = manifestTarget;
      continue;
    }
    const resolved = resolveExistingCodeTarget(manifestTarget, fileSet);
    if (resolved) return { kind: 'code', target: resolved };
  }
  return missingResourceTarget ? { kind: 'missing-resource', target: missingResourceTarget } : null;
}

function resourceExists(root, relativePath, readFile) {
  if (fs.existsSync(path.join(root, relativePath))) return true;
  try {
    readFile(relativePath);
    return true;
  } catch {
    return false;
  }
}

function resolveSpecifier({ file, specifier, fileSet, root, readFile }) {
  const cleanSpecifier = stripQueryAndHash(specifier);
  if (cleanSpecifier.startsWith('.')) {
    const base = normalize(path.posix.join(path.posix.dirname(file), cleanSpecifier));
    if (hasExplicitResourceExtension(base)) {
      return resourceExists(root, base, readFile)
        ? { kind: 'resource', target: base, retainedSpecifier: specifier }
        : { kind: 'missing-resource', target: base, retainedSpecifier: specifier };
    }
    const target = resolveExistingCodeTarget(base, fileSet);
    return target
      ? { kind: 'code', target, retainedSpecifier: specifier }
      : { kind: 'unresolved', retainedSpecifier: specifier };
  }
  if (cleanSpecifier.startsWith('@sniptale/')) {
    const target = resolvePackageSpecifier(cleanSpecifier, fileSet, root, readFile);
    if (target) return { ...target, retainedSpecifier: specifier };
    if (hasExplicitResourceExtension(cleanSpecifier)) {
      return { kind: 'missing-resource', target: cleanSpecifier, retainedSpecifier: specifier };
    }
    return { kind: 'unresolved', retainedSpecifier: specifier };
  }
  return { kind: 'third-party', retainedSpecifier: specifier };
}

function collectModuleSpecifiers(sourceFile) {
  const edges = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push({
        kind: ts.isExportDeclaration(node) ? 're-export' : 'import',
        specifier: node.moduleSpecifier.text,
      });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      edges.push({ kind: 'dynamic-import', specifier: node.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return edges;
}

function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function collectFunctions(sourceFile) {
  const functions = [];
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      functions.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return functions;
}

function isTrivialDelegation(node) {
  const body = node.body;
  if (!body) return true;
  if (!ts.isBlock(body)) return ts.isCallExpression(body) || ts.isAwaitExpression(body);
  if (body.statements.length !== 1) return false;
  const statement = body.statements[0];
  if (ts.isReturnStatement(statement)) {
    const expression = statement.expression;
    return Boolean(
      expression && (ts.isCallExpression(expression) || ts.isAwaitExpression(expression))
    );
  }
  return ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression);
}

function collectSyntaxSignals(file, sourceFile, source) {
  const significant = sourceFile.statements.filter(
    (statement) => !ts.isImportDeclaration(statement)
  );
  const forwardingOnly =
    significant.length > 0 &&
    significant.every(
      (statement) => ts.isExportDeclaration(statement) && statement.moduleSpecifier != null
    );
  const functions = collectFunctions(sourceFile);
  const declarationsOnly = significant.every(
    (statement) =>
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isExportDeclaration(statement) ||
      hasExportModifier(statement)
  );
  const passThrough =
    !forwardingOnly &&
    functions.length > 0 &&
    declarationsOnly &&
    functions.every(isTrivialDelegation);
  const delegationOnlyTest =
    TEST_FILE_PATTERN.test(file) &&
    /(?:toHaveBeenCalled|toHaveBeenCalledWith|toHaveReturned|mock\.calls)/u.test(source) &&
    !/(?:rollback|cleanup|failure|throws|rejects|ordering|invariant)/iu.test(source);
  return { forwardingOnly, passThrough, delegationOnlyTest };
}

export function collectTopologyModuleGraph({ files, root, readFile }) {
  const normalizedFiles = [...new Set(files.map(normalize))].sort();
  const fileSet = new Set(normalizedFiles);
  const modules = [];
  const codeEdges = [];
  const resourceEdges = [];
  const unresolvedEdges = [];

  for (const file of normalizedFiles) {
    const source = readFile(file);
    const sourceFile = createSourceFile(file, source);
    modules.push({ file, ...collectSyntaxSignals(file, sourceFile, source) });
    for (const edge of collectModuleSpecifiers(sourceFile)) {
      const resolution = resolveSpecifier({
        file,
        specifier: edge.specifier,
        fileSet,
        root,
        readFile,
      });
      const evidence = {
        importer: file,
        specifier: resolution.retainedSpecifier,
        edgeKind: edge.kind,
      };
      if (resolution.kind === 'code') codeEdges.push({ ...evidence, target: resolution.target });
      if (resolution.kind === 'resource')
        resourceEdges.push({ ...evidence, target: resolution.target });
      if (resolution.kind === 'unresolved') unresolvedEdges.push(evidence);
    }
  }

  const byImporter = (left, right) =>
    left.importer.localeCompare(right.importer) || left.specifier.localeCompare(right.specifier);
  return {
    files: normalizedFiles,
    modules: modules.sort((left, right) => left.file.localeCompare(right.file)),
    codeEdges: codeEdges.sort(byImporter),
    resourceEdges: resourceEdges.sort(byImporter),
    unresolvedEdges: unresolvedEdges.sort(byImporter),
  };
}
