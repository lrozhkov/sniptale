import fs from 'node:fs';

import { createFileContentFingerprint } from '../core/file-fingerprint.mjs';
import { resolveFocusedFiles } from '../core/focused-qa-helpers.mjs';
import { collectCodeFiles, fromRelativePath } from '../core/shared.mjs';
import {
  filterImportOnlyDiffFiles,
  filterImportOrMockOnlyDiffFiles,
} from '../core/import-only-diff.mjs';
import { collectChangedTargets } from './changed-targets.helpers.mjs';

const JS_LIKE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;

export function addBehavioralDiffScope(context) {
  const qualityCodeFiles = filterImportOrMockOnlyDiffFiles(
    filterImportOnlyDiffFiles(context.codeFiles)
  );
  const codeFileSet = new Set(context.codeFiles);
  const qualityCodeFileSet = new Set(qualityCodeFiles);
  const qualityTargetFiles = context.targetFiles.filter(
    (file) => !codeFileSet.has(file) || qualityCodeFileSet.has(file)
  );
  const qualityTargetFileSet = new Set(qualityTargetFiles);

  return {
    ...context,
    qualityCodeFiles,
    qualityJsLikeFiles: context.jsLikeFiles.filter((file) => qualityTargetFileSet.has(file)),
    qualityTargetFiles,
  };
}

export function collectCurrentDiffContext() {
  const targetFiles = resolveFocusedFiles();
  const existingTargetFiles = targetFiles.filter((file) => fs.existsSync(fromRelativePath(file)));
  const changedTargets = collectChangedTargets({ scope: 'workspace' });
  const targetFileSet = new Set(targetFiles);

  return addBehavioralDiffScope({
    targetFiles,
    existingTargetFiles,
    codeFiles: collectCodeFiles(existingTargetFiles),
    jsLikeFiles: existingTargetFiles.filter((file) => JS_LIKE_FILE_PATTERN.test(file)),
    addedFiles: [...(changedTargets.addedFiles ?? [])].filter((file) => targetFileSet.has(file)),
    untrackedFiles: [...changedTargets.untrackedFiles].filter((file) => targetFileSet.has(file)),
    fingerprint: createFileContentFingerprint(targetFiles),
  });
}
