import fs from 'node:fs';

import { DEFAULT_SCAN_ROOTS, IGNORED_ROOT_SEGMENTS } from './quality.config.mjs';
import { collectRecursiveFiles } from './recursive-files.mjs';
import {
  fromRelativePath,
  isCodeFile,
  isFormattableFile,
  isIgnoredRelativePath,
  toRelativePath,
} from './shared-paths.mjs';

function collectExplicitFiles(explicitFiles, predicate) {
  return [
    ...new Set(
      explicitFiles.map(toRelativePath).filter((file) => {
        const absolutePath = fromRelativePath(file);
        return (
          fs.existsSync(absolutePath) &&
          fs.statSync(absolutePath).isFile() &&
          predicate(file) &&
          !isIgnoredRelativePath(file)
        );
      })
    ),
  ].sort();
}

export function collectCodeFiles(explicitFiles = []) {
  if (explicitFiles.length > 0) {
    return collectExplicitFiles(explicitFiles, isCodeFile);
  }

  const result = [];
  for (const root of DEFAULT_SCAN_ROOTS) {
    result.push(
      ...collectRecursiveFiles(fromRelativePath(root), {
        baseDir: process.cwd(),
        ignoredSegments: IGNORED_ROOT_SEGMENTS,
        predicate: isCodeFile,
      })
    );
  }
  return [...new Set(result)].sort();
}

export function collectFormattableFiles(explicitFiles = []) {
  if (explicitFiles.length > 0) {
    return collectExplicitFiles(explicitFiles, isFormattableFile);
  }

  const result = [];
  result.push(
    ...collectRecursiveFiles(process.cwd(), {
      baseDir: process.cwd(),
      ignoredSegments: IGNORED_ROOT_SEGMENTS,
      predicate: isFormattableFile,
    })
  );
  return [...new Set(result)].sort();
}
