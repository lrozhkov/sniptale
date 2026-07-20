/**
 * UI package boundary guardrail.
 * Keeps packages/ui independent from the app-owned design-system catalog.
 */

import fs from 'node:fs';
import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  toRelativePath,
} from './shared.mjs';

function createViolation(file, message, line) {
  return {
    rule: 'shared-ui-design-system-import',
    file,
    line,
    message,
  };
}

function isSharedUiFile(relativePath) {
  return (
    (relativePath.startsWith('packages/ui/src/') || relativePath.includes('/packages/ui/src/')) &&
    /\.(ts|tsx)$/.test(relativePath)
  );
}

function resolveImportText(node) {
  if (ts.isStringLiteralLike(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }

  return null;
}

function isForbiddenSharedUiImport(specifier) {
  return /(^|\/)design-system\//u.test(specifier);
}

export function collectSharedUiBoundaryViolations(files) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!isSharedUiFile(relativePath)) {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }

      const specifier = resolveImportText(statement);
      if (!specifier || !isForbiddenSharedUiImport(specifier)) {
        continue;
      }

      const line =
        sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
      violations.push(
        createViolation(
          relativePath,
          'packages/ui must not import the app design-system catalog; keep previews app-local.',
          line
        )
      );
    }
  }

  return violations;
}

export function runSharedUiBoundaryCheck({ files = [] } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map(toRelativePath),
    violations: collectSharedUiBoundaryViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runSharedUiBoundaryCheck();

  if (result.violations.length > 0) {
    printViolations('Shared UI boundary violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Shared UI boundaries passed\n');
}
