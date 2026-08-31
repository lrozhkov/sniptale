import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  ALLOWED_DEFAULT_RUNTIME_MESSAGING_IMPORT_FILES,
  DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE,
  DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES,
  isAllowlistedPath,
} from '../../../policy/messaging/messaging.mjs';
import {
  createViolation,
  isProductionSourceFile,
} from '../../architecture/architecture-guardrails/helpers.mjs';
import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { getSourceSnapshot } from '../../../analysis/source/source-snapshot.mjs';

const DEFAULT_RUNTIME_MESSAGING_RULE = 'messaging-default-runtime-transport-import';
const DEFAULT_RUNTIME_MESSAGING_MESSAGE =
  'Use injected RuntimeMessagingTransport instead of importing default sendRuntimeMessage/sendTabMessage.';
const DEFAULT_RUNTIME_MESSAGING_BASELINE_FILE = 'tooling/qa/policy/messaging/messaging.mjs';
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

function collectBindingNames(bindingPattern) {
  if (!ts.isObjectBindingPattern(bindingPattern)) return [];
  return bindingPattern.elements
    .filter((element) => !element.dotDotDotToken)
    .map((element) => (element.propertyName ?? element.name).getText())
    .filter((name) => DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES.has(name));
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getDynamicImportSpecifier(expression) {
  const current = unwrapExpression(expression);
  if (
    !ts.isCallExpression(current) ||
    current.expression.kind !== ts.SyntaxKind.ImportKeyword ||
    current.arguments.length !== 1 ||
    !ts.isStringLiteralLike(current.arguments[0])
  ) {
    return null;
  }
  return current.arguments[0].text;
}

function getNamespaceMember(node, aliases) {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    aliases.has(node.expression.text)
  ) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    aliases.has(node.expression.text) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  const expression =
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
      ? node.expression
      : null;
  const specifier = expression && getDynamicImportSpecifier(expression);
  if (!specifier) return null;
  return ts.isPropertyAccessExpression(node)
    ? node.name.text
    : ts.isStringLiteralLike(node.argumentExpression)
      ? node.argumentExpression.text
      : null;
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
  if (
    !text.includes('runtime-messaging') &&
    ![...DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES].some((name) => text.includes(name))
  ) {
    return [];
  }
  const sourceFile = getSourceSnapshot({ filePath: scanFile.absolutePath, text }).sourceFile;
  const imports = [];

  const addImport = (importName, node, specifier) => {
    if (importName !== '*' && !DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES.has(importName)) return;
    imports.push({
      file: scanFile.relativePath,
      importName,
      key: `${scanFile.relativePath}#${importName}`,
      line: getLine(sourceFile, node),
      specifier,
    });
  };
  const namespaceAliases = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (
        !clause?.isTypeOnly &&
        isDefaultRuntimeMessagingSpecifier(scanFile.relativePath, statement.moduleSpecifier.text)
      ) {
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (element.isTypeOnly) continue;
            addImport(
              (element.propertyName ?? element.name).text,
              statement,
              statement.moduleSpecifier.text
            );
          }
        } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          namespaceAliases.set(clause.namedBindings.name.text, statement.moduleSpecifier.text);
        }
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      isDefaultRuntimeMessagingSpecifier(scanFile.relativePath, statement.moduleSpecifier.text)
    ) {
      if (!statement.exportClause) addImport('*', statement, statement.moduleSpecifier.text);
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) {
            addImport(
              (element.propertyName ?? element.name).text,
              statement,
              statement.moduleSpecifier.text
            );
          }
        }
      }
    }
  }

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const specifier = getDynamicImportSpecifier(node.initializer);
      if (specifier && isDefaultRuntimeMessagingSpecifier(scanFile.relativePath, specifier)) {
        if (ts.isIdentifier(node.name)) namespaceAliases.set(node.name.text, specifier);
        for (const name of collectBindingNames(node.name)) addImport(name, node, specifier);
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = getNamespaceMember(node, namespaceAliases);
      const alias = ts.isIdentifier(node.expression)
        ? namespaceAliases.get(node.expression.text)
        : getDynamicImportSpecifier(node.expression);
      if (name && alias) addImport(name, node, alias);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...new Map(imports.map((entry) => [entry.key, entry])).values()];
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
