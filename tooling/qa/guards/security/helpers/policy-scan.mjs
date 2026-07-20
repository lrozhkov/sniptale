import fs from 'node:fs';
import ts from 'typescript';

import { SECURITY_IGNORE_PATTERNS } from '../../../core/quality.config.mjs';
import { matchesAny } from '../../../core/shared.mjs';
import { collectPolicyRegistryViolations, toRootRelativePath } from '../security-policy-utils.mjs';

function isCodePolicyTarget(relativePath) {
  return /\.(?:ts|tsx|js|mjs|cjs)$/u.test(relativePath);
}

export function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getInspectionScope(node) {
  let current = node;
  while (current.parent) {
    if (
      ts.isFunctionLike(current.parent) ||
      ts.isSourceFile(current.parent) ||
      ts.isMethodDeclaration(current.parent)
    ) {
      return current.parent;
    }
    current = current.parent;
  }

  return node.getSourceFile();
}

export function getInspectionScopeText(sourceFile, node) {
  return getInspectionScope(node).getText(sourceFile);
}

export function createSourceFile(filePath) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
}

export function visitSourceNodes(sourceFile, visitNode) {
  const visit = (node) => {
    visitNode(node);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

export function isStorageSetCall(node, { includeSessionStorage = false } = {}) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const expressionText = node.expression.getText();
  if (expressionText.endsWith('.putRecord')) {
    return true;
  }
  const allowedTargets = includeSessionStorage
    ? [
        'browserStorage.local.set',
        'browserStorage.session.set',
        'browserStorage.sync.set',
        'chrome.storage.local.set',
        'chrome.storage.session.set',
        'chrome.storage.sync.set',
      ]
    : [
        'browserStorage.local.set',
        'browserStorage.sync.set',
        'chrome.storage.local.set',
        'chrome.storage.sync.set',
      ];

  return allowedTargets.includes(expressionText);
}

function shouldInspectPolicyFile(relativePath, allowlistedFiles) {
  return (
    isCodePolicyTarget(relativePath) &&
    !matchesAny(relativePath, SECURITY_IGNORE_PATTERNS) &&
    !allowlistedFiles.has(relativePath)
  );
}

export function forEachPolicySourceFile(
  files,
  { allowlistedFiles = new Set(), rootDir, shouldIncludeRelativePath = () => true },
  visitFile
) {
  for (const filePath of files) {
    const relativePath = toRootRelativePath(rootDir, filePath);
    if (
      !shouldInspectPolicyFile(relativePath, allowlistedFiles) ||
      !shouldIncludeRelativePath(relativePath)
    ) {
      continue;
    }

    const sourceFile = createSourceFile(filePath);
    visitFile({
      filePath,
      relativePath,
      sourceFile,
    });
  }
}

export function collectPolicyBackedStorageFieldViolations(
  files,
  {
    fieldPattern,
    includeSessionStorage = false,
    message,
    ownerEntries,
    policyKind,
    policyPath,
    rootDir,
    rule,
  }
) {
  const allowlistedFiles = new Set(ownerEntries.map((entry) => entry.file));
  const violations = collectPolicyRegistryViolations(ownerEntries, policyPath, policyKind, rootDir);

  forEachPolicySourceFile(
    files,
    {
      allowlistedFiles,
      rootDir,
    },
    ({ relativePath, sourceFile }) => {
      visitSourceNodes(sourceFile, (node) => {
        if (
          isStorageSetCall(node, { includeSessionStorage }) &&
          fieldPattern.test(getInspectionScopeText(sourceFile, node))
        ) {
          violations.push({
            rule,
            file: relativePath,
            line: getNodeLine(sourceFile, node),
            message,
          });
        }
      });
    }
  );

  return violations;
}
