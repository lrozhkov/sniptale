import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';

import { createSourceFile, ts } from '../structural-risk/ast.mjs';

export const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const CODE_EXTENSION_SET = new Set(CODE_EXTENSIONS);

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
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectPackageTargets);
  }
  return [];
}

function resolveExistingCodeTarget(base, fileSet) {
  const normalized = normalize(base);
  const candidates = [normalized];
  if (!CODE_EXTENSION_SET.has(path.posix.extname(normalized))) {
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

function resourceExists(root, relativePath, readFile) {
  if (fs.existsSync(path.join(root, relativePath))) return true;
  try {
    readFile(relativePath);
    return true;
  } catch {
    return false;
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
  const declaration = readJson(packagePath, readFile)?.exports?.[exportKey];
  let missingResourceTarget = null;
  for (const target of collectPackageTargets(declaration)) {
    const manifestTarget = normalize(path.posix.join(path.posix.dirname(packagePath), target));
    if (hasExplicitResourceExtension(target) && resourceExists(root, manifestTarget, readFile)) {
      return { kind: 'resource', target: manifestTarget };
    }
    const resolved = resolveExistingCodeTarget(manifestTarget, fileSet);
    if (resolved) return { kind: 'code', target: resolved };
    if (hasExplicitResourceExtension(target)) {
      missingResourceTarget = manifestTarget;
      continue;
    }
  }
  return missingResourceTarget ? { kind: 'missing-resource', target: missingResourceTarget } : null;
}

function resolveSpecifier({ file, specifier, fileSet, root, readFile }) {
  const cleanSpecifier = stripQueryAndHash(specifier);
  if (cleanSpecifier.startsWith('.')) {
    const base = normalize(path.posix.join(path.posix.dirname(file), cleanSpecifier));
    if (hasExplicitResourceExtension(base) && resourceExists(root, base, readFile)) {
      return { kind: 'resource', target: base, retainedSpecifier: specifier };
    }
    const target = resolveExistingCodeTarget(base, fileSet);
    if (target) return { kind: 'code', target, retainedSpecifier: specifier };
    if (hasExplicitResourceExtension(base)) {
      return { kind: 'missing-resource', target: base, retainedSpecifier: specifier };
    }
    return { kind: 'unresolved', retainedSpecifier: specifier };
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
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        edges.push({ kind: 'require', specifier: node.arguments[0].text });
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'vi' &&
        ['mock', 'doMock'].includes(node.expression.name.text)
      ) {
        edges.push({ kind: 'mock', specifier: node.arguments[0].text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return edges;
}

function collectCssSpecifiers(source) {
  const edges = [];
  const root = postcss.parse(source);
  root.walkAtRules('import', (rule) => {
    let params = rule.params.trimStart();
    if (params.startsWith('url(')) params = params.slice(4).trimStart();
    const quote = params[0];
    if (quote !== '"' && quote !== "'") return;
    const end = params.indexOf(quote, 1);
    if (end > 1) edges.push({ kind: 'css-import', specifier: params.slice(1, end) });
  });
  return edges;
}

export function collectModuleImportGraph({ files, root, readFile, version = 'current' }) {
  const normalizedFiles = [...new Set(files.map(normalize))].sort();
  const fileSet = new Set(normalizedFiles);
  const codeEdges = [];
  const resourceEdges = [];
  const unresolvedEdges = [];

  for (const file of normalizedFiles) {
    const source = readFile(file);
    const edges = file.endsWith('.css')
      ? collectCssSpecifiers(source)
      : collectModuleSpecifiers(createSourceFile(file, source, { version }));
    for (const edge of edges) {
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
      if (resolution.kind === 'resource') {
        resourceEdges.push({ ...evidence, target: resolution.target });
      }
      if (resolution.kind === 'unresolved') unresolvedEdges.push(evidence);
    }
  }

  const byImporter = (left, right) =>
    left.importer.localeCompare(right.importer) || left.specifier.localeCompare(right.specifier);
  return {
    files: normalizedFiles,
    codeEdges: codeEdges.sort(byImporter),
    resourceEdges: resourceEdges.sort(byImporter),
    unresolvedEdges: unresolvedEdges.sort(byImporter),
  };
}
