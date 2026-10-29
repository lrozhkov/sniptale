import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const CAPABILITY_FILE_PATTERN = /capabilit/iu;
const MUTATION_QUEUE_NAME_PATTERN = /(?:queue|pending|buffer|jobs|requests)/iu;
const MUTABLE_COLLECTION_NAMES = new Set(['Map', 'Set']);

export function readArchitectureFileText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

export function architectureFileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

export function isCapabilityStatePath(file) {
  return CAPABILITY_FILE_PATTERN.test(file);
}

export function hasResetForTestsSignal(text) {
  return /\breset[A-Za-z0-9]*ForTests\b/u.test(text);
}

export function hasPrivilegedMemoryDomainSignal(text) {
  return /\bcreatePrivilegedSyncMemoryDomain\b/u.test(text);
}

function isTopLevelMapOrSet(declaration) {
  return (
    declaration.initializer &&
    ts.isNewExpression(declaration.initializer) &&
    ts.isIdentifier(declaration.initializer.expression) &&
    MUTABLE_COLLECTION_NAMES.has(declaration.initializer.expression.text)
  );
}

function isLiteralData(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return true;
  if (
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      node.kind
    )
  )
    return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isLiteralData);
  return (
    ts.isObjectLiteralExpression(node) &&
    node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        !ts.isComputedPropertyName(property.name) &&
        isLiteralData(property.initializer)
    )
  );
}

function isImmutableDeclarationData(declaration, statement, sourceFile) {
  if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer)
    return false;
  const type = declaration.type;
  if (
    type &&
    ts.isTypeOperatorNode(type) &&
    type.operator === ts.SyntaxKind.ReadonlyKeyword &&
    (ts.isArrayTypeNode(type.type) || ts.isTupleTypeNode(type.type)) &&
    ts.isArrayLiteralExpression(declaration.initializer) &&
    declaration.initializer.elements.every(
      (element) =>
        ts.isStringLiteral(element) ||
        ts.isNumericLiteral(element) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
          element.kind
        )
    )
  )
    return true;
  const call = declaration.initializer;
  if (
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(call.arguments[0]) ||
    !isLiteralData(call.arguments[0])
  )
    return false;
  return sourceFile.statements.some((item) => {
    if (
      !ts.isImportDeclaration(item) ||
      !ts.isStringLiteral(item.moduleSpecifier) ||
      item.importClause?.isTypeOnly
    )
      return false;
    const sourcePath = path.posix.normalize(sourceFile.fileName.replaceAll('\\', '/'));
    const appRoot = 'apps/extension/src/';
    const relativeApp = sourcePath.startsWith(appRoot);
    const appIndex = relativeApp ? 0 : sourcePath.indexOf(`/${appRoot}`);
    if (appIndex < 0) return false;
    const rootPrefix = relativeApp ? '' : sourcePath.slice(0, appIndex + 1);
    const expected = `${rootPrefix}apps/extension/src/platform/i18n/messages/source`;
    const resolved = path.posix
      .normalize(path.posix.join(path.posix.dirname(sourcePath), item.moduleSpecifier.text))
      .replace(/\.ts$/u, '');
    if (resolved !== expected) return false;
    const bindings = item.importClause?.namedBindings;
    return (
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (binding) =>
          !binding.isTypeOnly &&
          binding.name.text === call.expression.text &&
          (binding.propertyName?.text ?? binding.name.text) === 'defineMessageSource'
      )
    );
  });
}

export function collectTopLevelAuthorityStateReasons(sourceFile) {
  const reasons = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (isTopLevelMapOrSet(declaration)) reasons.add('top-level-map-or-set');
      if (
        ts.isIdentifier(declaration.name) &&
        MUTATION_QUEUE_NAME_PATTERN.test(declaration.name.text) &&
        !isImmutableDeclarationData(declaration, statement, sourceFile)
      ) {
        reasons.add('mutation-queue-name');
      }
    }
  }
  return [...reasons];
}
