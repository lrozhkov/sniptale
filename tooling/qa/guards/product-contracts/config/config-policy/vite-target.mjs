import ts from 'typescript';

import { getSourceSnapshot } from '../../../../analysis/source/source-snapshot.mjs';

const VITE_CONFIG_PATH = 'apps/extension/vite.config.ts';
const TARGET_OWNER = 'CHROME_BUILD_TARGET';
const TARGET_OWNER_MODULE = './build/manifest.ts';

function getPropertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function isManifestDerivedTarget(expression) {
  const unwrapped = unwrapExpression(expression);
  return ts.isIdentifier(unwrapped) && unwrapped.text === TARGET_OWNER;
}

function sourceHasRequiredImports(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text === TARGET_OWNER_MODULE) {
      return (
        statement.importClause?.namedBindings?.elements.some(
          (element) => element.name.text === TARGET_OWNER
        ) ?? false
      );
    }
  }
  return false;
}

function bindingNameContainsTargetOwner(name) {
  if (ts.isIdentifier(name)) return name.text === TARGET_OWNER;
  return name.elements.some(
    (element) => ts.isBindingElement(element) && bindingNameContainsTargetOwner(element.name)
  );
}

function sourceShadowsTargetOwner(sourceFile) {
  let shadows = false;
  function visit(node) {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      bindingNameContainsTargetOwner(node.name)
    ) {
      shadows = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name?.text === TARGET_OWNER
    ) {
      shadows = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);
  return shadows;
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
      initializer.properties.some(
        (buildProperty) =>
          ts.isPropertyAssignment(buildProperty) &&
          getPropertyNameText(buildProperty.name) === 'target' &&
          isManifestDerivedTarget(buildProperty.initializer)
      )
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
  const sourceFile = getSourceSnapshot({
    filePath: VITE_CONFIG_PATH,
    text: viteConfigSource,
  }).sourceFile;
  return (
    sourceHasRequiredImports(sourceFile) &&
    !sourceShadowsTargetOwner(sourceFile) &&
    sourceFile.statements.some(
      (statement) =>
        ts.isExportAssignment(statement) &&
        !statement.isExportEquals &&
        configExpressionHasRequiredBuildTarget(statement.expression)
    )
  );
}
