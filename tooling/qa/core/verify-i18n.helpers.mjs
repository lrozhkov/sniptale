import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { PRODUCT_SOURCE_ROOTS } from './src-production-targets.mjs';

const LIVE_RUNTIME_PATTERNS = [
  /^src\/(?:background|content|popup|settings|gallery|editor|video-editor|offscreen)\//u,
  /^apps\/extension\/src\/[^/]+\//u,
  /^packages\/ui\/src\//u,
];

const FULL_SCAN_TRIGGER_PATTERNS = [
  /^apps\/extension\/src\/platform\/i18n\//u,
  /^tooling\/qa\/core\/verify-i18n(?:\.helpers)?\.mjs$/u,
  /^tooling\/qa\/core\/verify-focused(?:\.config|-triggered\.helpers)?\.mjs$/u,
];

const EXCLUDED_PATTERNS = [
  /^src\/design-system\//u,
  /^apps\/extension\/src\/design-system\//u,
  /^apps\/extension\/src\/scenario-editor\//u,
  /^apps\/extension\/src\/platform\/i18n\//u,
  /^apps\/extension\/src\/(?:contracts|composition\/persistence)\//u,
  /^packages\/(?:runtime-contracts|platform\/src\/observability)\//u,
  /^apps\/extension\/src\/content\/parser\/(?:dom-tree-parser|parsers|ir|page-snapshot)\//u,
  /^apps\/extension\/src\/content\/logic\/dom-tree-parser-mvs\.fixture-content\.ts$/u,
  /(?:^|\/).*\.design-system(?:\.|\/)/u,
  /(?:^|\/)design-system\.[cm]?[jt]sx?$/u,
  /(?:^|\/).*\.copy\.(?:data\.)?tsx?$/u,
  /(?:^|\/).*\.data\.[cm]?[jt]sx?$/u,
  /(?:^|\/)preview-copy\.[cm]?[jt]sx?$/u,
  /^apps\/extension\/src\/features\/editor\/document\/rich-shape\/catalog\/entries-/u,
  /^apps\/extension\/src\/features\/video\/project\/annotation-engine\/builtins\//u,
  /(?:^|\/)fixtures?\//u,
  /(?:^|\/).*fixture.*\.[cm]?[jt]sx?$/u,
  /(?:^|\/).*test-helpers\.[cm]?[jt]sx?$/u,
  /(?:^|\/).*test-support\.[cm]?[jt]sx?$/u,
];

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/u;
const TECHNICAL_LITERAL_PATTERNS = [
  /^https?:\/\//u,
  /^[A-Z0-9.+-]{2,}$/u,
  /^[A-Z0-9.+-]+ \([A-Z]{2,5}\)$/u,
  /^[0-9]{1,3}%$/u,
  /^[0-9]{2,5}x[0-9]{2,5}$/iu,
  /^[A-Z]{1,4}$/u,
];

function normalizePath(file) {
  return file.replaceAll(path.sep, '/');
}

export function normalizeText(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

export function getViolationLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isLowercaseLetter(character) {
  return character >= 'a' && character <= 'z';
}

function isTranslationKeySegment(text, { lowercaseOnly = false } = {}) {
  if (text.length === 0) {
    return false;
  }

  return [...text].every((character) => {
    if (lowercaseOnly) {
      return isLowercaseLetter(character);
    }

    return (
      isLowercaseLetter(character) ||
      (character >= 'A' && character <= 'Z') ||
      (character >= '0' && character <= '9') ||
      character === '-'
    );
  });
}

export function isTranslationKey(text) {
  const segments = text.split('.');
  if (segments.length < 2) {
    return false;
  }

  return segments.every((segment, index) =>
    isTranslationKeySegment(segment, { lowercaseOnly: index === 0 })
  );
}

export function isHumanReadableCopy(text) {
  if (text.length === 0 || isTranslationKey(text)) {
    return false;
  }

  if (TECHNICAL_LITERAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  return /[A-Za-zА-Яа-яЁё]/u.test(text);
}

export function readStringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
    return normalizeText(node.text ?? node.getText());
  }

  if (
    ts.isJsxExpression(node) &&
    node.expression &&
    (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
  ) {
    return normalizeText(node.expression.text);
  }

  return null;
}

export function getObjectProperty(node, name) {
  return node.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) && property.name.getText().replace(/['"]/gu, '') === name
  );
}

function isStructuredTestFile(file) {
  const baseName = file.split('/').at(-1) ?? '';
  return baseName.includes('.test.') || baseName.includes('.spec.');
}

function walkFiles(root, currentPath) {
  return fs.readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(root, absolutePath);
    }

    const relativePath = normalizePath(path.relative(root, absolutePath));
    return SOURCE_FILE_PATTERN.test(relativePath) ? [relativePath] : [];
  });
}

export function isFullI18nScanTrigger(file) {
  return FULL_SCAN_TRIGGER_PATTERNS.some((pattern) => pattern.test(file));
}

export function isLiveProductI18nFile(file) {
  if (!SOURCE_FILE_PATTERN.test(file)) {
    return false;
  }

  if (isStructuredTestFile(file)) {
    return false;
  }

  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(file))) {
    return false;
  }

  return LIVE_RUNTIME_PATTERNS.some((pattern) => pattern.test(file));
}

export function collectLiveProductI18nFiles(root = process.cwd()) {
  return PRODUCT_SOURCE_ROOTS.flatMap((sourceRoot) => {
    const absoluteRoot = path.join(root, sourceRoot);
    return fs.existsSync(absoluteRoot) ? walkFiles(root, absoluteRoot) : [];
  })
    .filter(isLiveProductI18nFile)
    .sort();
}
