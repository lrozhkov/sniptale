import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_BOUNDARY_OWNER_PATH_PATTERN =
  /^src\/(?:background|content|editor|offscreen|shared|video-editor|web-snapshot-viewer)\//u;
const EXTENSION_BOUNDARY_OWNER_PATH_PATTERN =
  /^apps\/extension\/src\/(?:camera-recorder|design-system|gallery|popup|settings|web-snapshot-viewer)\//u;
const BOUNDARY_ROLE_PATH_PATTERN =
  /(?:contracts|custom-shapes|db|file-actions|import|llm|parser|runtime|storage|transport)/u;
const POST_VALIDATION_PATH_PATTERN = /(?:parser-normalize|post-validation|validated|unsafe)/u;
const STRICT_COERCION_OWNER_PATTERNS = [
  /^apps\/extension\/src\/editor\/lib\/(?:custom-shapes|file-actions)\//u,
  /^apps\/extension\/src\/features\/video\/project\/effect-bundle\//u,
];
const SAFE_ASSERTION_TYPES = new Set(['unknown', 'const']);

export function createBoundaryCastViolation(rule, file, sourceFile, node, message) {
  return {
    rule,
    file,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    message,
  };
}

export function isBoundaryOwnerPath(relativePath) {
  return (
    (SOURCE_BOUNDARY_OWNER_PATH_PATTERN.test(relativePath) ||
      EXTENSION_BOUNDARY_OWNER_PATH_PATTERN.test(relativePath)) &&
    BOUNDARY_ROLE_PATH_PATTERN.test(relativePath)
  );
}

export function isPostValidationFile(relativePath) {
  return POST_VALIDATION_PATH_PATTERN.test(path.basename(relativePath));
}

export function isStrictCoercionPath(relativePath) {
  return STRICT_COERCION_OWNER_PATTERNS.some((pattern) => pattern.test(relativePath));
}

export function getTypeText(node, sourceFile) {
  return node.type.getText(sourceFile).replace(/\s+/gu, ' ');
}

export function unwrapAssertionExpression(node) {
  let expression = node;
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    expression = ts.isParenthesizedExpression(expression)
      ? expression.expression
      : expression.expression;
  }
  return expression;
}

export function isJsonParseCall(expression) {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.expression.getText() === 'JSON' &&
    expression.expression.name.text === 'parse'
  );
}

export function isReadJsonFileCall(node) {
  if (!ts.isCallExpression(node) || !node.typeArguments?.length) {
    return false;
  }

  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text === 'readJsonFile';
  }
  return ts.isPropertyAccessExpression(expression) && expression.name.text === 'readJsonFile';
}

export function isShapeCoercionAssertion(node, typeText) {
  const originalExpression = unwrapAssertionExpression(node.expression);
  if (SAFE_ASSERTION_TYPES.has(typeText)) {
    return false;
  }
  if (isRecordOrArrayAssertion(typeText)) {
    return true;
  }
  return (
    isPropertyOrElementInput(originalExpression) &&
    (typeText === 'any' || isEnumLikeAssertion(typeText))
  );
}

function isRecordOrArrayAssertion(typeText) {
  return (
    /^Record(?:<|$)/u.test(typeText) ||
    /^Array(?:<|$)/u.test(typeText) ||
    /^\w+\[\]$/u.test(typeText)
  );
}

function isEnumLikeAssertion(typeText) {
  if (/^T[A-Z]/u.test(typeText)) {
    return false;
  }

  return /\[['"][A-Za-z0-9_$]+['"]\]/u.test(typeText) || /^[A-Z][A-Za-z0-9_$]*$/u.test(typeText);
}

export function isPropertyOrElementInput(node) {
  return ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node);
}

export function hasAdjacentBoundaryTest(relativePath) {
  const absolutePath = path.resolve(relativePath);
  const directory = path.dirname(absolutePath);
  if (!fs.existsSync(directory)) {
    return false;
  }

  const sourceBase = path.basename(relativePath).replace(/\.[cm]?[jt]sx?$/u, '');
  return fs.readdirSync(directory).some((entry) => {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry)) {
      return false;
    }
    return (
      entry.startsWith(`${sourceBase}.`) ||
      /(?:boundary|import|parser|normalize|unsafe)/u.test(entry)
    );
  });
}

export function getUnsafeFunctionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text.startsWith('unsafe')) {
    return node.name.text;
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text.startsWith('unsafe') &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }
  return null;
}
