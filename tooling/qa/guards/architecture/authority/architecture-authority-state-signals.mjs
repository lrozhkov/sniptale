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

function isImmutableDeclarationData(declaration, statement) {
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
  return false;
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
        !isImmutableDeclarationData(declaration, statement)
      ) {
        reasons.add('mutation-queue-name');
      }
    }
  }
  return [...reasons];
}
