import path from 'node:path';

import { createLexicalBindingKey, sha256, ts } from './ast.mjs';
import { scoreFunction } from './score.mjs';

const printer = ts.createPrinter({ removeComments: true });
const NON_REFERENCE_NAME_PARENT_KINDS = new Set([
  ts.SyntaxKind.PropertyAccessExpression,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
  ts.SyntaxKind.EnumDeclaration,
]);

function normalizeNode(node, sourceFile) {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/gu, ' ').trim();
}

function collectBindingNames(node, names) {
  if (!node) return;
  if (ts.isIdentifier(node)) {
    names.add(node.text);
    return;
  }
  if (ts.isBindingElement(node)) {
    collectBindingNames(node.name, names);
    return;
  }
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    for (const element of node.elements) collectBindingNames(element, names);
  }
}

function findBindingIdentifier(node, name) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node.text === name ? node : null;
  if (ts.isBindingElement(node)) return findBindingIdentifier(node.name, name);
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    for (const element of node.elements) {
      const identifier = findBindingIdentifier(element, name);
      if (identifier) return identifier;
    }
  }
  return null;
}

function isReferenceIdentifier(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (parent.name === node && NON_REFERENCE_NAME_PARENT_KINDS.has(parent.kind)) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  if (ts.isBreakOrContinueStatement(parent) && parent.label === node) return false;
  return true;
}

function collectReferencedBindings(root, bindings, sourceFile) {
  const referenced = new Set();
  function visit(node) {
    const binding = ts.isIdentifier(node) ? bindings.get(node.text) : null;
    if (
      ts.isIdentifier(node) &&
      binding &&
      createLexicalBindingKey(node, sourceFile) === binding.bindingKey &&
      isReferenceIdentifier(node)
    ) {
      referenced.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return [...referenced].sort();
}

function canonicalModuleProvider(relativePath, moduleSpecifier) {
  return moduleSpecifier.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), moduleSpecifier))
    : moduleSpecifier;
}

function moduleStatementDescriptor(statement, sourceFile, relativePath) {
  const moduleSpecifier = statement.moduleSpecifier;
  if (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    moduleSpecifier &&
    ts.isStringLiteral(moduleSpecifier)
  ) {
    const clause = statement.importClause ?? statement.exportClause;
    return {
      kind: statement.kind,
      clause: clause ? normalizeNode(clause, sourceFile) : '',
      provider: canonicalModuleProvider(relativePath, moduleSpecifier.text),
      typeOnly: Boolean(statement.importClause?.isTypeOnly ?? statement.isTypeOnly),
      attributes: statement.attributes ? normalizeNode(statement.attributes, sourceFile) : '',
    };
  }
  return { kind: statement.kind, source: normalizeNode(statement, sourceFile) };
}

export function createTopLevelLineageHashes(sourceFile, relativePath) {
  return sourceFile.statements
    .map((statement) =>
      sha256(JSON.stringify(moduleStatementDescriptor(statement, sourceFile, relativePath)))
    )
    .sort();
}

export function hasCompleteTopLevelLineage(current, predecessor) {
  const available = new Map();
  for (const hash of current.topLevelLineageHashes) {
    available.set(hash, (available.get(hash) ?? 0) + 1);
  }
  for (const hash of predecessor.topLevelLineageHashes) {
    const count = available.get(hash) ?? 0;
    if (count === 0) return false;
    available.set(hash, count - 1);
  }
  return true;
}

function collectImportBindings(statement, relativePath, bindings) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
  const provider = canonicalModuleProvider(relativePath, statement.moduleSpecifier.text);
  const clause = statement.importClause;
  if (clause?.name) {
    bindings.set(clause.name.text, {
      bindingKey: createLexicalBindingKey(clause.name, statement.getSourceFile()),
      kind: 'import',
      imported: 'default',
      provider,
    });
  }
  const named = clause?.namedBindings;
  if (named && ts.isNamespaceImport(named)) {
    bindings.set(named.name.text, {
      bindingKey: createLexicalBindingKey(named.name, statement.getSourceFile()),
      kind: 'import',
      imported: '*',
      provider,
    });
  }
  if (named && ts.isNamedImports(named)) {
    for (const element of named.elements) {
      bindings.set(element.name.text, {
        bindingKey: createLexicalBindingKey(element.name, statement.getSourceFile()),
        kind: 'import',
        imported: (element.propertyName ?? element.name).text,
        provider,
      });
    }
  }
}

function collectDeclarationBindings(statement, bindings) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      const identifiers = new Set();
      collectBindingNames(declaration.name, identifiers);
      for (const name of identifiers) {
        const declarationIdentifier = findBindingIdentifier(declaration.name, name);
        if (!declarationIdentifier) continue;
        bindings.set(name, {
          bindingKey: createLexicalBindingKey(declarationIdentifier, statement.getSourceFile()),
          kind: 'declaration',
          node: declaration,
        });
      }
    }
    return;
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    bindings.set(statement.name.text, {
      bindingKey: createLexicalBindingKey(statement.name, statement.getSourceFile()),
      kind: 'declaration',
      node: statement,
    });
  }
}

function createTopLevelBindings(sourceFile, relativePath) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    collectImportBindings(statement, relativePath, bindings);
    collectDeclarationBindings(statement, bindings);
  }
  return bindings;
}

function createBindingFingerprinter(sourceFile, bindings) {
  const cache = new Map();
  function fingerprint(name, visiting = new Set()) {
    if (cache.has(name)) return cache.get(name);
    const binding = bindings.get(name);
    if (!binding) return null;
    if (binding.kind === 'import') {
      const value = sha256(
        JSON.stringify({
          kind: binding.kind,
          imported: binding.imported,
          provider: binding.provider,
        })
      );
      cache.set(name, value);
      return value;
    }
    if (visiting.has(name)) return sha256(`cycle:${name}`);
    const nextVisiting = new Set(visiting).add(name);
    const dependencies = collectReferencedBindings(binding.node, bindings, sourceFile)
      .filter((dependency) => dependency !== name)
      .map((dependency) => [dependency, fingerprint(dependency, nextVisiting)]);
    const value = sha256(
      JSON.stringify({ declaration: normalizeNode(binding.node, sourceFile), dependencies })
    );
    cache.set(name, value);
    return value;
  }
  return fingerprint;
}

function semanticFunctionShape(node) {
  const modifiers = (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)
    ?.filter(
      (modifier) =>
        modifier.kind !== ts.SyntaxKind.ExportKeyword &&
        modifier.kind !== ts.SyntaxKind.DefaultKeyword &&
        modifier.kind !== ts.SyntaxKind.DeclareKeyword
    )
    .map((modifier) => modifier.kind)
    .sort((left, right) => left - right);
  return {
    kind: node.kind,
    modifiers: modifiers ?? [],
    generator: Boolean(node.asteriskToken),
  };
}

export function createFunctionLineageHasher(sourceFile, relativePath) {
  const bindings = createTopLevelBindings(sourceFile, relativePath);
  const fingerprintBinding = createBindingFingerprinter(sourceFile, bindings);
  return (node, normalizedHashes) => {
    const dependencies = collectReferencedBindings(node, bindings, sourceFile).map((name) => [
      name,
      fingerprintBinding(name),
    ]);
    return sha256(
      JSON.stringify({
        astHash: normalizedHashes.astHash,
        signatureHash: normalizedHashes.signatureHash,
        semanticShape: semanticFunctionShape(node),
        dependencies,
      })
    );
  };
}

function functionSymbolGroup(symbol) {
  return symbol.replace(/#\d+$/u, '');
}

function groupFunctionsBySymbol(metrics) {
  const groups = new Map();
  for (const metric of metrics) {
    const key = functionSymbolGroup(metric.symbol);
    const group = groups.get(key) ?? [];
    group.push(metric);
    groups.set(key, group);
  }
  return groups;
}

function functionIdentity(metric) {
  return metric.lineageHash;
}

export function createLineagePool(candidates) {
  const pool = new Map();
  for (const candidate of candidates.values()) {
    for (const metric of candidate.functions) {
      const identity = functionIdentity(metric);
      const matches = pool.get(identity) ?? [];
      matches.push({ file: candidate.file, metric, ownerGroup: candidate.ownerGroup });
      pool.set(identity, matches);
    }
  }
  return pool;
}

function profileFamily(profile) {
  if (profile === 'test') return 'test';
  if (profile === 'generated-data') return 'generated-data';
  return 'runtime';
}

function takeLineageMatch(metric, ownerGroup, lineagePool) {
  const matches = lineagePool.get(functionIdentity(metric));
  const matchIndex = matches?.findIndex(
    (match) =>
      match.ownerGroup === ownerGroup &&
      profileFamily(match.metric.profile) === profileFamily(metric.profile)
  );
  return matchIndex == null || matchIndex < 0 ? null : matches.splice(matchIndex, 1)[0];
}

function matchFunctionGroup(currentGroup, previousGroup) {
  const matches = new Map();
  const unmatchedPrevious = new Set(previousGroup);

  for (const currentMetric of currentGroup) {
    const exactMatch = previousGroup.find(
      (previousMetric) =>
        unmatchedPrevious.has(previousMetric) &&
        previousMetric.astHash === currentMetric.astHash &&
        previousMetric.signatureHash === currentMetric.signatureHash
    );
    if (!exactMatch) continue;
    matches.set(currentMetric, { exact: true, metric: exactMatch });
    unmatchedPrevious.delete(exactMatch);
  }

  const remainingCurrent = currentGroup.filter((metric) => !matches.has(metric));
  const remainingPrevious = previousGroup.filter((metric) => unmatchedPrevious.has(metric));
  for (const [index, currentMetric] of remainingCurrent.entries()) {
    const previousMetric = remainingPrevious[index];
    if (previousMetric) matches.set(currentMetric, { exact: false, metric: previousMetric });
  }
  return matches;
}

export function compareStructuralFunctions(current, previous, lineagePool) {
  const currentGroups = groupFunctionsBySymbol(current.functions);
  const previousGroups = groupFunctionsBySymbol(previous?.functions ?? []);
  const previousByMetric = new Map();
  for (const [symbolGroup, currentGroup] of currentGroups) {
    const matches = matchFunctionGroup(currentGroup, previousGroups.get(symbolGroup) ?? []);
    for (const [currentMetric, match] of matches) {
      previousByMetric.set(currentMetric, match);
    }
  }

  const movedSourceCounts = new Map();
  const functions = current.functions.map((metric) => {
    const sameFileMatch = previousByMetric.get(metric);
    const movedMatch = sameFileMatch?.exact
      ? null
      : takeLineageMatch(metric, current.ownerGroup, lineagePool);
    const previousMetric = movedMatch?.metric ?? sameFileMatch?.metric;
    const score = scoreFunction(metric);
    const previousScore = previousMetric
      ? scoreFunction(movedMatch ? { ...previousMetric, profile: metric.profile } : previousMetric)
      : 0;
    if (movedMatch) {
      movedSourceCounts.set(movedMatch.file, (movedSourceCounts.get(movedMatch.file) ?? 0) + 1);
    }
    return {
      ...metric,
      score,
      previousScore,
      delta: score - previousScore,
      deltaKind: movedMatch ? 'move-only' : previousMetric ? 'same-path' : 'new',
      predecessorFile: movedMatch?.file ?? (previousMetric ? current.file : null),
      isNew: previousMetric == null,
      previousLines: previousMetric?.lines ?? 0,
    };
  });
  return { functions, movedSourceCounts };
}
