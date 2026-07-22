import {
  collectFunctionNodes,
  createNormalizedNodeHashes,
  getCallName,
  getNodeEndLine,
  getNodeLine,
  ts,
} from './ast.mjs';
import {
  classifyArchitecturalLayer,
  classifyEffectFamily,
  classifyImportedOwner,
  classifyOwnerGroup,
  isEntrypointOwner,
  isRegisteredOrchestrationOwner,
} from './owner-classifier.mjs';
import { isGeneratedDataFile, TEST_FILE_PATTERN } from './config.mjs';

const RECOVERY_PATTERN =
  /\b(?:rollback|recover|restore|cleanup|compensat|abort|release|finally)\b/iu;
const STATE_PATTERN =
  /\b(?:setState|set[A-Z][\w$]*|update[A-Z][\w$]*|dispatch|mutate|commit|store\.(?:setState|set)|\.current\s*=)\b/u;
const ALGORITHM_PATTERN =
  /(?:^|\/)(?:parser|parsers|algorithm|algorithms|reducer|reducers)(?:\/|\.)/u;
const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);
const LOGICAL_OPERATOR_KINDS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function createImportOwnerMap(sourceFile, relativePath) {
  const owners = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const owner = classifyImportedOwner(relativePath, statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) owners.set(clause.name.text, owner);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) owners.set(bindings.name.text, owner);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) owners.set(element.name.text, owner);
    }
  }
  return owners;
}

function rootIdentifier(callName) {
  return callName?.match(/^[A-Za-z_$][\w$]*/u)?.[0] ?? null;
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

function isLogicalExpression(node) {
  return ts.isBinaryExpression(node) && LOGICAL_OPERATOR_KINDS.has(node.operatorToken.kind);
}

function unwrapAssignmentExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    current.kind === ts.SyntaxKind.SatisfiesExpression
  ) {
    current = current.expression;
  }
  return current;
}

function assignedReceiver(node) {
  const target = unwrapAssignmentExpression(node);
  if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) {
    return null;
  }

  let receiver = unwrapAssignmentExpression(target.expression);
  if (
    ts.isPropertyAccessExpression(receiver) &&
    (receiver.name.text === 'style' || receiver.name.text === 'dataset')
  ) {
    receiver = unwrapAssignmentExpression(receiver.expression);
  }
  return receiver;
}

function stateAssignmentAuthority(node, sourceFile) {
  if (!ts.isBinaryExpression(node)) return null;
  const kind = node.operatorToken.kind;
  if (kind < ts.SyntaxKind.FirstAssignment || kind > ts.SyntaxKind.LastAssignment) return null;
  return assignedReceiver(node.left)?.getText(sourceFile) ?? null;
}

function hasRecoveryBoundary(node) {
  if (ts.isCatchClause(node)) return true;
  return ts.isTryStatement(node) && node.finallyBlock != null;
}

function collectCallSignals(current, sourceFile, importOwners, relativePath, signals) {
  const callName = getCallName(current, sourceFile);
  if (!callName) return;
  const effect = classifyEffectFamily(current.getText(sourceFile));
  if (effect) signals.effects.add(effect);
  if (STATE_PATTERN.test(callName)) signals.stateAuthorities.add(callName);
  if (RECOVERY_PATTERN.test(callName)) signals.recoveryPressure += 1;
  const importedOwner = importOwners.get(rootIdentifier(callName));
  signals.ownerCalls.push(
    importedOwner ?? (effect ? `effect:${effect}` : classifyOwnerGroup(relativePath))
  );
}

function collectControlMetrics(node, sourceFile, importOwners, relativePath) {
  let statements = 0;
  let cyclomatic = 1;
  let cognitive = 0;
  let maxNesting = 0;
  const signals = {
    recoveryPressure: 0,
    stateAuthorities: new Set(),
    effects: new Set(),
    ownerCalls: [],
  };

  function visit(current, nesting = 0) {
    if (current !== node && isFunctionNode(current)) return;
    if (ts.isStatement(current) && !ts.isBlock(current)) statements += 1;

    const isBranch = BRANCH_KINDS.has(current.kind);
    if (isBranch) {
      cyclomatic += 1;
      cognitive += 1 + nesting;
      maxNesting = Math.max(maxNesting, nesting + 1);
    }
    if (isLogicalExpression(current)) {
      cyclomatic += 1;
      cognitive += 1;
    }

    if (hasRecoveryBoundary(current)) signals.recoveryPressure += 1;
    const stateAuthority = stateAssignmentAuthority(current, sourceFile);
    if (stateAuthority) signals.stateAuthorities.add(stateAuthority);
    collectCallSignals(current, sourceFile, importOwners, relativePath, signals);

    const nextNesting = isBranch ? nesting + 1 : nesting;
    ts.forEachChild(current, (child) => visit(child, nextNesting));
  }
  visit(node.body ?? node);

  const counts = new Map();
  for (const owner of signals.ownerCalls) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  const dominantCalls = Math.max(0, ...counts.values());
  const cohesion = signals.ownerCalls.length === 0 ? 1 : dominantCalls / signals.ownerCalls.length;

  return {
    statements,
    cyclomatic,
    cognitive,
    nesting: maxNesting,
    recoveryPressure: signals.recoveryPressure,
    effectFamilies: [...signals.effects].sort(),
    stateAuthorities: signals.stateAuthorities.size,
    stateAuthorityNames: [...signals.stateAuthorities].sort(),
    ownerGroups: [...counts.keys()].sort(),
    classifiedCallCount: signals.ownerCalls.length,
    cohesion,
  };
}

function containsJsx(node) {
  let found = false;
  function visit(current) {
    if (
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function chooseProfile(relativePath, symbol, node, metrics) {
  if (TEST_FILE_PATTERN.test(relativePath)) return 'test';
  if (isGeneratedDataFile(relativePath)) return 'generated-data';
  if (isEntrypointOwner(relativePath)) return 'entrypoint';
  if (
    /^(?:use[A-Z]|[A-Z])/u.test(symbol) &&
    (containsJsx(node) || /(?:Component|Hook)$/u.test(symbol))
  ) {
    return 'react';
  }
  if (
    ALGORITHM_PATTERN.test(relativePath) &&
    metrics.effectFamilies.length === 0 &&
    metrics.stateAuthorities === 0
  ) {
    return 'pure';
  }
  const layer = classifyArchitecturalLayer(relativePath);
  if (layer === 'adapter') return 'adapter';
  if (isRegisteredOrchestrationOwner(relativePath)) return 'orchestration';
  return 'default';
}

export function collectFunctionMetrics(sourceFile, relativePath) {
  const importOwners = createImportOwnerMap(sourceFile, relativePath);
  return collectFunctionNodes(sourceFile).map(({ node, symbol }) => {
    const line = getNodeLine(sourceFile, node);
    const endLine = getNodeEndLine(sourceFile, node);
    const controls = collectControlMetrics(node, sourceFile, importOwners, relativePath);
    const profile = chooseProfile(relativePath, symbol, node, controls);
    return {
      file: relativePath,
      line,
      endLine,
      symbol,
      profile,
      lines: endLine - line + 1,
      params: node.parameters?.length ?? 0,
      effectCount: controls.effectFamilies.length,
      ownerGroupCount: controls.ownerGroups.length,
      architecturalLayer: classifyArchitecturalLayer(relativePath),
      ...controls,
      ...createNormalizedNodeHashes(node, sourceFile, symbol),
    };
  });
}

export function collectTopLevelEffectClusters(sourceFile, relativePath) {
  const clusters = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    )
      continue;
    const effects = new Set();
    const stateAuthorities = new Set();
    function visit(node) {
      const callName = getCallName(node, sourceFile);
      if (callName) {
        const effect = classifyEffectFamily(node.getText(sourceFile));
        if (effect) effects.add(effect);
        if (STATE_PATTERN.test(callName)) stateAuthorities.add(callName);
      }
      const stateAuthority = stateAssignmentAuthority(node, sourceFile);
      if (stateAuthority) stateAuthorities.add(stateAuthority);
      ts.forEachChild(node, visit);
    }
    visit(statement);
    const effectFamilies = [...effects].sort();
    if (effectFamilies.length > 0 || stateAuthorities.size > 0) {
      clusters.push({
        file: relativePath,
        line: getNodeLine(sourceFile, statement),
        symbol: '<top-level>',
        architecturalLayer: classifyArchitecturalLayer(relativePath),
        effectFamilies,
        effectCount: effectFamilies.length,
        stateAuthorities: stateAuthorities.size,
        stateAuthorityNames: [...stateAuthorities].sort(),
        cohesion: 1,
      });
    }
  }
  return clusters;
}
