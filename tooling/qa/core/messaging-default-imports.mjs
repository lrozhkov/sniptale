import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  ALLOWED_DEFAULT_RUNTIME_MESSAGING_IMPORT_FILES,
  DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE,
  DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES,
  isAllowlistedPath,
} from '../policy/messaging.mjs';
import { createViolation, isProductionSourceFile } from './architecture-guardrails.helpers.mjs';
import { repoRoot } from './shared.mjs';

const DEFAULT_RUNTIME_MESSAGING_RULE = 'messaging-default-runtime-transport-import';
const DEFAULT_RUNTIME_MESSAGING_MESSAGE =
  'Use injected RuntimeMessagingTransport instead of importing default sendRuntimeMessage/sendTabMessage.';
const DEFAULT_RUNTIME_MESSAGING_BASELINE_FILE = 'tooling/qa/policy/messaging.mjs';
const MODULE_EXTENSION_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;

function normalizeSeparators(value) {
  return value.replaceAll(path.sep, '/');
}

function toRootRelativePath(file, root) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(root, file);
  return normalizeSeparators(path.relative(root, absolutePath));
}

function createScanFile(file, root) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(root, file);
  return { absolutePath, relativePath: toRootRelativePath(absolutePath, root) };
}

function normalizeSpecifier(importer, specifier) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  return path.posix
    .normalize(path.posix.join(path.posix.dirname(importer), specifier))
    .replace(MODULE_EXTENSION_PATTERN, '');
}

function isDefaultRuntimeMessagingSpecifier(importer, specifier) {
  const normalized = normalizeSpecifier(importer, specifier);
  return (
    normalized === 'apps/extension/src/platform/runtime-messaging' ||
    normalized === 'apps/extension/src/platform/runtime-messaging/index' ||
    normalized === 'apps/extension/src/platform/runtime-messaging/default-transport'
  );
}

function collectNamedImportNames(namedBindings) {
  return namedBindings.elements
    .map((element) => (element.propertyName ?? element.name).text)
    .filter((name) => DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES.has(name))
    .sort();
}

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function createImportKey(entry) {
  return `${entry.file}#${entry.importName}`;
}

function compareEntry(left, right) {
  return left.file.localeCompare(right.file) || left.importName.localeCompare(right.importName);
}

function parseDefaultRuntimeMessagingImports(scanFile) {
  const text = fs.readFileSync(scanFile.absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(scanFile.relativePath, text, ts.ScriptTarget.Latest, true);
  const imports = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause ||
      !statement.importClause.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    if (
      !isDefaultRuntimeMessagingSpecifier(scanFile.relativePath, statement.moduleSpecifier.text)
    ) {
      continue;
    }

    for (const importName of collectNamedImportNames(statement.importClause.namedBindings)) {
      imports.push({
        file: scanFile.relativePath,
        importName,
        key: `${scanFile.relativePath}#${importName}`,
        line: getLine(sourceFile, statement),
        specifier: statement.moduleSpecifier.text,
      });
    }
  }

  return imports;
}

export function isAllowedDefaultRuntimeMessagingImportFile(relativePath) {
  return isAllowlistedPath(relativePath, ALLOWED_DEFAULT_RUNTIME_MESSAGING_IMPORT_FILES);
}

export function collectDefaultRuntimeMessagingImports(files, { root = repoRoot } = {}) {
  return files
    .map((file) => createScanFile(file, root))
    .filter(({ absolutePath, relativePath }) => {
      return (
        fs.existsSync(absolutePath) &&
        isProductionSourceFile(relativePath) &&
        !isAllowedDefaultRuntimeMessagingImportFile(relativePath)
      );
    })
    .flatMap(parseDefaultRuntimeMessagingImports)
    .sort(compareEntry);
}

function createAddedViolation(entry) {
  return createViolation(
    DEFAULT_RUNTIME_MESSAGING_RULE,
    entry.file,
    `${DEFAULT_RUNTIME_MESSAGING_MESSAGE} Added violation: ${entry.importName}.`,
    entry.line
  );
}

function createRemovedBaselineViolation(key) {
  const [file, importName] = key.split('#');
  return createViolation(
    DEFAULT_RUNTIME_MESSAGING_RULE,
    DEFAULT_RUNTIME_MESSAGING_BASELINE_FILE,
    [
      `Removed default runtime messaging import baseline: ${file}#${importName}.`,
      'Update DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE to preserve the exact reduced population.',
    ].join(' ')
  );
}

export function collectDefaultRuntimeMessagingImportReport(files, options = {}) {
  const {
    baseline = DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE,
    includeRemoved = false,
    ...collectorOptions
  } = options;
  const imports = collectDefaultRuntimeMessagingImports(files, collectorOptions);
  const currentKeys = new Set(imports.map(createImportKey));
  const added = imports.filter((entry) => !baseline.has(entry.key));
  const removed = includeRemoved ? [...baseline].filter((key) => !currentKeys.has(key)) : [];

  return {
    added,
    baselineCount: baseline.size,
    currentCount: currentKeys.size,
    imports,
    removed,
    summary: [
      `Default runtime messaging import baseline: ${baseline.size}.`,
      `Added violations: ${added.length}.`,
      `Removed violations: ${removed.length}.`,
    ].join(' '),
    violations: [
      ...added.map(createAddedViolation),
      ...removed.map(createRemovedBaselineViolation),
    ],
  };
}
