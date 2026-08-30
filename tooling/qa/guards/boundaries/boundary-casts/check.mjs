/**
 * Boundary cast guardrail.
 * Keeps imported/runtime payloads unknown until an owner parser proves the domain shape.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { runGuardrailCheck, runIfExecutedAsScript } from '../../audit/execution/shared.mjs';
import { isProductionCodeFile, normalizePath } from '../../audit/execution/shared.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

const STRICT_COERCION_OWNER_ROOTS = [
  'apps/extension/src/editor/document/',
  'apps/extension/src/editor/objects/',
  'apps/extension/src/features/video/project/effect-bundle/',
];
const SCHEMA_CONTRACT_ROOTS = [
  'apps/extension/src/contracts/messaging/',
  'packages/runtime-contracts/src/effect-v1/validation/',
  'packages/runtime-contracts/src/messaging/',
];
const POST_VALIDATION_CALLS = new Set(['finishEffectV1Validation']);
const SAFE_ASSERTION_TYPES = new Set(['unknown', 'const']);

function createBoundaryCastViolation(rule, file, sourceFile, node, message) {
  return {
    rule,
    file,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    message,
  };
}

function isStrictCoercionPath(relativePath) {
  return STRICT_COERCION_OWNER_ROOTS.some((root) => relativePath.startsWith(root));
}

function isSchemaContractPath(relativePath) {
  return SCHEMA_CONTRACT_ROOTS.some((root) => relativePath.startsWith(root));
}

function getTypeText(node, sourceFile) {
  return node.type.getText(sourceFile).replace(/\s+/gu, ' ');
}

function unwrapAssertionExpression(node) {
  let expression = node;
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function isJsonParseCall(expression) {
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.expression.getText() === 'JSON' &&
    expression.expression.name.text === 'parse'
  );
}

function isReadJsonFileCall(node) {
  if (!ts.isCallExpression(node) || !node.typeArguments?.length) return false;
  const expression = node.expression;
  return ts.isIdentifier(expression)
    ? expression.text === 'readJsonFile'
    : ts.isPropertyAccessExpression(expression) && expression.name.text === 'readJsonFile';
}

function isPropertyOrElementInput(node) {
  return ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node);
}

function isShapeCoercionAssertion(node, typeText) {
  const originalExpression = unwrapAssertionExpression(node.expression);
  if (SAFE_ASSERTION_TYPES.has(typeText)) return false;
  if (/^Record(?:<|$)|^Array(?:<|$)|^\w+\[\]$/u.test(typeText)) return true;
  const enumLike =
    !/^T[A-Z]/u.test(typeText) &&
    (/\[['"][A-Za-z0-9_$]+['"]\]/u.test(typeText) || /^[A-Z][A-Za-z0-9_$]*$/u.test(typeText));
  return isPropertyOrElementInput(originalExpression) && (typeText === 'any' || enumLike);
}

function isUnknownParameter(expression, node) {
  if (!ts.isIdentifier(expression)) return false;
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    return current.parameters.some(
      (parameter) =>
        ts.isIdentifier(parameter.name) &&
        parameter.name.text === expression.text &&
        parameter.type?.kind === ts.SyntaxKind.UnknownKeyword
    );
  }
  return false;
}

function isUnvalidatedUnknownBoundaryAssertion(node) {
  const expression = unwrapAssertionExpression(node.expression);
  if (!isUnknownParameter(expression, node)) return false;
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const call = current.parent;
    if (!ts.isCallExpression(call) || !call.arguments.includes(current)) return false;
    const callee = call.expression;
    const operation =
      (ts.isPropertyAccessExpression(callee) && callee.name.text) ||
      (ts.isElementAccessExpression(callee) &&
        ts.isStringLiteralLike(callee.argumentExpression) &&
        callee.argumentExpression.text);
    return /^(?:addListener|onMessage|subscribe|subscribeToMessages)$/u.test(operation || '');
  }
  return false;
}

function conditionValidatesExpression(condition, expressionText, sourceFile) {
  let validates = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^(?:assert|has|is|parse|validate)[A-Z_]/u.test(node.expression.text) &&
      node.arguments.some((argument) => argument.getText(sourceFile) === expressionText)
    ) {
      validates = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return validates;
}

function hasPostValidationProof(node, sourceFile) {
  const expressionText = unwrapAssertionExpression(node.expression).getText(sourceFile);
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      POST_VALIDATION_CALLS.has(current.expression.text) &&
      current.arguments.some((argument) => node.pos >= argument.pos && node.end <= argument.end)
    ) {
      return true;
    }
    if (
      ts.isConditionalExpression(current) &&
      ((node.pos >= current.whenTrue.pos && node.end <= current.whenTrue.end) ||
        (node.pos >= current.whenFalse.pos && node.end <= current.whenFalse.end)) &&
      conditionValidatesExpression(current.condition, expressionText, sourceFile)
    ) {
      return true;
    }
    if (ts.isFunctionLike(current)) break;
  }
  return false;
}

function hasAdjacentBoundaryTest(relativePath) {
  const absolutePath = path.resolve(relativePath);
  const directory = path.dirname(absolutePath);
  if (!fs.existsSync(directory)) return false;
  const sourceBase = path.basename(relativePath).replace(/\.[cm]?[jt]sx?$/u, '');
  return fs
    .readdirSync(directory)
    .some(
      (entry) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry) && entry.startsWith(`${sourceBase}.`)
    );
}

function containsAssertion(root) {
  let found = false;
  const visit = (child) => {
    if (ts.isAsExpression(child) || ts.isTypeAssertionExpression(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(root);
  return found;
}

function getUnsafeFunctionName(node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text.startsWith('unsafe') &&
    containsAssertion(node)
  ) {
    return node.name.text;
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text.startsWith('unsafe') &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
    containsAssertion(node.initializer)
  ) {
    return node.name.text;
  }
  return null;
}

function getExpressionText(expression, sourceFile) {
  return expression.getText(sourceFile).replace(/\s+/gu, ' ');
}

function isCustomEventCast(typeText, expressionText) {
  return typeText.startsWith('CustomEvent<') || expressionText.endsWith('.detail');
}

function createNeverAssertionViolation(relativePath, sourceFile, node, typeText) {
  if (typeText !== 'never') {
    return null;
  }

  return createBoundaryCastViolation(
    'boundary-cast-as-never',
    relativePath,
    sourceFile,
    node,
    'Product code must not use `as never`; use a narrow exhaustiveness helper or typed adapter.'
  );
}

function createBoundaryPayloadAssertionViolation(relativePath, sourceFile, node, typeText) {
  const originalExpression = unwrapAssertionExpression(node.expression);
  const expressionText = getExpressionText(originalExpression, sourceFile);

  if (isJsonParseCall(originalExpression) && typeText !== 'unknown') {
    return createBoundaryCastViolation(
      'boundary-json-parse-cast',
      relativePath,
      sourceFile,
      node,
      `JSON.parse payload is cast to "${typeText}". Parse as unknown and validate with the owner contract.`
    );
  }

  if (isCustomEventCast(typeText, expressionText)) {
    return createBoundaryCastViolation(
      'boundary-custom-event-cast',
      relativePath,
      sourceFile,
      node,
      `Custom event payload is cast to "${typeText}". Narrow event.detail in a typed event adapter.`
    );
  }

  if (isUnvalidatedUnknownBoundaryAssertion(node) && !hasPostValidationProof(node, sourceFile)) {
    return createBoundaryCastViolation(
      'boundary-payload-cast',
      relativePath,
      sourceFile,
      node,
      `Unknown boundary input "${expressionText}" is cast to "${typeText}". Add a local parser or guard.`
    );
  }

  return null;
}

function createSchemaAssertionViolation(relativePath, sourceFile, node, typeText) {
  if (!isSchemaContractPath(relativePath) || hasPostValidationProof(node, sourceFile)) {
    return null;
  }
  if (/^(?:z\.)?ZodType(?:<|$)/u.test(typeText)) {
    return createBoundaryCastViolation(
      'boundary-schema-type-escape',
      relativePath,
      sourceFile,
      node,
      'Schema contracts must use a checked schema builder instead of a Zod type assertion.'
    );
  }
  const innerType =
    (ts.isAsExpression(node.expression) || ts.isTypeAssertionExpression(node.expression)) &&
    getTypeText(node.expression, sourceFile);
  if ((innerType === 'unknown' || innerType === 'any') && typeText !== 'unknown') {
    return createBoundaryCastViolation(
      'boundary-schema-double-cast',
      relativePath,
      sourceFile,
      node,
      'Schema contracts must not escape boundary validation through a double assertion.'
    );
  }
  return null;
}

function createShapeAssertionViolation(relativePath, sourceFile, node, typeText) {
  if (
    !isStrictCoercionPath(relativePath) ||
    hasPostValidationProof(node, sourceFile) ||
    !isShapeCoercionAssertion(node, typeText)
  ) {
    return null;
  }

  return createBoundaryCastViolation(
    'boundary-cast-shape-coercion',
    relativePath,
    sourceFile,
    node,
    'Boundary normalizers must not coerce Record/Array/enum shapes without parser proof.'
  );
}

function collectAssertionViolations(relativePath, sourceFile, node) {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) {
    return [];
  }
  for (let current = node.parent; current; current = current.parent) {
    if (getUnsafeFunctionName(current)) {
      if (hasAdjacentBoundaryTest(relativePath)) return [];
      break;
    }
    if (ts.isFunctionLike(current)) break;
  }

  const typeText = getTypeText(node, sourceFile);
  return [
    createNeverAssertionViolation(relativePath, sourceFile, node, typeText),
    createBoundaryPayloadAssertionViolation(relativePath, sourceFile, node, typeText),
    createSchemaAssertionViolation(relativePath, sourceFile, node, typeText),
    createShapeAssertionViolation(relativePath, sourceFile, node, typeText),
  ].filter(Boolean);
}

function collectCallViolations(relativePath, sourceFile, node) {
  if (!ts.isCallExpression(node)) {
    return [];
  }

  if (isReadJsonFileCall(node)) {
    return [
      createBoundaryCastViolation(
        'boundary-cast-typed-json-reader',
        relativePath,
        sourceFile,
        node,
        'Generic typed JSON readers hide boundary proof; return unknown and parse locally.'
      ),
    ];
  }

  if (
    isStrictCoercionPath(relativePath) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'String' &&
    node.arguments.length > 0 &&
    isPropertyOrElementInput(node.arguments[0])
  ) {
    return [
      createBoundaryCastViolation(
        'boundary-cast-string-coercion',
        relativePath,
        sourceFile,
        node,
        '`String(...)` must not normalize unknown boundary fields before parser proof.'
      ),
    ];
  }

  return [];
}

function collectUnsafeHelperViolations(relativePath, sourceFile, node) {
  const unsafeFunctionName = getUnsafeFunctionName(node);
  if (!unsafeFunctionName || hasAdjacentBoundaryTest(relativePath)) {
    return [];
  }

  return [
    createBoundaryCastViolation(
      'boundary-cast-unsafe-helper-proof',
      relativePath,
      sourceFile,
      node,
      `Unsafe helper "${unsafeFunctionName}" needs adjacent owner-local boundary tests.`
    ),
  ];
}

export function collectBoundaryCastViolations(files) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = normalizePath(filePath);
    if (!isProductionCodeFile(relativePath)) {
      continue;
    }

    const sourceFile = getSourceSnapshot({ filePath }).sourceFile;
    const visit = (node) => {
      violations.push(...collectAssertionViolations(relativePath, sourceFile, node));
      violations.push(...collectCallViolations(relativePath, sourceFile, node));
      violations.push(...collectUnsafeHelperViolations(relativePath, sourceFile, node));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
}

export function runBoundaryCastCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectBoundaryCastViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectBoundaryCastViolations,
  label: 'Boundary casts',
});
