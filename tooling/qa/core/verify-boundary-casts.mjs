/**
 * Boundary cast guardrail.
 * Keeps imported/runtime payloads unknown until an owner parser proves the domain shape.
 */

import fs from 'node:fs';
import ts from 'typescript';

import { runGuardrailCheck, runIfExecutedAsScript } from './audit-guardrail-shared.mjs';
import { isProductionCodeFile, normalizePath } from './audit-guardrail-shared.mjs';
import {
  createBoundaryCastViolation,
  getTypeText,
  getUnsafeFunctionName,
  hasAdjacentBoundaryTest,
  isBoundaryOwnerPath,
  isJsonParseCall,
  isPostValidationFile,
  isPropertyOrElementInput,
  isReadJsonFileCall,
  isShapeCoercionAssertion,
  isStrictCoercionPath,
  unwrapAssertionExpression,
} from './verify-boundary-casts.helpers.mjs';

const BOUNDARY_VALUE_NAMES = new Set([
  'data',
  'detail',
  'errorData',
  'event',
  'message',
  'payload',
  'request',
  'responseData',
  'result',
]);

function getExpressionText(expression, sourceFile) {
  return expression.getText(sourceFile).replace(/\s+/gu, ' ');
}

function isCustomEventCast(typeText, expressionText) {
  return typeText.startsWith('CustomEvent<') || expressionText.endsWith('.detail');
}

function isBoundaryNamedValue(expressionText) {
  return BOUNDARY_VALUE_NAMES.has(expressionText);
}

function isBoundaryPayloadType(typeText) {
  return /\b[A-Z][A-Za-z0-9]*(?:Command|Document|Message|Payload|Request|Response)\b/u.test(
    typeText
  );
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

  if (isBoundaryNamedValue(expressionText) && isBoundaryPayloadType(typeText)) {
    return createBoundaryCastViolation(
      'boundary-payload-cast',
      relativePath,
      sourceFile,
      node,
      `Boundary payload "${expressionText}" is cast to "${typeText}". Add a local parser or guard.`
    );
  }

  return null;
}

function createJsonParseAssertionViolation(relativePath, sourceFile, node, typeText) {
  const originalExpression = unwrapAssertionExpression(node.expression);
  if (
    !isBoundaryOwnerPath(relativePath) ||
    !isJsonParseCall(originalExpression) ||
    typeText === 'unknown'
  ) {
    return null;
  }

  return createBoundaryCastViolation(
    'boundary-cast-json-parse-typed',
    relativePath,
    sourceFile,
    node,
    '`JSON.parse(...)` boundary input must stay unknown until parsed by an owner guard.'
  );
}

function createShapeAssertionViolation(relativePath, sourceFile, node, typeText) {
  if (
    !isStrictCoercionPath(relativePath) ||
    isPostValidationFile(relativePath) ||
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

  const typeText = getTypeText(node, sourceFile);
  return [
    createNeverAssertionViolation(relativePath, sourceFile, node, typeText),
    createBoundaryPayloadAssertionViolation(relativePath, sourceFile, node, typeText),
    createJsonParseAssertionViolation(relativePath, sourceFile, node, typeText),
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
    !isPostValidationFile(relativePath) &&
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

    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
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
