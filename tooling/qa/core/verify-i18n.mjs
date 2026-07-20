/**
 * Structural i18n guardrail for live product surfaces.
 * Run from repo root with `node tooling/qa/core/verify-i18n.mjs`.
 * Exits non-zero when live runtime files contain raw user-facing copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isExecutedAsScript } from './shared.mjs';
import {
  collectLiveProductI18nFiles,
  getObjectProperty,
  getViolationLine,
  isHumanReadableCopy,
  isLiveProductI18nFile,
  readStringLiteral,
} from './verify-i18n.helpers.mjs';

const repoRoot = process.cwd();

const USER_FACING_PROPERTY_NAMES = new Set([
  'alt',
  'aria-label',
  'badgeLabel',
  'caption',
  'description',
  'emptyLabel',
  'helperText',
  'label',
  'placeholder',
  'statusLabel',
  'subtitle',
  'title',
]);

function getScriptKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function isTranslateCall(node) {
  return ts.isCallExpression(node) && node.expression.getText() === 'translate';
}

function isAllowedUserFacingLiteral(text) {
  return !isHumanReadableCopy(text);
}

function collectJsxTextFailure(relativeFile, sourceFile, node) {
  const text = readStringLiteral(node);
  if (!text || isAllowedUserFacingLiteral(text)) {
    return [];
  }

  return [`${relativeFile}:${getViolationLine(sourceFile, node)} contains raw JSX text "${text}"`];
}

function collectJsxAttributeFailure(relativeFile, sourceFile, node) {
  const attributeName = node.name.getText(sourceFile);
  if (!USER_FACING_PROPERTY_NAMES.has(attributeName)) {
    return [];
  }

  const text = node.initializer ? readStringLiteral(node.initializer) : null;
  if (!text || isAllowedUserFacingLiteral(text)) {
    return [];
  }

  return [
    `${relativeFile}:${getViolationLine(sourceFile, node)} contains raw ${attributeName} value "${text}"`,
  ];
}

function collectObjectPropertyFailure(relativeFile, sourceFile, node) {
  const propertyName = node.name.getText(sourceFile).replace(/['"]/gu, '');
  if (!USER_FACING_PROPERTY_NAMES.has(propertyName)) {
    return [];
  }

  const text = readStringLiteral(node.initializer);
  if (!text || isAllowedUserFacingLiteral(text)) {
    return [];
  }

  return [
    `${relativeFile}:${getViolationLine(sourceFile, node)} contains raw ${propertyName} property "${text}"`,
  ];
}

function collectCallFailure(relativeFile, sourceFile, node) {
  if (node.arguments.length === 0) {
    return [];
  }

  const firstArgument = node.arguments[0];
  const text = readStringLiteral(firstArgument);
  if (!text || isAllowedUserFacingLiteral(text)) {
    return [];
  }

  const callee = node.expression.getText(sourceFile);
  if (/^toast\.(?:error|info|success|warning)$/u.test(callee)) {
    return [
      `${relativeFile}:${getViolationLine(sourceFile, firstArgument)} contains raw toast copy "${text}"`,
    ];
  }

  return [];
}

function collectProgressObjectFailure(relativeFile, sourceFile, node) {
  const messageProperty = getObjectProperty(node, 'message');
  if (!messageProperty || !ts.isPropertyAssignment(messageProperty)) {
    return [];
  }

  const hasProgressShape =
    getObjectProperty(node, 'phase') &&
    getObjectProperty(node, 'current') &&
    getObjectProperty(node, 'total');
  if (!hasProgressShape) {
    return [];
  }

  const text = readStringLiteral(messageProperty.initializer);
  if (!text || isAllowedUserFacingLiteral(text)) {
    return [];
  }

  return [
    `${relativeFile}:${getViolationLine(sourceFile, messageProperty.initializer)} ` +
      `contains raw progress message "${text}"`,
  ];
}

export function collectFileFailures(relativeFile, { root = repoRoot } = {}) {
  if (!isLiveProductI18nFile(relativeFile)) {
    return [];
  }

  const absoluteFile = path.join(root, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    return [`${relativeFile} is missing`];
  }

  const sourceText = fs.readFileSync(absoluteFile, 'utf8');
  const sourceFile = ts.createSourceFile(
    absoluteFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(relativeFile)
  );
  const failures = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      failures.push(...collectJsxTextFailure(relativeFile, sourceFile, node));
      return;
    }

    if (ts.isJsxAttribute(node)) {
      failures.push(...collectJsxAttributeFailure(relativeFile, sourceFile, node));
    }

    if (ts.isPropertyAssignment(node)) {
      failures.push(...collectObjectPropertyFailure(relativeFile, sourceFile, node));
    }

    if (ts.isObjectLiteralExpression(node)) {
      failures.push(...collectProgressObjectFailure(relativeFile, sourceFile, node));
    }

    if (ts.isCallExpression(node) && !isTranslateCall(node)) {
      failures.push(...collectCallFailure(relativeFile, sourceFile, node));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(failures)];
}

export function runI18nCheck({ files = null, root = repoRoot } = {}) {
  const scopedFiles = files ?? collectLiveProductI18nFiles(root);

  return scopedFiles
    .filter((file) => isLiveProductI18nFile(file))
    .flatMap((relativeFile) => collectFileFailures(relativeFile, { root }));
}

if (isExecutedAsScript(import.meta.url)) {
  const failures = runI18nCheck();

  if (failures.length > 0) {
    console.error('i18n guardrail violations found:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('i18n guardrail passed');
  }
}
