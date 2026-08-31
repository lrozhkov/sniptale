/**
 * Sandbox-safe git state reconstruction used by quality gates when `spawnSync()` is blocked.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  GitObjectStore,
  hashGitBlob,
  readGitIndexEntries,
  readHeadTreeMap,
} from './git-object-store.mjs';
import { isIgnoredRelativePath } from '../repository/shared-paths.mjs';
import {
  collectChangedLinesAgainstWorktree,
  collectChangedLinesFromStore,
} from './git-fallback-diff.mjs';
import { collectRepositoryFiles } from './git-fallback-repository.mjs';

export { collectChangedLineNumbers } from './git-fallback-diff.mjs';

function collectTrackedWorkspaceChanges(repoRoot, entries, headTreeMap, store) {
  const changedLineMap = new Map();
  const changedFiles = new Set();
  const deletedFiles = new Set();

  for (const entry of entries) {
    if (isIgnoredRelativePath(entry.path)) continue;

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

    const worktreeText = fs.readFileSync(absolutePath, 'utf8');
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

function collectUntrackedWorkspaceChanges(repoRoot, trackedPaths, changedFiles) {
  const untrackedFiles = new Set();

  for (const relativePath of collectRepositoryFiles(repoRoot)) {
    if (!trackedPaths.has(relativePath) && !isIgnoredRelativePath(relativePath)) {
      untrackedFiles.add(relativePath);
      changedFiles.add(relativePath);
    }
  }

  return untrackedFiles;
}

export function collectSandboxStagedFiles(repoRoot = process.cwd()) {
  const headTreeMap = readHeadTreeMap(repoRoot);

  return readGitIndexEntries(repoRoot)
    .filter((entry) => !isIgnoredRelativePath(entry.path))
    .filter((entry) => headTreeMap.get(entry.path)?.oid !== entry.oid)
    .map((entry) => entry.path)
    .sort();
}

export function collectSandboxStagedTargets(repoRoot = process.cwd()) {
  const indexEntries = readGitIndexEntries(repoRoot);
  const headTreeMap = readHeadTreeMap(repoRoot);
  const store = new GitObjectStore(repoRoot);
  const changedLineMap = new Map();
  const changedFiles = [];
  const deletedFiles = [];
  const indexPaths = new Set(indexEntries.map((entry) => entry.path));

  for (const entry of indexEntries) {
    if (isIgnoredRelativePath(entry.path)) {
      continue;
    }

    const headEntry = headTreeMap.get(entry.path);
    if (headEntry?.oid === entry.oid) {
      continue;
    }

    changedFiles.push(entry.path);
    collectChangedLinesFromStore({
      changedLineMap,
      filePath: entry.path,
      beforeOid: headEntry?.oid ?? null,
      afterOid: entry.oid,
      store,
    });
  }

  for (const headPath of headTreeMap.keys()) {
    if (!indexPaths.has(headPath) && !isIgnoredRelativePath(headPath)) {
      changedFiles.push(headPath);
      deletedFiles.push(headPath);
    }
  }

  return {
    changedFiles: changedFiles.sort(),
    changedLineMap,
    deletedFiles: deletedFiles.sort(),
    untrackedFiles: new Set(),
    gitLookupSkipped: false,
  };
}

export function collectSandboxWorkspaceTargets(repoRoot = process.cwd()) {
  const indexEntries = readGitIndexEntries(repoRoot).filter(
    (entry) => !isIgnoredRelativePath(entry.path)
  );
  const headTreeMap = readHeadTreeMap(repoRoot);
  const store = new GitObjectStore(repoRoot);
  const trackedChanges = collectTrackedWorkspaceChanges(repoRoot, indexEntries, headTreeMap, store);
  const trackedPaths = new Set(indexEntries.map((entry) => entry.path));
  for (const [headPath, headEntry] of headTreeMap) {
    if (
      headEntry.mode !== '040000' &&
      !trackedPaths.has(headPath) &&
      !isIgnoredRelativePath(headPath)
    ) {
      trackedChanges.changedFiles.add(headPath);
      trackedChanges.deletedFiles.add(headPath);
    }
  }
  const untrackedFiles = collectUntrackedWorkspaceChanges(
    repoRoot,
    trackedPaths,
    trackedChanges.changedFiles
  );

  return {
    changedFiles: [...trackedChanges.changedFiles].sort(),
    changedLineMap: trackedChanges.changedLineMap,
    deletedFiles: [...trackedChanges.deletedFiles].sort(),
    untrackedFiles,
    gitLookupSkipped: false,
  };
}
