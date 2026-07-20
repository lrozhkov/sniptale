/**
 * Interactive controller ownership guardrail.
 * Protects migrated seams from regressing back to module-global runtime state or editor singleton imports.
 */

import fs from 'node:fs';
import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from './shared.mjs';
import {
  OWNERSHIP_FACADE_FILES,
  OWNERSHIP_STATE_FILES,
} from './verify-instance-ownership.data.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

const EDITOR_SINGLETON_IMPORT_PATTERN =
  /import\s*\{\s*imageEditorController\s*\}\s*from\s*['"][^'"]*editor-controller['"]/u;
const DEFAULT_OWNER_NAME_PATTERN =
  /^default[A-Z][A-Za-z0-9]*(?:Controller|Service|Session|Runtime|Facade|Locker)$/u;
const MUTABLE_CONTAINER_NAME_PATTERN =
  /(?:state|session|context|cache|registry|listener|listeners|tabs|clients)$/iu;

function createViolation(rule, file, message, line = 1) {
  return { rule, file, line, message };
}

function createSourceFile(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
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

export function collectOwnershipViolationsFromSources(entries) {
  const violations = [];

  for (const entry of entries) {
    const relativePath = entry.relativePath;
    if (!/\.(?:ts|tsx)$/u.test(relativePath) || relativePath.includes('.test.')) {
      continue;
    }

    const source = entry.source;
    const sourceFile = createSourceFile(entry.filePath, source);

    if (
      relativePath.startsWith('apps/extension/src/editor/') &&
      !relativePath.startsWith('apps/extension/src/editor/controller/') &&
      EDITOR_SINGLETON_IMPORT_PATTERN.test(source)
    ) {
      violations.push(
        createViolation(
          'editor-controller-singleton-import',
          relativePath,
          'Editor UI must use the page-owned controller seam, not import imageEditorController.'
        )
      );
    }

    if (OWNERSHIP_STATE_FILES.has(relativePath) || OWNERSHIP_FACADE_FILES.has(relativePath)) {
      violations.push(...collectTopLevelMutableStateViolations(relativePath, sourceFile));
    }

    if (OWNERSHIP_FACADE_FILES.has(relativePath)) {
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

export function runInstanceOwnershipCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
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
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runInstanceOwnershipCheck({ files: explicitFiles });

  if (result.skipped) {
    process.stdout.write('Instance ownership check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Interactive controller ownership violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Interactive controller ownership guardrail passed\n');
}
