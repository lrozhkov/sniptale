import ts from 'typescript';

const ENTRY_HELPER_NAMES = new Set(['isExecutedAsScript', 'runIfExecutedAsScript']);

function isImportMetaUrl(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'url' &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta'
  );
}

function isProcessArgv(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'argv'
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

function isCommonJsModule(node) {
  return ts.isIdentifier(node) && node.text === 'module';
}

function containsNode(root, predicate) {
  let found = false;
  function visit(node) {
    if (found) return;
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
  const helpers = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (ENTRY_HELPER_NAMES.has(importedName)) helpers.add(element.name.text);
    }
  }
  return helpers;
}

function containsImportedHelperCall(statement, helperNames) {
  let found = false;
  function visit(node) {
    if (found || ts.isFunctionLike(node)) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      helperNames.has(node.expression.text) &&
      node.arguments.length > 0 &&
      isImportMetaUrl(node.arguments[0])
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(statement);
  return found;
}

function isDirectEntryGuard(statement) {
  return (
    ts.isIfStatement(statement) &&
    ((containsNode(statement.expression, isImportMetaUrl) &&
      containsNode(statement.expression, isProcessArgv)) ||
      (containsNode(statement.expression, isRequireMain) &&
        containsNode(statement.expression, isCommonJsModule)))
  );
}

export function hasExecutableEntryPoint(source, fileName = 'fixture.mjs') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  if (sourceFile.parseDiagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(
      sourceFile.parseDiagnostics[0].messageText,
      '\n'
    );
    throw new SyntaxError(`Cannot discover executable entrypoint in ${fileName}: ${message}`);
  }
  const helperNames = collectImportedEntryHelpers(sourceFile);
  return sourceFile.statements.some(
    (statement) =>
      isDirectEntryGuard(statement) || containsImportedHelperCall(statement, helperNames)
  );
}
