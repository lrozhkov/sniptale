import {
  collectSandboxStagedTargets,
  collectSandboxWorkspaceTargets,
} from '../core/git-fallback.mjs';
import { runGit } from './git-command.helpers.mjs';

function readDiffText({ staged }) {
  const args = ['diff', '--unified=0', '--diff-filter=ACMRD'];
  if (staged) {
    args.splice(1, 0, '--cached');
  }
  return runGit(args);
}

function splitOutput(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function readUntrackedFiles() {
  const result = runGit(['ls-files', '--others', '--exclude-standard']);

  return {
    files: splitOutput(result.stdout),
    skipped: result.skipped,
  };
}

function readNamedFiles({ diffFilter, staged }) {
  const args = ['diff', '--name-only', `--diff-filter=${diffFilter}`];
  if (staged) {
    args.splice(1, 0, '--cached');
  }
  const result = runGit(args);

  return {
    files: splitOutput(result.stdout),
    skipped: result.skipped,
  };
}

function readAddedFiles({ staged }) {
  return readNamedFiles({ diffFilter: 'A', staged });
}

function readDeletedFiles({ staged }) {
  return readNamedFiles({ diffFilter: 'D', staged });
}

function readRenamedFiles({ staged }) {
  const args = ['diff', '--name-status', '--find-renames', '--diff-filter=R'];
  if (staged) {
    args.splice(1, 0, '--cached');
  }
  const result = runGit(args);
  const entries = splitOutput(result.stdout)
    .map((line) => line.split(/\t/u))
    .filter((parts) => parts.length === 3 && /^R\d+$/u.test(parts[0] ?? ''));

  return {
    files: entries.map(([, , renamedTo]) => renamedTo),
    skipped: result.skipped,
    sources: entries.map(([, renamedFrom]) => renamedFrom),
  };
}

function addRange(target, startLine, count) {
  for (let offset = 0; offset < count; offset += 1) {
    target.add(startLine + offset);
  }
}

function parseHunkHeader(line) {
  if (!line.startsWith('@@ -')) {
    return null;
  }

  const nextRangeStart = line.indexOf(' +');
  const hunkEnd = line.indexOf(' @@', nextRangeStart);
  if (nextRangeStart === -1 || hunkEnd === -1) {
    return null;
  }

  const nextRange = line.slice(nextRangeStart + 2, hunkEnd);
  const [startText, countText] = nextRange.split(',');
  const startLine = Number(startText);
  const count = countText == null ? 1 : Number(countText);

  if (!Number.isInteger(startLine) || !Number.isInteger(count)) {
    return null;
  }

  return {
    startLine,
    count,
  };
}

export function parseChangedLineMap(diffText) {
  const changedLineMap = new Map();
  let currentFile = null;

  for (const line of diffText.split(/\r?\n/u)) {
    if (line.startsWith('+++ ')) {
      if (line === '+++ /dev/null') {
        currentFile = null;
        continue;
      }

      currentFile = line.startsWith('+++ b/') ? line.slice(6) : line.slice(4);
      if (!changedLineMap.has(currentFile)) {
        changedLineMap.set(currentFile, new Set());
      }
      continue;
    }

    const hunk = parseHunkHeader(line);
    if (hunk == null || currentFile == null || hunk.count <= 0) {
      continue;
    }

    addRange(changedLineMap.get(currentFile), hunk.startLine, hunk.count);
  }

  return changedLineMap;
}

export function mergeChangedLineMaps(...maps) {
  const merged = new Map();

  for (const map of maps) {
    for (const [file, lineNumbers] of map) {
      const target = merged.get(file) ?? new Set();
      for (const lineNumber of lineNumbers) {
        target.add(lineNumber);
      }
      merged.set(file, target);
    }
  }

  return merged;
}

export function createChangedFileTargets({
  addedFiles = [],
  deletedFiles = [],
  renamedFiles = [],
  renamedSources = [],
  stagedDiffText = '',
  unstagedDiffText = '',
  untrackedFiles = [],
} = {}) {
  const changedLineMap = mergeChangedLineMaps(
    parseChangedLineMap(stagedDiffText),
    parseChangedLineMap(unstagedDiffText)
  );
  const untrackedFileSet = new Set(untrackedFiles);
  const renamed = new Set(renamedFiles);
  const sources = new Set(renamedSources);
  for (const renamedFile of renamed) {
    if (!changedLineMap.has(renamedFile)) {
      changedLineMap.set(renamedFile, new Set());
    }
  }
  const addedFileSet = new Set(
    [...addedFiles, ...untrackedFileSet].filter((file) => !renamed.has(file))
  );
  const deletedFileSet = new Set(deletedFiles.filter((file) => !sources.has(file)));
  const changedFiles = [
    ...new Set([...changedLineMap.keys(), ...addedFileSet, ...deletedFileSet]),
  ].sort();

  return {
    addedFiles: [...addedFileSet].sort(),
    changedFiles,
    changedLineMap,
    deletedFiles: [...deletedFileSet].sort(),
    untrackedFiles: untrackedFileSet,
  };
}

function collectStagedTargets() {
  const stagedDiff = readDiffText({ staged: true });
  const stagedAddedFiles = readAddedFiles({ staged: true });
  const stagedDeletedFiles = readDeletedFiles({ staged: true });
  const stagedRenamedFiles = readRenamedFiles({ staged: true });

  return {
    ...createChangedFileTargets({
      addedFiles: stagedAddedFiles.files,
      deletedFiles: stagedDeletedFiles.files,
      renamedFiles: stagedRenamedFiles.files,
      renamedSources: stagedRenamedFiles.sources,
      stagedDiffText: stagedDiff.stdout,
    }),
    gitLookupSkipped:
      stagedDiff.skipped ||
      stagedAddedFiles.skipped ||
      stagedDeletedFiles.skipped ||
      stagedRenamedFiles.skipped,
  };
}

function collectWorkspaceTargets() {
  const stagedDiff = readDiffText({ staged: true });
  const unstagedDiff = readDiffText({ staged: false });
  const stagedAddedFiles = readAddedFiles({ staged: true });
  const unstagedAddedFiles = readAddedFiles({ staged: false });
  const stagedDeletedFiles = readDeletedFiles({ staged: true });
  const unstagedDeletedFiles = readDeletedFiles({ staged: false });
  const stagedRenamedFiles = readRenamedFiles({ staged: true });
  const unstagedRenamedFiles = readRenamedFiles({ staged: false });
  const untrackedFiles = readUntrackedFiles();

  return {
    ...createChangedFileTargets({
      addedFiles: [...stagedAddedFiles.files, ...unstagedAddedFiles.files],
      deletedFiles: [...stagedDeletedFiles.files, ...unstagedDeletedFiles.files],
      renamedFiles: [...stagedRenamedFiles.files, ...unstagedRenamedFiles.files],
      renamedSources: [...stagedRenamedFiles.sources, ...unstagedRenamedFiles.sources],
      stagedDiffText: stagedDiff.stdout,
      unstagedDiffText: unstagedDiff.stdout,
      untrackedFiles: untrackedFiles.files,
    }),
    gitLookupSkipped:
      stagedDiff.skipped ||
      unstagedDiff.skipped ||
      stagedAddedFiles.skipped ||
      unstagedAddedFiles.skipped ||
      stagedDeletedFiles.skipped ||
      unstagedDeletedFiles.skipped ||
      stagedRenamedFiles.skipped ||
      unstagedRenamedFiles.skipped ||
      untrackedFiles.skipped,
  };
}

export function collectChangedTargets({ scope = 'workspace' } = {}) {
  const nativeTargets = scope === 'staged' ? collectStagedTargets() : collectWorkspaceTargets();

  if (!nativeTargets.gitLookupSkipped) {
    return nativeTargets;
  }

  return scope === 'staged' ? collectSandboxStagedTargets() : collectSandboxWorkspaceTargets();
}
