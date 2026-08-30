import ts from 'typescript';

import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

const ENTRY_HELPER_NAMES = new Set(['isExecutedAsScript', 'runIfExecutedAsScript']);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/u;

function isImportMetaUrl(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'url' &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta'
  );
}

function isProcessProperty(node, propertyName) {
  return (
    ((ts.isPropertyAccessExpression(node) && node.name.text === propertyName) ||
      (ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === propertyName)) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

function isRequireMain(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.name.text === 'main'
  );
}

function containsNode(root, predicate, { skipFunctions = false } = {}) {
  let found = false;
  function visit(node) {
    if (found || (skipFunctions && ts.isFunctionLike(node))) return;
    if (predicate(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function collectImportedEntryHelpers(sourceFile) {
  const helpers = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (ENTRY_HELPER_NAMES.has(importedName)) {
        helpers.set(element.name.text, importedName);
      }
    }
  }
  return helpers;
}

function collectTopLevelAliases(sourceFile) {
  const aliases = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      aliases.set(declaration.name.text, declaration.initializer);
    }
  }
  return aliases;
}

function containsWithAliases(node, predicate, aliases, visited = new Set()) {
  if (containsNode(node, predicate, { skipFunctions: true })) return true;
  let found = false;
  function visit(current) {
    if (found || ts.isFunctionLike(current)) return;
    if (ts.isIdentifier(current) && aliases.has(current.text) && !visited.has(current.text)) {
      const nextVisited = new Set(visited).add(current.text);
      if (containsWithAliases(aliases.get(current.text), predicate, aliases, nextVisited)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function isEqualityOperator(kind) {
  return (
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
  );
}

function classifyDirectGuard(statement, helpers, aliases) {
  if (
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    helpers.get(statement.expression.expression.text) === 'runIfExecutedAsScript' &&
    statement.expression.arguments.some(isImportMetaUrl)
  ) {
    return 'entry-helper-call';
  }
  if (!ts.isIfStatement(statement)) return null;

  if (
    containsNode(
      statement.expression,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        helpers.has(node.expression.text) &&
        node.arguments.some(isImportMetaUrl),
      { skipFunctions: true }
    )
  ) {
    return 'entry-helper-call';
  }

  let guardKind = null;
  function visit(node) {
    if (guardKind || ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && isEqualityOperator(node.operatorToken.kind)) {
      const leftHasImportMeta = containsWithAliases(node.left, isImportMetaUrl, aliases);
      const rightHasImportMeta = containsWithAliases(node.right, isImportMetaUrl, aliases);
      const leftHasArgv = containsWithAliases(
        node.left,
        (candidate) => isProcessProperty(candidate, 'argv'),
        aliases
      );
      const rightHasArgv = containsWithAliases(
        node.right,
        (candidate) => isProcessProperty(candidate, 'argv'),
        aliases
      );
      if ((leftHasImportMeta && rightHasArgv) || (rightHasImportMeta && leftHasArgv)) {
        guardKind = 'import-meta-argv-guard';
        return;
      }

      const leftHasRequireMain = containsWithAliases(node.left, isRequireMain, aliases);
      const rightHasRequireMain = containsWithAliases(node.right, isRequireMain, aliases);
      const leftHasModule = containsWithAliases(
        node.left,
        (candidate) => ts.isIdentifier(candidate) && candidate.text === 'module',
        aliases
      );
      const rightHasModule = containsWithAliases(
        node.right,
        (candidate) => ts.isIdentifier(candidate) && candidate.text === 'module',
        aliases
      );
      if ((leftHasRequireMain && rightHasModule) || (rightHasRequireMain && leftHasModule)) {
        guardKind = 'commonjs-main-guard';
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(statement.expression);
  return guardKind;
}

function collectEagerKinds(statement, aliases) {
  const kinds = new Set();
  function visit(node) {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier)) {
      kinds.add('top-level-await');
    }
    if (isProcessProperty(node, 'stdout')) kinds.add('process-stdout');
    if (isProcessProperty(node, 'stderr')) kinds.add('process-stderr');
    if (isProcessProperty(node, 'exit')) kinds.add('process-exit');
    ts.forEachChild(node, visit);
  }
  visit(statement);
  if (
    !ts.isVariableStatement(statement) &&
    containsWithAliases(statement, (node) => isProcessProperty(node, 'argv'), aliases)
  ) {
    kinds.add('process-argv');
  }
  return [...kinds].sort();
}

function createEvidence(sourceFile, statement, kind) {
  const location = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
  return Object.freeze({
    column: location.character + 1,
    kind,
    line: location.line + 1,
  });
}

function createAnalysis({ classification, evidence, malformed = false }) {
  const executable = classification !== 'silent' && classification !== 'ignored-test';
  return Object.freeze({
    classification,
    evidence: Object.freeze(evidence),
    executable,
    importSafe:
      classification === 'silent' ||
      classification === 'guarded' ||
      classification === 'ignored-test',
    malformed,
  });
}

/**
 * Classifies source invocation semantics without executing or text-matching it.
 * Malformed source is executable and import-unsafe so registration cannot fail open.
 */
export function analyzeExecutableEntrypoint(
  source,
  fileName = 'fixture.mjs',
  { sourceFile: suppliedSourceFile } = {}
) {
  const sourceFile =
    suppliedSourceFile ?? getSourceSnapshot({ filePath: fileName, text: source }).sourceFile;
  if (sourceFile.parseDiagnostics.length > 0) {
    return createAnalysis({
      classification: 'malformed',
      evidence: sourceFile.parseDiagnostics.map((diagnostic) => {
        const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        return Object.freeze({
          code: diagnostic.code,
          column: location.character + 1,
          kind: 'parse-diagnostic',
          line: location.line + 1,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        });
      }),
      malformed: true,
    });
  }

  if (TEST_FILE_PATTERN.test(fileName)) {
    return createAnalysis({ classification: 'ignored-test', evidence: [] });
  }

  const helpers = collectImportedEntryHelpers(sourceFile);
  const aliases = collectTopLevelAliases(sourceFile);
  const guardedEvidence = [];
  const eagerEvidence = [];
  for (const statement of sourceFile.statements) {
    const guardKind = classifyDirectGuard(statement, helpers, aliases);
    if (guardKind) {
      guardedEvidence.push(createEvidence(sourceFile, statement, guardKind));
      continue;
    }
    for (const kind of collectEagerKinds(statement, aliases)) {
      eagerEvidence.push(createEvidence(sourceFile, statement, kind));
    }
  }

  const hasGuard = guardedEvidence.length > 0;
  const hasEagerExecution = eagerEvidence.length > 0;
  const classification = hasGuard
    ? hasEagerExecution
      ? 'mixed'
      : 'guarded'
    : hasEagerExecution
      ? 'eager'
      : 'silent';
  return createAnalysis({
    classification,
    evidence: [...guardedEvidence, ...eagerEvidence],
  });
}

export function hasExecutableEntryPoint(source, fileName = 'fixture.mjs', options) {
  return analyzeExecutableEntrypoint(source, fileName, options).executable;
}
