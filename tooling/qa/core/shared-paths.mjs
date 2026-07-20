import fs from 'node:fs';
import path from 'node:path';

import {
  CODE_FILE_PATTERN,
  DATA_FILE_PATTERNS,
  FORMATTABLE_FILE_PATTERN,
  FORMATTER_EXCLUDE_PATTERNS,
  IGNORED_ROOT_SEGMENTS,
  TOKEN_BUDGET_EXCLUDE_PATTERNS,
  TOKEN_BUDGET_INCLUDE_PATTERNS,
  WORKSPACE_ONLY_IGNORE_PATTERNS,
} from './quality.config.mjs';

export const repoRoot = process.cwd();

function normalizeSeparators(value) {
  return value.replaceAll(path.sep, '/');
}

export function toRelativePath(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  return normalizeSeparators(path.relative(repoRoot, absolutePath));
}

export function fromRelativePath(relativePath) {
  return path.join(repoRoot, relativePath);
}

export function matchesAny(target, patterns) {
  return patterns.some((pattern) => pattern.test(target));
}

export function isIgnoredRelativePath(relativePath) {
  const normalizedPath = normalizeSeparators(relativePath);
  return (
    normalizedPath.split('/').some((segment) => IGNORED_ROOT_SEGMENTS.has(segment)) ||
    matchesAny(normalizedPath, WORKSPACE_ONLY_IGNORE_PATTERNS)
  );
}

export function isCodeFile(relativePath) {
  return CODE_FILE_PATTERN.test(relativePath);
}

export function isFormattableFile(relativePath) {
  return (
    FORMATTABLE_FILE_PATTERN.test(relativePath) &&
    !matchesAny(relativePath, FORMATTER_EXCLUDE_PATTERNS)
  );
}

export function isDataCarrierFile(relativePath) {
  return matchesAny(relativePath, DATA_FILE_PATTERNS);
}

export function isTokenBudgetFile(relativePath) {
  return (
    isCodeFile(relativePath) &&
    matchesAny(relativePath, TOKEN_BUDGET_INCLUDE_PATTERNS) &&
    !matchesAny(relativePath, TOKEN_BUDGET_EXCLUDE_PATTERNS)
  );
}

export function readText(relativePath) {
  return fs.readFileSync(fromRelativePath(relativePath), 'utf8');
}

export function splitLines(text) {
  return text.split(/\r?\n/u);
}
