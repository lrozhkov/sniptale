import fs from 'node:fs';
import ts from 'typescript';

import { collectCodeFiles, toRelativePath } from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

export function getNodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function normalizeRepoScopedPath(relativePath) {
  const extensionSourceIndex = relativePath.indexOf('apps/extension/src/');
  if (extensionSourceIndex >= 0) {
    return relativePath.slice(extensionSourceIndex);
  }

  const srcIndex = relativePath.indexOf('src/');
  return srcIndex >= 0 ? relativePath.slice(srcIndex) : relativePath;
}

export function isTestLikeFile(relativePath) {
  return relativePath.includes('.test.') || relativePath.includes('.spec.');
}

export function resolveScopedCodeTargets({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
} = {}) {
  return resolveScopedTargetFiles({ files, scope, collectFiles });
}

export function runScopedCodeFileCheck({
  collectFiles = collectCodeFiles,
  collectViolations,
  files = [],
  scope = 'workspace',
} = {}) {
  const targets = resolveScopedCodeTargets({ files, scope, collectFiles });

  return {
    skipped: targets.files.length === 0,
    files: targets.relativeFiles,
    violations: collectViolations(targets.files),
  };
}

export function scanRepoScopedTypeScriptFiles(
  files,
  {
    allowlistedRelativePaths = new Set(),
    includeTestLikeFiles = false,
    targetFilePatterns,
    visitFile,
  }
) {
  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    const normalizedPath = normalizeRepoScopedPath(relativePath);
    if (allowlistedRelativePaths.has(normalizedPath)) {
      continue;
    }
    if (!includeTestLikeFiles && isTestLikeFile(relativePath)) {
      continue;
    }
    if (!targetFilePatterns.some((pattern) => pattern.test(normalizedPath))) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );

    visitFile({
      filePath,
      normalizedPath,
      relativePath,
      sourceFile,
    });
  }
}
