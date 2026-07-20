/**
 * Heavy runtime import ownership guardrail.
 * Keeps heavyweight dependencies inside their canonical runtime seams.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript, printViolations, repoRoot } from './shared.mjs';

const RULES = [
  {
    rule: 'heavy-import-fabric-owner',
    packageName: 'fabric',
    isViolation(relativePath) {
      return !/(^|\/)src\/editor\//.test(relativePath);
    },
    message: 'fabric imports are allowed only in apps/extension/src/editor/**.',
  },
  {
    rule: 'heavy-import-jszip-content',
    packageName: 'jszip',
    isViolation(relativePath) {
      return /(^|\/)src\/content\//.test(relativePath);
    },
    message:
      'Static jszip imports are not allowed in apps/extension/src/content/**. ' +
      'Use a lazy runtime import or move the seam.',
  },
  {
    rule: 'heavy-import-dompurify-owner',
    packageName: 'dompurify',
    isViolation(relativePath) {
      return !/(^|\/)packages\/platform\/src\/security\/sanitizers\/html\.ts$/.test(relativePath);
    },
    message: 'dompurify imports are allowed only in @sniptale/platform/security/sanitizers/html.',
  },
];

function isCheckedRuntimeFile(relativePath) {
  const isRuntimeOrHarnessFile =
    /(^|\/)src\//.test(relativePath) || /^tooling\/test\/harness\//.test(relativePath);

  return (
    isRuntimeOrHarnessFile &&
    /\.(ts|tsx)$/.test(relativePath) &&
    !/\.test\.[cm]?[jt]sx?$/.test(relativePath) &&
    !/\.spec\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function createViolation(rule, file, line, message) {
  return { rule, file, line, message };
}

function getLineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getImportSpecifierText(node) {
  return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
}

function hasRuntimeImportBinding(statement) {
  const importClause = statement.importClause;
  if (!importClause) {
    return true;
  }

  if (importClause.isTypeOnly) {
    return false;
  }

  if (importClause.name) {
    return true;
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return false;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    return true;
  }

  return namedBindings.elements.some((element) => !element.isTypeOnly);
}

function normalizeRelativePath(filePath, rootDir) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

export function collectHeavyRuntimeImportOwnershipViolations(files, { rootDir = repoRoot } = {}) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath, rootDir);
    if (!isCheckedRuntimeFile(relativePath)) {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !hasRuntimeImportBinding(statement)) {
        continue;
      }

      const specifier = getImportSpecifierText(statement);
      if (!specifier) {
        continue;
      }

      for (const rule of RULES) {
        if (specifier !== rule.packageName || !rule.isViolation(relativePath)) {
          continue;
        }

        violations.push(
          createViolation(
            rule.rule,
            relativePath,
            getLineNumber(sourceFile, statement),
            rule.message
          )
        );
      }
    }
  }

  return violations;
}

export function runHeavyRuntimeImportOwnershipCheck({ files = [], rootDir = repoRoot } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((filePath) => normalizeRelativePath(filePath, rootDir)),
    violations: collectHeavyRuntimeImportOwnershipViolations(targetFiles, { rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runHeavyRuntimeImportOwnershipCheck();

  if (result.violations.length > 0) {
    printViolations('Heavy runtime import ownership violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Heavy runtime import ownership passed\n');
}
