import fs from 'node:fs';
import path from 'node:path';

import {
  ALLOWED_ENTRY_ROOT_FILES,
  ALLOWED_MANIFEST_ROOT_FILES,
  EXTENSION_TOP_LEVEL_SLICE_SET,
  RETIRED_ROOT_MESSAGE,
  RETIRED_ROOT_PATTERNS,
  RETIRED_RUNTIME_ROOT_MESSAGE,
  RETIRED_RUNTIME_ROOT_PATTERNS,
  TOP_LEVEL_SLICE_SET,
} from './verify-root-scatter.config.mjs';
import { collectRepoWideRootScatterFiles } from './verify-root-scatter-files.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  repoRoot,
  toRelativePath,
} from './shared.mjs';
import { resolveFocusedFiles } from './focused-qa-helpers.mjs';
import { isThinFacadeSource } from './verify-naming.facades.mjs';

function normalizeRelativePath(filePath) {
  return toRelativePath(filePath).replaceAll(path.sep, '/');
}

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function createRetiredRootViolation(relativePath) {
  const message = RETIRED_RUNTIME_ROOT_PATTERNS.some((pattern) => pattern.test(relativePath))
    ? RETIRED_RUNTIME_ROOT_MESSAGE
    : RETIRED_ROOT_MESSAGE;
  return createViolation('retired-root-owner-smell', relativePath, message);
}

function isRetiredRootPath(relativePath) {
  return [...RETIRED_ROOT_PATTERNS, ...RETIRED_RUNTIME_ROOT_PATTERNS].some((pattern) =>
    pattern.test(relativePath)
  );
}

function getTopLevelSliceRootFile(relativePath) {
  const segments = normalizeRelativePath(relativePath).split('/');
  if (
    segments.length === 3 &&
    segments[0] === 'src' &&
    TOP_LEVEL_SLICE_SET.has(segments[1]) &&
    segments[2].length > 0
  ) {
    return { fileName: segments[2], slice: segments[1] };
  }

  if (
    segments.length === 5 &&
    segments[0] === 'apps' &&
    segments[1] === 'extension' &&
    segments[2] === 'src' &&
    EXTENSION_TOP_LEVEL_SLICE_SET.has(segments[3]) &&
    segments[4].length > 0
  ) {
    return { fileName: segments[4], slice: segments[3] };
  }

  return null;
}

function isTopLevelSliceRootFile(relativePath) {
  return getTopLevelSliceRootFile(relativePath) !== null;
}

function classifyRootScatterFile(relativePath, absolutePath) {
  if (isRetiredRootPath(relativePath)) {
    return createRetiredRootViolation(relativePath);
  }

  const topLevelSliceRoot = getTopLevelSliceRootFile(relativePath);
  if (!topLevelSliceRoot) {
    return null;
  }

  const { fileName, slice } = topLevelSliceRoot;

  if (slice === 'test-harness') {
    return null;
  }

  if (ALLOWED_ENTRY_ROOT_FILES.has(fileName) || ALLOWED_MANIFEST_ROOT_FILES.has(relativePath)) {
    return null;
  }

  if (fs.existsSync(absolutePath) && isThinFacadeSource(absolutePath)) {
    return null;
  }

  return createRootScatterViolation(relativePath, fileName);
}

function createRootScatterViolation(relativePath, fileName) {
  if (fileName.includes('.test.') || fileName.includes('.spec.')) {
    return createViolation(
      'root-owner-test-smell',
      relativePath,
      'Move owner-local tests beside the owning module instead of keeping them at the top-level slice root.'
    );
  }

  if (/(^|[.-])(constants?|helpers?|copy|data)([.-]|$)/u.test(fileName)) {
    return createViolation(
      'root-constants-helper-smell',
      relativePath,
      [
        'Top-level slice roots must not own constants/helpers/data modules.',
        'Move this file under a canonical owner folder.',
      ].join(' ')
    );
  }

  return createViolation(
    'root-implementation-smell',
    relativePath,
    [
      'Top-level slice roots may contain only entrypoints, sanctioned thin facades,',
      'or harness roots. Move implementation behind an owner-local folder.',
    ].join(' ')
  );
}

export function collectRootScatterViolations(files, { root = repoRoot } = {}) {
  return files
    .map((filePath) => {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
      return {
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(root, absolutePath)),
      };
    })
    .filter(
      ({ relativePath, absolutePath }) =>
        fs.existsSync(absolutePath) &&
        (isTopLevelSliceRootFile(relativePath) || isRetiredRootPath(relativePath))
    )
    .map(({ relativePath, absolutePath }) => classifyRootScatterFile(relativePath, absolutePath))
    .filter(Boolean);
}

export function runRootScatterCheck({ files = [], repoWide = false, root = repoRoot } = {}) {
  const targetFiles =
    files.length > 0
      ? files
      : repoWide
        ? collectRepoWideRootScatterFiles(root)
        : resolveFocusedFiles();
  const normalizedFiles = targetFiles.map((filePath) =>
    path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
  );

  return {
    files: normalizedFiles
      .map((filePath) => normalizeRelativePath(path.relative(root, filePath)))
      .filter(
        (relativePath) => isTopLevelSliceRootFile(relativePath) || isRetiredRootPath(relativePath)
      ),
    violations: collectRootScatterViolations(normalizedFiles, { root }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const repoWide = argv.includes('--repo-wide');
  const reportOnly = argv.includes('--report-only');
  const result = runRootScatterCheck({ files, repoWide });

  if (result.violations.length > 0) {
    printViolations('Root scatter violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Root scatter check passed\n');
}
