import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isProductSourcePath } from './src-production-targets.mjs';

export {
  resolveFacadeImportTarget,
  resolveLegacyFacadeTarget,
} from './canonical-facade-targets.mjs';

export const ROOT_FACADE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const SUPPORT_FILE_PATTERN =
  /\.(?:test-helpers|test-support|fixtures|test\.fixtures|test\.helpers)\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const MODULE_REFERENCE_CALLS = new Set([
  'importOriginal',
  'jest.mock',
  'require',
  'vi.doMock',
  'vi.importActual',
  'vi.importMock',
  'vi.mock',
]);

export function createViolation(rule, file, message, line) {
  return { rule, file, line, message };
}

function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getLineRange(sourceFile, node) {
  return {
    startLine: getLine(sourceFile, node),
    endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function getSelfRecursiveFacadeTarget(relativePath, specifier) {
  if (!specifier.startsWith('./')) {
    return null;
  }

  const fileName = path.posix.basename(relativePath);
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex < 0) {
    return null;
  }

  const stem = fileName.slice(0, extensionIndex);
  const target = specifier.slice(2);
  return target === stem ? stem : null;
}

function isAllowedFacadeStatement(statement) {
  if (ts.isImportDeclaration(statement)) {
    return statement.importClause != null;
  }

  if (ts.isExportDeclaration(statement)) {
    return true;
  }

  return false;
}

export function collectMissingFacadeViolations(files, root) {
  return files
    .filter((relativePath) => !fs.existsSync(path.join(root, relativePath)))
    .map((relativePath) =>
      createViolation(
        'shared-public-root-facade-missing',
        relativePath,
        'Shared public root facade allowlist references a missing file. Sync the allowlist.',
        1
      )
    );
}

function collectStatementFacadeViolations(relativePath, sourceFile, statement) {
  const violations = [];

  if (!isAllowedFacadeStatement(statement)) {
    violations.push(
      createViolation(
        'root-facade-non-facade-logic',
        relativePath,
        'Root facade files may only contain import/export re-export glue.',
        getLine(sourceFile, statement)
      )
    );
    return violations;
  }

  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) {
    return violations;
  }

  const moduleSpecifier = statement.moduleSpecifier;
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
    return violations;
  }

  const recursiveTarget = getSelfRecursiveFacadeTarget(relativePath, moduleSpecifier.text);
  if (!recursiveTarget) {
    return violations;
  }

  violations.push(
    createViolation(
      'root-facade-self-recursive-target',
      relativePath,
      `Root facade import/export "${moduleSpecifier.text}" targets its own same-name path ` +
        `segment "${recursiveTarget}". Re-export the canonical owner file explicitly, ` +
        'for example via "./segment/index" or a short owner-local role path.',
      getLine(sourceFile, statement)
    )
  );
  return violations;
}

function collectFileThinFacadeViolations(relativePath, root) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.flatMap((statement) =>
    collectStatementFacadeViolations(relativePath, sourceFile, statement)
  );
}

export function collectThinFacadeViolations(files, root) {
  const violations = [];

  for (const relativePath of files.filter((candidate) =>
    fs.existsSync(path.join(root, candidate))
  )) {
    violations.push(...collectFileThinFacadeViolations(relativePath, root));
  }

  return violations;
}

function appendModuleReferenceLiteral(literals, sourceFile, literal, rangeNode) {
  const range = getLineRange(sourceFile, rangeNode);
  literals.push({
    literal,
    line: range.startLine,
    ...range,
  });
}

function isDynamicImportCall(callExpression) {
  return callExpression.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function isModuleReferenceCall(callExpression, sourceFile) {
  return MODULE_REFERENCE_CALLS.has(callExpression.expression.getText(sourceFile));
}

function collectCallExpressionModuleReference(node, sourceFile, literals) {
  if (!isDynamicImportCall(node) && !isModuleReferenceCall(node, sourceFile)) {
    return;
  }
  const firstArgument = node.arguments[0];
  if (firstArgument && ts.isStringLiteral(firstArgument)) {
    appendModuleReferenceLiteral(literals, sourceFile, firstArgument, node);
  }
}

function collectImportTypeModuleReference(node, sourceFile, literals) {
  const argument = node.argument;
  if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
    appendModuleReferenceLiteral(literals, sourceFile, argument.literal, node);
  }
}

function visitModuleReferenceNode(node, sourceFile, literals) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier;
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      appendModuleReferenceLiteral(literals, sourceFile, moduleSpecifier, node);
    }
  } else if (ts.isCallExpression(node)) {
    collectCallExpressionModuleReference(node, sourceFile, literals);
  } else if (ts.isImportTypeNode(node)) {
    collectImportTypeModuleReference(node, sourceFile, literals);
  }
  ts.forEachChild(node, (child) => visitModuleReferenceNode(child, sourceFile, literals));
}

export function collectModuleReferenceLiterals(sourceFile) {
  const literals = [];
  visitModuleReferenceNode(sourceFile, sourceFile, literals);
  return literals;
}

function hasOwnerDirectory(relativePath, root) {
  const ownerDirectory = path.join(root, relativePath.replace(ROOT_FACADE_FILE_PATTERN, ''));
  return fs.existsSync(ownerDirectory) && fs.statSync(ownerDirectory).isDirectory();
}

export function isLegacyRootCandidate(relativePath, root) {
  if (!ROOT_FACADE_FILE_PATTERN.test(relativePath)) {
    return false;
  }

  if (TEST_FILE_PATTERN.test(relativePath) || SUPPORT_FILE_PATTERN.test(relativePath)) {
    return false;
  }
  return hasOwnerDirectory(relativePath, root);
}

export function isChangedOwnerFacadeCandidate(relativePath, root) {
  if (!isProductSourcePath(relativePath)) {
    return false;
  }

  if (
    !ROOT_FACADE_FILE_PATTERN.test(relativePath) ||
    TEST_FILE_PATTERN.test(relativePath) ||
    SUPPORT_FILE_PATTERN.test(relativePath)
  ) {
    return false;
  }
  return hasOwnerDirectory(relativePath, root);
}

export function isSharedPublicRootFacadeFile() {
  return false;
}

export function isFrozenBroadCompatibilityFacadeFile() {
  return false;
}
