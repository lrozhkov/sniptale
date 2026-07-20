import ts from 'typescript';

const VITE_CONFIG_PATH = 'apps/extension/vite.config.ts';
const REQUIRED_BUILD_TARGET = 'chrome140';

function getPropertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function objectLiteralHasStringProperty(objectLiteral, propertyName, expectedValue) {
  return objectLiteral.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      getPropertyNameText(property.name) === propertyName &&
      ts.isStringLiteralLike(property.initializer) &&
      property.initializer.text === expectedValue
  );
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function isDefineConfigCall(expression) {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'defineConfig'
  );
}

function objectLiteralHasRequiredBuildTarget(objectLiteral) {
  return objectLiteral.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) || getPropertyNameText(property.name) !== 'build') {
      return false;
    }

    const initializer = unwrapExpression(property.initializer);
    return (
      ts.isObjectLiteralExpression(initializer) &&
      objectLiteralHasStringProperty(initializer, 'target', REQUIRED_BUILD_TARGET)
    );
  });
}

function collectReturnedObjectLiterals(functionExpression) {
  const body = functionExpression.body;
  const unwrappedBody = unwrapExpression(body);
  if (ts.isObjectLiteralExpression(unwrappedBody)) {
    return [unwrappedBody];
  }

  if (!ts.isBlock(body)) {
    return [];
  }

  return body.statements.flatMap((statement) => {
    if (!ts.isReturnStatement(statement) || !statement.expression) {
      return [];
    }

    const expression = unwrapExpression(statement.expression);
    return ts.isObjectLiteralExpression(expression) ? [expression] : [];
  });
}

function configExpressionHasRequiredBuildTarget(expression) {
  const unwrappedExpression = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return objectLiteralHasRequiredBuildTarget(unwrappedExpression);
  }

  if (!isDefineConfigCall(unwrappedExpression)) {
    return false;
  }

  const configArgument = unwrappedExpression.arguments[0];
  if (!configArgument) {
    return false;
  }

  const unwrappedConfigArgument = unwrapExpression(configArgument);
  if (ts.isObjectLiteralExpression(unwrappedConfigArgument)) {
    return objectLiteralHasRequiredBuildTarget(unwrappedConfigArgument);
  }

  if (
    ts.isArrowFunction(unwrappedConfigArgument) ||
    ts.isFunctionExpression(unwrappedConfigArgument)
  ) {
    return collectReturnedObjectLiterals(unwrappedConfigArgument).some((objectLiteral) =>
      objectLiteralHasRequiredBuildTarget(objectLiteral)
    );
  }

  return false;
}

export function hasRequiredViteBuildTarget(viteConfigSource) {
  const sourceFile = ts.createSourceFile(
    VITE_CONFIG_PATH,
    viteConfigSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  return sourceFile.statements.some(
    (statement) =>
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      configExpressionHasRequiredBuildTarget(statement.expression)
  );
}
