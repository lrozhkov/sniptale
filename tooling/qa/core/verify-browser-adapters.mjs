/**
 * Browser adapter guardrail.
 * Blocks direct browser API calls for storage/tabs/downloads/debugger/scripting
 * outside the shared adapter seam and explicit native-binding test areas.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  repoRoot,
  toRelativePath,
} from './shared.mjs';
import {
  BROADCAST_CHANNEL_OWNER_FILES,
  HISTORY_OWNER_FILES,
  LOCAL_STORAGE_OWNER_FILES,
  isBrowserAdapterAllowedPath,
  isBrowserAdapterTestLikeFile,
  normalizeBrowserAdapterPath,
} from './policy/index.mjs';
import { runAstGrepCheck } from '../audits/ast-grep.mjs';

const BROWSER_ADAPTER_OWNERS_POLICY_PATH = 'tooling/qa/policy/browser-adapters-owners.mjs';

function toRootRelativePath(filePath, root) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  return normalizeBrowserAdapterPath(path.relative(root, absolutePath));
}

function dedupeBrowserAdapterViolations(violations, files, root) {
  const fileOrder = new Map(
    files.map((filePath, index) => [toRootRelativePath(filePath, root), index])
  );
  const seen = new Set();

  return violations
    .map((violation) => ({
      ...violation,
      file: normalizeBrowserAdapterPath(violation.file),
    }))
    .sort((left, right) => {
      const leftOrder = fileOrder.get(left.file) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = fileOrder.get(right.file) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return (left.line ?? 0) - (right.line ?? 0);
    })
    .filter((violation) => {
      const key = `${violation.file}:${violation.rule}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function collectBrowserAdapterViolations(files, { root = repoRoot } = {}) {
  const relevantFiles = files.filter((filePath) => {
    const relativePath = toRootRelativePath(filePath, root);
    return (
      !isBrowserAdapterAllowedPath(relativePath) && !isBrowserAdapterTestLikeFile(relativePath)
    );
  });
  if (relevantFiles.length === 0) {
    return [];
  }

  const result = runAstGrepCheck({
    files: relevantFiles,
    groupIds: ['browser-adapters'],
    pathRoot: root,
  });

  return dedupeBrowserAdapterViolations(result.violations, relevantFiles, root);
}

function createBrowserAdapterOwnerPathViolation(ownerPath) {
  return {
    rule: 'browser-adapter-owner-missing-target',
    file: BROWSER_ADAPTER_OWNERS_POLICY_PATH,
    message:
      `Browser adapter owner "${ownerPath}" points to a missing file. ` +
      'Update the allowlist to the real canonical owner path.',
  };
}

export function collectBrowserAdapterOwnerPathViolations(rootDir = repoRoot) {
  const ownerPaths = [
    ...LOCAL_STORAGE_OWNER_FILES,
    ...HISTORY_OWNER_FILES,
    ...BROADCAST_CHANNEL_OWNER_FILES,
  ];

  return [...new Set(ownerPaths)]
    .filter((ownerPath) => !fs.existsSync(path.join(rootDir, ownerPath)))
    .sort()
    .map(createBrowserAdapterOwnerPathViolation);
}

export function runBrowserAdapterCheck({ files = [], root = null } = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  const resolvedRoot = root ?? repoRoot;

  return {
    files: targetFiles.map(toRelativePath),
    violations: [
      ...collectBrowserAdapterOwnerPathViolations(resolvedRoot),
      ...collectBrowserAdapterViolations(targetFiles, { root: resolvedRoot }),
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runBrowserAdapterCheck();

  if (result.violations.length > 0) {
    printViolations('Browser adapter guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Browser adapter guardrail passed\n');
}
