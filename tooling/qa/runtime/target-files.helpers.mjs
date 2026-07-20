import fs from 'node:fs';

import {
  collectCodeFiles,
  fromRelativePath,
  isCodeFile,
  isIgnoredRelativePath,
} from '../core/shared.mjs';
import { collectChangedTargets } from './changed-targets.helpers.mjs';

function isChangedCodeFile(relativePath) {
  return isCodeFile(relativePath) && !isIgnoredRelativePath(relativePath);
}

export function collectChangedCodeTargets({
  scope = 'workspace',
  relativeFilter = () => true,
} = {}) {
  const targets = collectChangedTargets({ scope });
  const files = targets.changedFiles.filter(
    (relativePath) =>
      isChangedCodeFile(relativePath) &&
      fs.existsSync(fromRelativePath(relativePath)) &&
      relativeFilter(relativePath)
  );

  return {
    ...targets,
    files,
  };
}

export function resolveScopedTargetFiles({
  files = [],
  scope = 'workspace',
  collectFiles = collectCodeFiles,
  relativeFilter = () => true,
} = {}) {
  const hasExplicitFiles = files.length > 0;
  const explicitRelativeFiles = hasExplicitFiles ? collectFiles(files).filter(relativeFilter) : [];

  if (hasExplicitFiles) {
    return {
      skipped: explicitRelativeFiles.length === 0,
      relativeFiles: explicitRelativeFiles,
      files: explicitRelativeFiles.map(fromRelativePath),
    };
  }

  if (scope === 'repo-wide') {
    const repoWideRelativeFiles = collectFiles().filter(relativeFilter);
    return {
      skipped: repoWideRelativeFiles.length === 0,
      relativeFiles: repoWideRelativeFiles,
      files: repoWideRelativeFiles.map(fromRelativePath),
    };
  }

  const workspaceRelativeFiles = collectChangedCodeTargets({ scope, relativeFilter }).files;
  return {
    skipped: workspaceRelativeFiles.length === 0,
    relativeFiles: workspaceRelativeFiles,
    files: workspaceRelativeFiles.map(fromRelativePath),
  };
}
