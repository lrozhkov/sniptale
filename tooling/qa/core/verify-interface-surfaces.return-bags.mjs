import {
  collectReturnedObjectSurfaceAdvisories,
  collectReturnedObjectSurfaceViolations,
} from './verify-interface-surfaces.return-bags.helpers.mjs';
import { collectCodeFiles, toRelativePath } from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function isProductionLikeFile(relativePath) {
  return !relativePath.includes('.test.') && !relativePath.includes('.spec.');
}

export function runReturnedObjectSurfaceAdvisoryCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });
  const advisoryFiles =
    scope === 'repo-wide'
      ? targetFiles.filter((filePath) => isProductionLikeFile(toRelativePath(filePath)))
      : targetFiles;
  const getPreviousSource = scope === 'repo-wide' ? () => null : null;

  return {
    skipped: advisoryFiles.length === 0,
    files: advisoryFiles.map(toRelativePath),
    advisories: collectReturnedObjectSurfaceAdvisories(advisoryFiles, { getPreviousSource }),
  };
}

export function runReturnedObjectSurfaceCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });
  const blockingFiles =
    scope === 'repo-wide'
      ? targetFiles.filter((filePath) => isProductionLikeFile(toRelativePath(filePath)))
      : targetFiles;
  const getPreviousSource = scope === 'repo-wide' ? () => null : null;

  return {
    skipped: blockingFiles.length === 0,
    files: blockingFiles.map(toRelativePath),
    violations: collectReturnedObjectSurfaceViolations(blockingFiles, { getPreviousSource }),
  };
}

export function runRepoWideReturnedObjectSurfaceCheck() {
  return runReturnedObjectSurfaceCheck({ scope: 'repo-wide' });
}

export {
  collectReturnedObjectSurfaceAdvisories,
  collectReturnedObjectSurfaceViolations,
} from './verify-interface-surfaces.return-bags.helpers.mjs';
