import fs from 'node:fs';
import path from 'node:path';

import {
  ALLOWED_ENTRY_ROOT_FILES,
  ALLOWED_MANIFEST_ROOT_FILES,
  EXTENSION_TOP_LEVEL_SLICES,
  EXTENSION_TOP_LEVEL_SLICE_SET,
  RETIRED_ROOTS,
  RETIRED_ROOT_MESSAGE,
  TOP_LEVEL_SLICES,
  isRetiredRootPath,
  TOP_LEVEL_SLICE_SET,
} from './config.mjs';
import { repoRoot, toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../runtime/process/shared-cli.mjs';
import { resolveFocusedFiles } from '../../../composition/checkpoint/focused-qa-helpers.mjs';
import { isThinFacadeSource } from '../naming/facades.mjs';

function collectSliceRootFiles(root, prefix, slices) {
  return slices.flatMap((slice) => {
    const sliceRoot = path.join(root, ...prefix, slice);
    if (!fs.existsSync(sliceRoot)) return [];
    return fs
      .readdirSync(sliceRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(sliceRoot, entry.name));
  });
}

function collectFilesRecursively(absoluteRoot) {
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  return files;
}

export function collectRepoWideRootScatterFiles(root) {
  return [
    ...new Set([
      ...collectSliceRootFiles(root, ['src'], TOP_LEVEL_SLICES),
      ...collectSliceRootFiles(root, ['apps', 'extension', 'src'], EXTENSION_TOP_LEVEL_SLICES),
      ...RETIRED_ROOTS.flatMap((retiredRoot) =>
        collectFilesRecursively(path.join(root, retiredRoot))
      ),
    ]),
  ].toSorted();
}

function normalizeRelativePath(filePath) {
  return toRelativePath(filePath).replaceAll(path.sep, '/');
}

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function createRetiredRootViolation(relativePath) {
  return createViolation('retired-root-owner-smell', relativePath, RETIRED_ROOT_MESSAGE);
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

export function runRootScatterCheck({ files, root = repoRoot, scope = 'workspace' } = {}) {
  const targetFiles = Array.isArray(files)
    ? files
    : scope === 'repo-wide'
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
  const scope = argv.includes('--repo-wide') ? 'repo-wide' : 'workspace';
  const reportOnly = argv.includes('--report-only');
  const result = runRootScatterCheck({ files: files.length > 0 ? files : undefined, scope });

  if (result.violations.length > 0) {
    printViolations('Root scatter violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Root scatter check passed\n');
}
