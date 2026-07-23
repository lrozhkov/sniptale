import fs from 'node:fs';
import path from 'node:path';

import { CODE_EXTENSIONS } from './module-import-graph.mjs';
import { createSourceFile, ts } from './structural-risk/ast.mjs';

const MAX_AGGREGATE_PROVIDERS = 12;

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function hasModifier(node, kind) {
  return Boolean(
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
  );
}

function isTypeOnlyImport(statement) {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
    return false;
  }
  return (
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function isTypeOnlyExport(statement) {
  if (statement.isTypeOnly) return true;
  return Boolean(
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause) &&
    statement.exportClause.elements.length > 0 &&
    statement.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function collectStrictForwardingSpecifiers(sourceFile) {
  const specifiers = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!isTypeOnlyImport(statement)) return [];
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (!ts.isExportDeclaration(statement)) return [];
    if (isTypeOnlyExport(statement)) continue;
    if (
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith('.')
    ) {
      return [];
    }
    specifiers.push(statement.moduleSpecifier.text);
  }
  return uniqueSorted(specifiers);
}

function collectValueImportEntries(statement) {
  if (!ts.isImportDeclaration(statement) || isTypeOnlyImport(statement)) return [];
  if (!ts.isStringLiteral(statement.moduleSpecifier)) return null;
  const specifier = statement.moduleSpecifier.text;
  const clause = statement.importClause;
  if (!specifier.startsWith('.') || !clause) return null;
  const entries = clause.name ? [[clause.name.text, specifier]] : [];
  if (!clause.namedBindings) return entries;
  if (!ts.isNamedImports(clause.namedBindings)) return null;
  for (const element of clause.namedBindings.elements) {
    if (!element.isTypeOnly) entries.push([element.name.text, specifier]);
  }
  return entries;
}

function collectValueImportBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    const entries = collectValueImportEntries(statement);
    if (entries === null) return null;
    for (const [binding, specifier] of entries) bindings.set(binding, specifier);
  }
  return bindings.size > 0 ? bindings : null;
}

function resolveDirectDelegateCall(node) {
  if (
    !node.body ||
    !ts.isBlock(node.body) ||
    node.body.statements.length !== 1 ||
    !hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
    hasModifier(node, ts.SyntaxKind.AsyncKeyword) ||
    node.asteriskToken
  ) {
    return null;
  }
  const statement = node.body.statements[0];
  if (!ts.isReturnStatement(statement) || !statement.expression) return null;
  const call = ts.isCallExpression(statement.expression) ? statement.expression : null;
  if (!call || call.questionDotToken || !ts.isIdentifier(call.expression)) return null;
  return call;
}

function collectPlainParameterIndexes(parameters) {
  const indexes = new Map();
  for (const [index, parameter] of parameters.entries()) {
    if (
      !ts.isIdentifier(parameter.name) ||
      parameter.dotDotDotToken ||
      parameter.initializer ||
      parameter.questionToken
    ) {
      return null;
    }
    indexes.set(parameter.name.text, index);
  }
  return indexes;
}

function hasOrderedParameterArguments(argumentsList, parameterIndexes) {
  let previousIndex = -1;
  for (const argument of argumentsList) {
    if (!ts.isIdentifier(argument)) return false;
    const index = parameterIndexes.get(argument.text);
    if (index === undefined || index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

function collectDirectDelegateSpecifier(node, importBindings) {
  const call = resolveDirectDelegateCall(node);
  if (!call) return null;
  const specifier = importBindings.get(call.expression.text);
  if (!specifier) return null;
  const parameterIndexes = collectPlainParameterIndexes(node.parameters);
  if (!parameterIndexes || !hasOrderedParameterArguments(call.arguments, parameterIndexes)) {
    return null;
  }
  return { binding: call.expression.text, specifier };
}

function collectStrictPassThroughSpecifiers(sourceFile) {
  const importBindings = collectValueImportBindings(sourceFile);
  if (!importBindings) return [];
  const usedBindings = new Set();
  const specifiers = [];
  let functionCount = 0;
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isExportDeclaration(statement) && isTypeOnlyExport(statement)) continue;
    if (!ts.isFunctionDeclaration(statement)) return [];
    const delegate = collectDirectDelegateSpecifier(statement, importBindings);
    if (!delegate) return [];
    functionCount += 1;
    usedBindings.add(delegate.binding);
    specifiers.push(delegate.specifier);
  }
  if (functionCount === 0 || usedBindings.size !== importBindings.size) return [];
  return uniqueSorted(specifiers);
}

function analyzeStrictDeletedAggregate(file, source) {
  const sourceFile = createSourceFile(file, source);
  const forwardingSpecifiers = collectStrictForwardingSpecifiers(sourceFile);
  if (forwardingSpecifiers.length > 0) {
    return { dependencySpecifiers: forwardingSpecifiers, eligible: true };
  }
  const passThroughSpecifiers = collectStrictPassThroughSpecifiers(sourceFile);
  return {
    dependencySpecifiers: passThroughSpecifiers,
    eligible: passThroughSpecifiers.length > 0,
  };
}

function resolveHeadRelativeDependency(file, specifier, readHeadSource) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  const extension = path.posix.extname(base);
  const candidates = CODE_EXTENSIONS.includes(extension)
    ? [base]
    : [
        ...CODE_EXTENSIONS.map((candidateExtension) => `${base}${candidateExtension}`),
        ...CODE_EXTENSIONS.map((candidateExtension) => `${base}/index${candidateExtension}`),
      ];
  return candidates.find((candidate) => readHeadSource(candidate) !== null) ?? null;
}

export function createDeletedAggregateAnalyzer(readHeadSource) {
  const analysisByFile = new Map();
  return function analyzeAggregate(file) {
    if (!analysisByFile.has(file)) {
      const source = readHeadSource(file);
      analysisByFile.set(
        file,
        source === null
          ? { dependencySpecifiers: [], eligible: false }
          : analyzeStrictDeletedAggregate(file, source)
      );
    }
    return analysisByFile.get(file);
  };
}

export function collectDeletedAggregateProviders({
  analyzeAggregate,
  file,
  isDeletedDeadExport = () => false,
  readHeadSource,
  root,
  targets,
}) {
  const active = new Set();
  const providers = new Set();

  function visit(candidate) {
    if (active.has(candidate)) return false;
    const analysis = analyzeAggregate(candidate);
    if (!analysis.eligible) return false;

    active.add(candidate);
    for (const specifier of analysis.dependencySpecifiers) {
      const dependency = resolveHeadRelativeDependency(candidate, specifier, readHeadSource);
      if (dependency === null) return false;
      if (fs.existsSync(path.join(root, dependency))) {
        providers.add(dependency);
      } else {
        if (!targets.has(dependency)) return false;
        if (!visit(dependency) && !isDeletedDeadExport(dependency)) return false;
      }
      if (providers.size > MAX_AGGREGATE_PROVIDERS) return false;
    }
    active.delete(candidate);
    return true;
  }

  return visit(file) && providers.size > 0 ? [...providers].sort() : [];
}
