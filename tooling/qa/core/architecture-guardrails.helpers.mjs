import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { repoRoot, toRelativePath } from './shared.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';
import { collectModuleReferenceLiterals } from './verify-canonical-facades.helpers.mjs';

export const PRODUCT_TS_FILE_PATTERN =
  /^(?:src|apps\/extension\/src|packages\/[^/]+\/src)\/.+\.[cm]?[jt]sx?$/u;
export const ARCHITECTURE_GUARDRAIL_POLICY_FILE =
  'tooling/qa/core/architecture-guardrails.data.mjs';
export const PRODUCTION_SOURCE_IGNORE_PATTERNS = [
  /^src\/test-harness\//u,
  /\/test-support\//u,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
  /\.(?:test|spec)[.-](?:fixtures?|helpers?|support)\.[cm]?[jt]sx?$/u,
  /\.test-support\.[cm]?[jt]sx?$/u,
];

export function createViolation(rule, file, message, line) {
  return {
    rule,
    file,
    ...(line == null ? {} : { line }),
    message,
  };
}

function groupViolationOccurrencesByRule(violations) {
  const occurrences = new Map();
  for (const violation of violations) {
    const grouped = occurrences.get(violation.rule) ?? [];
    grouped.push({ file: violation.file, line: violation.line });
    occurrences.set(violation.rule, grouped);
  }
  return occurrences;
}

function occurrenceKey(occurrence) {
  return `${occurrence.file}\0${occurrence.line}`;
}

function occurrenceLabel(occurrence) {
  return `${occurrence.file}:${occurrence.line}`;
}

function difference(left, rightKeys) {
  return left.filter((occurrence) => !rightKeys.has(occurrenceKey(occurrence)));
}

export function collectExactBaselineViolations(violations, baseline, messageForRule) {
  const occurrences = groupViolationOccurrencesByRule(violations);
  const rules = new Set([...occurrences.keys(), ...Object.keys(baseline ?? {})]);
  return [...rules].flatMap((rule) => {
    const actual = occurrences.get(rule) ?? [];
    const expected = baseline?.[rule] ?? [];
    const actualKeys = new Set(actual.map(occurrenceKey));
    const expectedKeys = new Set(expected.map(occurrenceKey));
    const added = difference(actual, expectedKeys);
    const removed = difference(expected, actualKeys);
    if (added.length === 0 && removed.length === 0) {
      return [];
    }
    return [
      createViolation(
        rule,
        ARCHITECTURE_GUARDRAIL_POLICY_FILE,
        messageForRule(rule, {
          added: added.map(occurrenceLabel),
          removed: removed.map(occurrenceLabel),
        })
      ),
    ];
  });
}

export function readSourceFile(root, relativePath) {
  return ts.createSourceFile(
    relativePath,
    fs.readFileSync(path.join(root, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
}

export function isProductionSourceFile(file) {
  const relativePath = toRelativePath(file);
  return (
    PRODUCT_TS_FILE_PATTERN.test(relativePath) &&
    !PRODUCTION_SOURCE_IGNORE_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

export function isProductionImportTarget(file) {
  const relativePath = toRelativePath(file);
  return (
    isProductSourcePath(relativePath) &&
    !PRODUCTION_SOURCE_IGNORE_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

function resolveImportTarget(importer, specifier, root) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const importerDirectory = path.posix.dirname(importer);
  const base = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.mjs`,
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate))) ?? base;
}

export function collectImportEdges(files, { root = repoRoot } = {}) {
  const edges = [];
  for (const file of files) {
    const relativePath = toRelativePath(file);
    const absolutePath = path.join(root, relativePath);
    if (!PRODUCT_TS_FILE_PATTERN.test(relativePath) || !fs.existsSync(absolutePath)) {
      continue;
    }
    const sourceFile = readSourceFile(root, relativePath);
    for (const { literal, line } of collectModuleReferenceLiterals(sourceFile)) {
      const target = resolveImportTarget(relativePath, literal.text, root);
      if (target) {
        edges.push({ from: relativePath, line, specifier: literal.text, to: target });
      }
    }
  }
  return edges;
}

export function collectProductionImportEdges(files, { root = repoRoot } = {}) {
  return collectImportEdges(files.filter(isProductionSourceFile), { root }).filter((edge) =>
    isProductionImportTarget(edge.to)
  );
}
