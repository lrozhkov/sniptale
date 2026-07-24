import {
  collectFunctionNodes,
  createLexicalBindingKey,
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
} from './owner-classifier.mjs';
import {
  createFunctionProfileClassifier,
  getDeclarativeTestFixtureRoot,
} from './function-profile.mjs';
import { createFunctionLineageHasher } from './lineage.mjs';

const RECOVERY_PATTERN =
  /\b(?:rollback|recover|restore|cleanup|compensat|abort|release|finally)\b/iu;
const STATE_PATTERN =
  /\b(?:setState|set[A-Z][\w$]*|update[A-Z][\w$]*|dispatch|mutate|commit|store\.(?:setState|set)|\.current\s*=)\b/u;
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

function stateReceiverRoot(node) {
  let current = unwrapAssignmentExpression(node);
  const properties = [];
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) properties.unshift(current.name.text);
    current = unwrapAssignmentExpression(current.expression);
  }
  return { root: current, properties };
}

function stateReceiverKey(node, sourceFile) {
  const { root, properties } = stateReceiverRoot(node);
  const suffix = properties.length > 0 ? `.${properties[0]}` : '';
  return createLexicalBindingKey(root, sourceFile, suffix);
}

function stateReceiverIdentity(node, sourceFile) {
  const { root: current, properties } = stateReceiverRoot(node);
  if (ts.isCallExpression(current) || ts.isNewExpression(current)) return null;
  if (current.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (!ts.isIdentifier(current)) return current.getText(sourceFile);
  if (['args', 'options', 'props'].includes(current.text) && properties.length > 0) {
    return `${current.text}.${properties[0]}`;
  }
  return current.text;
}

function stateCallReceiver(node, sourceFile, callName) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return null;
  const expression = unwrapAssignmentExpression(node.expression);
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return null;
  }
  const receiver = stateReceiverIdentity(expression.expression, sourceFile);
  if (receiver === 'props' || receiver === 'args' || receiver === 'options') return callName;
  return receiver;
}

function stateAssignmentAuthority(node, sourceFile) {
  if (!ts.isBinaryExpression(node)) return null;
  const kind = node.operatorToken.kind;
  if (kind < ts.SyntaxKind.FirstAssignment || kind > ts.SyntaxKind.LastAssignment) return null;
  return assignedReceiver(node.left)?.getText(sourceFile) ?? null;
}

function hasDynamicCallReceiver(node) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  const expression = unwrapAssignmentExpression(node.expression);
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return false;
  }
  const receiver = unwrapAssignmentExpression(expression.expression);
  return ts.isCallExpression(receiver) || ts.isNewExpression(receiver);
}

function recordStateCall(node, sourceFile, callName, signals) {
  if (!STATE_PATTERN.test(callName) || hasDynamicCallReceiver(node)) return;
  signals.stateAuthorities.add(callName);
  const receiver = stateCallReceiver(node, sourceFile, callName);
  if (receiver) {
    const expression = unwrapAssignmentExpression(node.expression);
    const receiverNode = receiver === callName ? expression : expression.expression;
    signals.stateReceivers.add(receiver);
    signals.stateReceiverKeys.add(stateReceiverKey(receiverNode, sourceFile));
  } else {
    signals.unresolvedStateAuthorities.add(callName);
    signals.unresolvedStateAuthorityKeys.add(stateReceiverKey(node.expression, sourceFile));
  }
}

function recordStateAssignment(node, sourceFile, signals) {
  const authority = stateAssignmentAuthority(node, sourceFile);
  if (!authority) return;
  signals.stateAuthorities.add(authority);
  const receiver = assignedReceiver(node.left);
  const identity = receiver && stateReceiverIdentity(receiver, sourceFile);
  if (identity) {
    signals.stateReceivers.add(identity);
    signals.stateReceiverKeys.add(stateReceiverKey(receiver, sourceFile));
  } else {
    signals.unresolvedStateAuthorities.add(authority);
    signals.unresolvedStateAuthorityKeys.add(`${authority}@dynamic`);
  }
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
  recordStateCall(current, sourceFile, callName, signals);
  if (RECOVERY_PATTERN.test(callName)) signals.recoveryPressure += 1;
  const importedOwner = importOwners.get(rootIdentifier(callName));
  signals.ownerCalls.push(
    importedOwner ?? (effect ? `effect:${effect}` : classifyOwnerGroup(relativePath))
  );
}

function collectControlMetrics(
  node,
  sourceFile,
  importOwners,
  relativePath,
  { declarativeFixtureRoot = null } = {}
) {
  let statements = 0;
  let cyclomatic = 1;
  let cognitive = 0;
  let maxNesting = 0;
  const signals = {
    recoveryPressure: 0,
    stateAuthorities: new Set(),
    stateReceivers: new Set(),
    stateReceiverKeys: new Set(),
    unresolvedStateAuthorities: new Set(),
    unresolvedStateAuthorityKeys: new Set(),
    effects: new Set(),
    ownerCalls: [],
  };

  function visit(current, nesting = 0, insideDeclarativeFixture = false) {
    if (current !== node && isFunctionNode(current)) return;
    if (ts.isStatement(current) && !ts.isBlock(current)) statements += 1;

    const isBranch = BRANCH_KINDS.has(current.kind);
    if (isBranch) {
      cyclomatic += 1;
      cognitive += 1 + nesting;
      maxNesting = Math.max(maxNesting, nesting + 1);
    }
    const isDeclarativeNullishFallback =
      insideDeclarativeFixture &&
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken;
    if (isLogicalExpression(current) && !isDeclarativeNullishFallback) {
      cyclomatic += 1;
      cognitive += 1;
    }

    if (hasRecoveryBoundary(current)) signals.recoveryPressure += 1;
    recordStateAssignment(current, sourceFile, signals);
    collectCallSignals(current, sourceFile, importOwners, relativePath, signals);

    const nextNesting = isBranch ? nesting + 1 : nesting;
    const nextInsideDeclarativeFixture =
      insideDeclarativeFixture || current === declarativeFixtureRoot;
    ts.forEachChild(current, (child) => visit(child, nextNesting, nextInsideDeclarativeFixture));
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
    stateAuthorities: signals.stateReceiverKeys.size + signals.unresolvedStateAuthorityKeys.size,
    stateAuthorityNames: [...signals.stateAuthorities].sort(),
    stateReceiverCount: signals.stateReceivers.size,
    stateReceiverNames: [...signals.stateReceivers].sort(),
    stateReceiverKeys: [...signals.stateReceiverKeys].sort(),
    unresolvedStateAuthorityCount: signals.unresolvedStateAuthorities.size,
    unresolvedStateAuthorityNames: [...signals.unresolvedStateAuthorities].sort(),
    unresolvedStateAuthorityKeys: [...signals.unresolvedStateAuthorityKeys].sort(),
    ownerGroups: [...counts.keys()].sort(),
    classifiedCallCount: signals.ownerCalls.length,
    cohesion,
  };
}

export function collectFunctionMetrics(sourceFile, relativePath) {
  const importOwners = createImportOwnerMap(sourceFile, relativePath);
  const classifyProfile = createFunctionProfileClassifier(sourceFile, relativePath);
  const createLineageHash = createFunctionLineageHasher(sourceFile, relativePath);
  return collectFunctionNodes(sourceFile).map(({ node, symbol }) => {
    const line = getNodeLine(sourceFile, node);
    const endLine = getNodeEndLine(sourceFile, node);
    let controls = collectControlMetrics(node, sourceFile, importOwners, relativePath);
    const profile = classifyProfile(symbol, node, controls);
    if (profile === 'test-fixture') {
      controls = collectControlMetrics(node, sourceFile, importOwners, relativePath, {
        declarativeFixtureRoot: getDeclarativeTestFixtureRoot(relativePath, symbol, node, controls),
      });
    }
    const normalizedHashes = createNormalizedNodeHashes(node, sourceFile, symbol);
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
      ...normalizedHashes,
      lineageHash: createLineageHash(node, normalizedHashes),
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
    const stateSignals = {
      stateAuthorities: new Set(),
      stateReceivers: new Set(),
      stateReceiverKeys: new Set(),
      unresolvedStateAuthorities: new Set(),
      unresolvedStateAuthorityKeys: new Set(),
    };
    function visit(node) {
      const callName = getCallName(node, sourceFile);
      if (callName) {
        const effect = classifyEffectFamily(node.getText(sourceFile));
        if (effect) effects.add(effect);
        recordStateCall(node, sourceFile, callName, stateSignals);
      }
      recordStateAssignment(node, sourceFile, stateSignals);
      ts.forEachChild(node, visit);
    }
    visit(statement);
    const effectFamilies = [...effects].sort();
    if (effectFamilies.length > 0 || stateSignals.stateAuthorities.size > 0) {
      clusters.push({
        file: relativePath,
        line: getNodeLine(sourceFile, statement),
        symbol: '<top-level>',
        architecturalLayer: classifyArchitecturalLayer(relativePath),
        effectFamilies,
        effectCount: effectFamilies.length,
        stateAuthorities:
          stateSignals.stateReceiverKeys.size + stateSignals.unresolvedStateAuthorityKeys.size,
        stateAuthorityNames: [...stateSignals.stateAuthorities].sort(),
        stateReceiverCount: stateSignals.stateReceivers.size,
        stateReceiverNames: [...stateSignals.stateReceivers].sort(),
        stateReceiverKeys: [...stateSignals.stateReceiverKeys].sort(),
        unresolvedStateAuthorityCount: stateSignals.unresolvedStateAuthorities.size,
        unresolvedStateAuthorityNames: [...stateSignals.unresolvedStateAuthorities].sort(),
        unresolvedStateAuthorityKeys: [...stateSignals.unresolvedStateAuthorityKeys].sort(),
        cohesion: 1,
      });
    }
  }
  return clusters;
}
