import fs from 'node:fs';

import { createFileContentFingerprint } from '../core/file-fingerprint.mjs';
import { resolveFocusedFiles } from '../core/focused-qa-helpers.mjs';
import { collectCodeFiles, fromRelativePath } from '../core/shared.mjs';
import { collectChangedTargets } from './changed-targets.helpers.mjs';

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;

export function collectCurrentDiffContext() {
  const targetFiles = resolveFocusedFiles();
  const existingTargetFiles = targetFiles.filter((file) => fs.existsSync(fromRelativePath(file)));
  const changedTargets = collectChangedTargets({ scope: 'workspace' });
  const targetFileSet = new Set(targetFiles);

  return {
    targetFiles,
    existingTargetFiles,
    codeFiles: collectCodeFiles(existingTargetFiles),
    jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
    addedFiles: [...(changedTargets.addedFiles ?? [])].filter((file) => targetFileSet.has(file)),
    untrackedFiles: [...changedTargets.untrackedFiles].filter((file) => targetFileSet.has(file)),
    fingerprint: createFileContentFingerprint(targetFiles),
  };
}
