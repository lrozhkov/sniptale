/**
 * Structural i18n guardrail for live product surfaces.
 * Run from repo root with `node tooling/qa/guards/product-contracts/verify-i18n.mjs`.
 * Exits non-zero when live runtime files contain raw user-facing copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';
import { getSourceSnapshot } from '../../analysis/source/source-snapshot.mjs';
import { readI18nCatalogs } from './verify-i18n.catalogs.mjs';
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

function isTranslateCall(node) {
  return ts.isCallExpression(node) && node.expression.getText() === 'translate';
}

function isFunctionLikeDeclaration(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
}

function isInsideLocaleAwareCopy(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (
      isFunctionLikeDeclaration(current) &&
      current.parameters.some(
        (parameter) => parameter.type && /\bAppLocale\b/u.test(parameter.type.getText(sourceFile))
      )
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function isAllowedUserFacingLiteral(text, node, sourceFile) {
  return !isHumanReadableCopy(text) || isInsideLocaleAwareCopy(node, sourceFile);
}

function isUserFacingJsxExpression(node, sourceFile) {
  if (ts.isJsxAttribute(node.parent)) {
    return false;
  }

  return !(
    ts.isJsxElement(node.parent) &&
    node.parent.openingElement.tagName.getText(sourceFile) === 'style'
  );
}

function collectJsxTextFailure(relativeFile, sourceFile, node) {
  const text = readStringLiteral(node);
  if (!text || isAllowedUserFacingLiteral(text, node, sourceFile)) {
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
  if (!text || isAllowedUserFacingLiteral(text, node, sourceFile)) {
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
  if (!text || isAllowedUserFacingLiteral(text, node, sourceFile)) {
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
  if (!text || isAllowedUserFacingLiteral(text, firstArgument, sourceFile)) {
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
  if (!text || isAllowedUserFacingLiteral(text, messageProperty.initializer, sourceFile)) {
    return [];
  }

  return [
    `${relativeFile}:${getViolationLine(sourceFile, messageProperty.initializer)} ` +
      `contains raw progress message "${text}"`,
  ];
}

export function collectFileFailures(relativeFile, { root = repoRoot, usage = null } = {}) {
  if (!isLiveProductI18nFile(relativeFile)) {
    return [];
  }

  const absoluteFile = path.join(root, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    return [`${relativeFile} is missing`];
  }

  const sourceFile = getSourceSnapshot({
    filePath: absoluteFile,
    text: fs.readFileSync(absoluteFile, 'utf8'),
  }).sourceFile;
  const failures = [];

  function visit(node) {
    if (usage) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (usage.keys.has(node.text)) usage.references.add(node.text);
      } else if (ts.isTemplateExpression(node)) {
        const prefix = node.head.text;
        const suffix = node.templateSpans.at(-1)?.literal.text ?? '';
        if (prefix.includes('.')) usage.patterns.add(JSON.stringify([prefix, suffix]));
      }
      if (
        isTranslateCall(node) &&
        node.arguments[0] &&
        !ts.isStringLiteral(node.arguments[0]) &&
        !ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
      ) {
        usage.unresolved.push(
          `${relativeFile}:${getViolationLine(sourceFile, node)} uses a dynamic translation key`
        );
      }
    }
    if (
      ts.isJsxText(node) ||
      (ts.isJsxExpression(node) && isUserFacingJsxExpression(node, sourceFile))
    ) {
      failures.push(...collectJsxTextFailure(relativeFile, sourceFile, node));
      if (ts.isJsxText(node)) {
        return;
      }
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

function catalogKeys(node, prefix = '', result = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result.add(full);
    else catalogKeys(value, full, result);
  }
  return result;
}

/** Collect failures and conservative usage diagnostics in the existing source walk. */
export function runI18nReport({ files = null, root = repoRoot, collectUsage = true } = {}) {
  const hasCatalogOwner =
    fs.existsSync(path.join(root, 'packages/platform/src/i18n/config.ts')) ||
    fs.existsSync(path.join(root, 'apps/extension/src/platform/i18n/catalogs'));
  const catalogResult = hasCatalogOwner
    ? readI18nCatalogs({ root, checkFormat: true })
    : { catalogs: {}, failures: [] };
  const usage = {
    keys: catalogKeys(catalogResult.catalogs.en ?? {}),
    references: new Set(),
    patterns: new Set(),
    unresolved: [],
  };
  const scopedFiles = files ?? collectLiveProductI18nFiles(root);
  const failures = [
    ...catalogResult.failures,
    ...scopedFiles
      .filter((file) => isLiveProductI18nFile(file) && fs.existsSync(path.join(root, file)))
      .flatMap((relativeFile) =>
        collectFileFailures(relativeFile, { root, usage: collectUsage ? usage : null })
      ),
  ];
  const patterns = [...usage.patterns].map((pattern) => JSON.parse(pattern));
  const candidates =
    files === null && collectUsage
      ? [...usage.keys]
          .filter(
            (key) =>
              !usage.references.has(key) &&
              !patterns.some(([prefix, suffix]) => key.startsWith(prefix) && key.endsWith(suffix))
          )
          .sort()
      : [];
  return {
    failures,
    usage: { complete: files === null && collectUsage, candidates, unresolved: usage.unresolved },
  };
}

export function runI18nCheck(options = {}) {
  return runI18nReport(options).failures;
}

if (isExecutedAsScript(import.meta.url)) {
  const { failures, usage } = runI18nReport();
  console.log(
    `i18n usage advisory: ${usage.candidates.length} unreferenced candidates; ${usage.unresolved.length} unresolved dynamic accesses`
  );
  if (usage.candidates.length > 0)
    console.log(`Candidates (not proof of dead keys): ${usage.candidates.join(', ')}`);
  for (const diagnostic of usage.unresolved) console.log(diagnostic);

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
