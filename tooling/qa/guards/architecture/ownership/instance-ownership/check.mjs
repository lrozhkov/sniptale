/**
 * Interactive controller ownership guardrail.
 * Protects migrated seams from regressing back to module-global runtime state or editor singleton imports.
 */

import fs from 'node:fs';
import ts from 'typescript';

import { collectCodeFiles } from '../../../../analysis/repository/shared-files.mjs';
import { isProductionSrcTypeScriptFile } from '../../../../analysis/repository/src-production-targets.mjs';
import { toRelativePath } from '../../../../analysis/repository/shared-paths.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../../runtime/process/shared-cli.mjs';
import { resolveScopedTargetFiles } from '../../../../runtime/scope/target-files.helpers.mjs';
import { getSourceSnapshot } from '../../../../analysis/source/source-snapshot.mjs';
import { loadInstanceOwnershipInventory } from './inventory-owner.mjs';

const INSTANCE_OWNERSHIP = loadInstanceOwnershipInventory();
export const OWNERSHIP_FACADE_FILES = INSTANCE_OWNERSHIP.facadeFiles;
export const OWNERSHIP_STATE_FILES = INSTANCE_OWNERSHIP.stateFiles;

const DEFAULT_OWNER_NAME_PATTERN =
  /^default[A-Z][A-Za-z0-9]*(?:Controller|Service|Session|Runtime|Facade|Locker)$/u;
const MUTABLE_CONTAINER_NAME_PATTERN =
  /(?:state|session|context|cache|registry|listener|listeners|tabs|clients)$/iu;

function createViolation(rule, file, message, line = 1) {
  return { rule, file, line, message };
}

function createSourceFile(filePath, source) {
  return getSourceSnapshot({ filePath, text: source }).sourceFile;
}

function importsEditorControllerSingleton(sourceFile) {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return false;
    }
    if (!statement.moduleSpecifier.text.endsWith('editor-controller')) return false;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return false;
    return namedBindings.elements.some(
      (specifier) => (specifier.propertyName ?? specifier.name).text === 'imageEditorController'
    );
  });
}

function collectTopLevelVariableStatements(sourceFile) {
  return sourceFile.statements.filter((statement) => ts.isVariableStatement(statement));
}

function isMutableTopLevelVariable(statement) {
  return (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
}

function getDeclarationLine(sourceFile, declaration) {
  return sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
}

function collectTopLevelMutableStateViolations(relativePath, sourceFile) {
  const violations = [];

  for (const statement of collectTopLevelVariableStatements(sourceFile)) {
    for (const declaration of statement.declarationList.declarations) {
      if (
        isMutableTopLevelVariable(statement) ||
        isMutableContainerDeclaration(statement, declaration)
      ) {
        violations.push(
          createViolation(
            'module-global-runtime-state',
            relativePath,
            'Migrated ownership seams must not reintroduce top-level mutable runtime state.',
            getDeclarationLine(sourceFile, declaration)
          )
        );
      }
    }
  }

  return violations;
}

function isMutableContainerDeclaration(statement, declaration) {
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return false;
  }

  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
    return false;
  }

  if (
    ts.isNewExpression(declaration.initializer) &&
    ts.isIdentifier(declaration.initializer.expression) &&
    ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(declaration.initializer.expression.text)
  ) {
    return true;
  }

  return (
    ts.isObjectLiteralExpression(declaration.initializer) &&
    MUTABLE_CONTAINER_NAME_PATTERN.test(declaration.name.text)
  );
}

function isCreateFactoryCall(initializer) {
  return (
    initializer &&
    ts.isCallExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    /^create[A-Z][A-Za-z0-9]*(?:Controller|Service|Session|Runtime|Facade|Locker)$/u.test(
      initializer.expression.text
    )
  );
}

function isDefaultFactoryDeclaration(declaration) {
  if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return false;
  if (!ts.isCallExpression(declaration.initializer)) return false;
  if (!ts.isIdentifier(declaration.initializer.expression)) return false;
  const callee = declaration.initializer.expression.text;
  return (
    (DEFAULT_OWNER_NAME_PATTERN.test(declaration.name.text) && /^create[A-Z]/u.test(callee)) ||
    /^createLazy(?:Content)?DefaultOwner$/u.test(callee)
  );
}

function hasDefaultFactoryOwner(sourceFile) {
  return collectTopLevelVariableStatements(sourceFile).some((statement) =>
    statement.declarationList.declarations.some(isDefaultFactoryDeclaration)
  );
}

export function collectDefaultFactoryOwnerFiles(entries) {
  return entries
    .filter((entry) => isProductionSrcTypeScriptFile(entry.relativePath))
    .filter((entry) => hasDefaultFactoryOwner(createSourceFile(entry.filePath, entry.source)))
    .map((entry) => entry.relativePath)
    .sort();
}

function collectFacadeDefaultOwnerViolations(relativePath, sourceFile) {
  const violations = [];
  const message =
    'Facade ownership files may only instantiate top-level create* owners ' +
    'through a default*Controller/service/session wrapper.';

  for (const statement of collectTopLevelVariableStatements(sourceFile)) {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !isCreateFactoryCall(declaration.initializer)) {
        continue;
      }

      if (DEFAULT_OWNER_NAME_PATTERN.test(declaration.name.text)) {
        continue;
      }

      violations.push(
        createViolation(
          'facade-default-owner',
          relativePath,
          message,
          getDeclarationLine(sourceFile, declaration)
        )
      );
    }
  }

  return violations;
}

export function collectOwnershipViolationsFromSources(
  entries,
  {
    ownershipFacadeFiles = OWNERSHIP_FACADE_FILES,
    ownershipStateFiles = OWNERSHIP_STATE_FILES,
  } = {}
) {
  const violations = [];

  for (const entry of entries) {
    const relativePath = entry.relativePath;
    if (!isProductionSrcTypeScriptFile(relativePath)) {
      continue;
    }

    const source = entry.source;
    const sourceFile = createSourceFile(entry.filePath, source);

    if (hasDefaultFactoryOwner(sourceFile) && !ownershipFacadeFiles.has(relativePath)) {
      violations.push(
        createViolation(
          'default-factory-owner-unregistered',
          relativePath,
          'Default singleton factories must be registered under their canonical source path.'
        )
      );
    }

    if (
      relativePath.startsWith('apps/extension/src/editor/') &&
      !relativePath.startsWith('apps/extension/src/editor/controller/') &&
      importsEditorControllerSingleton(sourceFile)
    ) {
      violations.push(
        createViolation(
          'editor-controller-singleton-import',
          relativePath,
          'Editor UI must use the page-owned controller seam, not import imageEditorController.'
        )
      );
    }

    if (ownershipStateFiles.has(relativePath) || ownershipFacadeFiles.has(relativePath)) {
      violations.push(...collectTopLevelMutableStateViolations(relativePath, sourceFile));
    }

    if (ownershipFacadeFiles.has(relativePath)) {
      violations.push(...collectFacadeDefaultOwnerViolations(relativePath, sourceFile));
    }
  }

  return violations;
}

export function collectOwnershipViolations(files) {
  return collectOwnershipViolationsFromSources(
    files.map((filePath) => ({
      filePath,
      relativePath: toRelativePath(filePath),
      source: fs.readFileSync(filePath, 'utf8'),
    }))
  );
}

export function runInstanceOwnershipCheck({ files = [], scope = 'workspace' } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  });
  const targetRelativeFiles = targets.relativeFiles;
  const targetFiles = targets.files;

  return {
    skipped: targetFiles.length === 0,
    files: targetRelativeFiles,
    violations: collectOwnershipViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const explicitFiles = parseFilesArgument(argv);
  const repoWide = argv.includes('--repo-wide');
  const reportOnly = argv.includes('--report-only');
  const result = runInstanceOwnershipCheck({
    files: explicitFiles,
    scope: repoWide ? 'repo-wide' : 'workspace',
  });

  if (result.skipped) {
    process.stdout.write('Instance ownership check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Interactive controller ownership violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Interactive controller ownership guardrail passed\n');
}
