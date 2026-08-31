import { DEFAULT_SCAN_ROOTS, IGNORED_ROOT_SEGMENTS } from '../../policy/quality/quality.config.mjs';
import { collectRecursiveFiles } from '../repository/recursive-files.mjs';

export function collectRepositoryFiles(repoRoot) {
  const result = [];

  for (const root of DEFAULT_SCAN_ROOTS) {
    result.push(
      ...collectRecursiveFiles(`${repoRoot}/${root}`, {
        baseDir: repoRoot,
        ignoredSegments: IGNORED_ROOT_SEGMENTS,
      })
    );
  }

  return result.sort();
}
