import { ts } from './structural-risk/ast.mjs';

const INVALID_VALUE = Symbol('invalid-declarative-inventory-value');

function unwrapInventoryExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return ts.isNumericLiteral(property.name) ? property.name.text : null;
}

function parseStaticObject(expression) {
  const value = Object.create(null);
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return INVALID_VALUE;
    }
    const name = propertyName(property);
    const propertyValue = parseStaticInventoryExpression(property.initializer);
    if (name == null || name in value || propertyValue === INVALID_VALUE) {
      return INVALID_VALUE;
    }
    value[name] = propertyValue;
  }
  return value;
}

function parseStaticPrimitive(expression) {
  const current = expression;
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return current.text;
  }
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (current.kind === ts.SyntaxKind.NullKeyword) return null;
  return INVALID_VALUE;
}

function parseStaticArray(expression) {
  const values = [];
  for (const element of expression.elements) {
    const value = ts.isSpreadElement(element)
      ? INVALID_VALUE
      : parseStaticInventoryExpression(element);
    if (value === INVALID_VALUE) return INVALID_VALUE;
    values.push(value);
  }
  return values;
}

function parseStaticInventoryExpression(expression) {
  const current = unwrapInventoryExpression(expression);
  const primitive = parseStaticPrimitive(current);
  if (primitive !== INVALID_VALUE) return primitive;
  if (ts.isArrayLiteralExpression(current)) return parseStaticArray(current);
  return ts.isObjectLiteralExpression(current) ? parseStaticObject(current) : INVALID_VALUE;
}

function isExportedConstStatement(statement) {
  const modifiers = statement.modifiers ?? [];
  return (
    ts.isVariableStatement(statement) &&
    modifiers.length === 1 &&
    modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
  );
}

function parseDeclarativeConstArrayStatement(statement, exportName) {
  if (!isExportedConstStatement(statement) || statement.declarationList.declarations.length !== 1) {
    return null;
  }
  const [declaration] = statement.declarationList.declarations;
  if (
    !ts.isIdentifier(declaration.name) ||
    (exportName != null && declaration.name.text !== exportName) ||
    declaration.initializer == null ||
    !ts.isArrayLiteralExpression(unwrapInventoryExpression(declaration.initializer))
  ) {
    return null;
  }
  const value = parseStaticInventoryExpression(declaration.initializer);
  return value === INVALID_VALUE ? null : { exportName: declaration.name.text, value };
}

export function parseNamedDeclarativeConstArray(sourceFile, exportName) {
  if (sourceFile.parseDiagnostics.length > 0) return null;
  const matches = sourceFile.statements
    .map((statement) => parseDeclarativeConstArrayStatement(statement, exportName))
    .filter((value) => value != null);
  return matches.length === 1 ? matches[0] : null;
}

export function parseDeclarativeConstArrayModule(sourceFile, { exportName = null } = {}) {
  if (sourceFile.parseDiagnostics.length > 0 || sourceFile.statements.length !== 1) {
    return null;
  }
  return parseDeclarativeConstArrayStatement(sourceFile.statements[0], exportName);
}
