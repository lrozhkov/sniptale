import fs from 'node:fs';
import path from 'node:path';

import { hashGitBlob } from './git-object-store.mjs';
import { isIgnoredRelativePath } from './shared-paths.mjs';
import {
  collectChangedLinesAgainstWorktree,
  collectChangedLinesFromStore,
} from './git-fallback-diff.mjs';
import { collectRepositoryFiles } from './git-fallback-repository.mjs';

function readWorktreeText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function collectTrackedWorkspaceChanges(repoRoot, entries, headTreeMap, store) {
  const changedLineMap = new Map();
  const changedFiles = new Set();
  const deletedFiles = new Set();

  for (const entry of entries) {
    if (isIgnoredRelativePath(entry.path)) {
      continue;
    }

    const headEntry = headTreeMap.get(entry.path);
    const absolutePath = path.join(repoRoot, entry.path);
    const fileExists = fs.existsSync(absolutePath);

    if (headEntry?.oid !== entry.oid) {
      changedFiles.add(entry.path);
      if (fileExists) {
        collectChangedLinesFromStore({
          changedLineMap,
          filePath: entry.path,
          beforeOid: headEntry?.oid ?? null,
          afterOid: entry.oid,
          store,
        });
      }
    }

    if (!fileExists) {
      if (headEntry) {
        changedFiles.add(entry.path);
        deletedFiles.add(entry.path);
      }
      continue;
    }

    const worktreeText = readWorktreeText(repoRoot, entry.path);
    if (hashGitBlob(worktreeText) !== entry.oid) {
      changedFiles.add(entry.path);
      collectChangedLinesAgainstWorktree({
        changedLineMap,
        filePath: entry.path,
        entryOid: entry.oid,
        store,
        worktreeText,
      });
    }
  }

  return { changedLineMap, changedFiles, deletedFiles };
}

export function collectUntrackedWorkspaceChanges(repoRoot, trackedPaths, changedFiles) {
  const untrackedFiles = new Set();

  for (const relativePath of collectRepositoryFiles(repoRoot)) {
    if (!trackedPaths.has(relativePath) && !isIgnoredRelativePath(relativePath)) {
      untrackedFiles.add(relativePath);
      changedFiles.add(relativePath);
    }
  }

  return untrackedFiles;
}
