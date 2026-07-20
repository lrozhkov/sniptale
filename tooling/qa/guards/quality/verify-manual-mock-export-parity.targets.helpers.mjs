import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath, toRelativePath } from '../../core/shared.mjs';
import {
  collectRenameSourceByTarget,
  isImportOnlyDiffFile,
  isImportOrMockOnlyDiffFile,
} from '../../core/import-only-diff.mjs';
import { PRODUCT_SOURCE_ROOTS } from '../../core/src-production-targets.mjs';
import { readHeadFileTexts } from '../../core/git-head-sources.mjs';

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SCAN_ROOTS = [...PRODUCT_SOURCE_ROOTS, 'src', 'tests', 'tooling'];
const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

export function readPreviousFile(relativePath) {
  const renameSource = collectRenameSourceByTarget().get(relativePath);
  const paths = renameSource ? [renameSource, relativePath] : [relativePath];
  const sources = readHeadFileTexts(paths);
  return (renameSource ? sources.get(renameSource) : null) ?? sources.get(relativePath) ?? null;
}

export function findPreviousMock(currentMocks, previousMocks, currentIndex) {
  const currentMock = currentMocks[currentIndex];
  const occurrence = currentMocks
    .slice(0, currentIndex)
    .filter((mock) => mock.specifier === currentMock.specifier).length;
  const matchingMocks = previousMocks.filter((mock) => mock.specifier === currentMock.specifier);
  return matchingMocks[occurrence] ?? previousMocks[currentIndex] ?? null;
}

export function filterNetNewMissingExports(currentMissing, previousMissing) {
  const previousSet = new Set(previousMissing);
  const renamedCandidates = currentMissing.filter((exportName) => !previousSet.has(exportName));
  const unchangedCount = currentMissing.length - renamedCandidates.length;
  const renameAllowance = Math.max(0, previousMissing.length - unchangedCount);
  return renamedCandidates.slice(renameAllowance);
}

function collectRecursiveFiles(relativeRoot, predicate, results = []) {
  const absoluteRoot = fromRelativePath(relativeRoot);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    return results;
  }
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) {
      collectRecursiveFiles(relativePath, predicate, results);
    } else if (entry.isFile() && predicate(relativePath)) {
      results.push(relativePath);
    }
  }
  return results;
}

function collectRepoTestFiles() {
  return SCAN_ROOTS.flatMap((root) =>
    collectRecursiveFiles(
      root,
      (file) => TEST_FILE_PATTERN.test(file) && JS_LIKE_FILE_PATTERN.test(file)
    )
  ).sort();
}

function resolveExistingModule(candidate) {
  const normalized = toRelativePath(candidate);
  const candidates = [normalized];
  if (!path.posix.extname(normalized)) {
    candidates.push(
      ...MODULE_EXTENSIONS.map((extension) => `${normalized}${extension}`),
      ...MODULE_EXTENSIONS.map((extension) => `${normalized}/index${extension}`)
    );
  }
  if (normalized.endsWith('.js')) {
    candidates.push(normalized.replace(/\.js$/u, '.ts'), normalized.replace(/\.js$/u, '.tsx'));
  }
  return (
    candidates.find((file) => {
      const absolutePath = fromRelativePath(file);
      return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    }) ?? null
  );
}

export function resolveMockedModule(testFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(testFile), specifier));
  return resolveExistingModule(candidate);
}

export function collectCandidateTestFiles(targetFiles) {
  const behavioralTargetFiles = collectMockParityTargetFiles(targetFiles);
  const changedTests = behavioralTargetFiles.filter((file) => TEST_FILE_PATTERN.test(file));
  const changedModules = behavioralTargetFiles.filter(
    (file) => JS_LIKE_FILE_PATTERN.test(file) && !TEST_FILE_PATTERN.test(file)
  );
  return [
    ...new Set([...changedTests, ...(changedModules.length > 0 ? collectRepoTestFiles() : [])]),
  ].sort();
}

export function collectMockParityTargetFiles(targetFiles) {
  return targetFiles.filter((file) => {
    if (TEST_FILE_PATTERN.test(file)) {
      return !isImportOrMockOnlyDiffFile(file);
    }

    return !isImportOnlyDiffFile(file);
  });
}
