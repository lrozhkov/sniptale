/**
 * Sandbox-safe git state reconstruction used by quality gates when `spawnSync()` is blocked.
 */

import { GitObjectStore, readGitIndexEntries, readHeadTreeMap } from './git-object-store.mjs';
import { isIgnoredRelativePath } from './shared-paths.mjs';
import { collectChangedLinesFromStore } from './git-fallback-diff.mjs';
import {
  collectTrackedWorkspaceChanges,
  collectUntrackedWorkspaceChanges,
} from './git-fallback-workspace.mjs';

export { collectChangedLineNumbers } from './git-fallback-diff.mjs';

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
