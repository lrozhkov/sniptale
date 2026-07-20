/**
 * Diff-aware line-length verification for newly introduced or changed code.
 */

import fs from 'node:fs';

import { collectLineLengthViolations } from './line-length-utils.mjs';
import {
  filterAllowedViolations,
  fromRelativePath,
  isCodeFile,
  isExecutedAsScript,
  isIgnoredRelativePath,
  loadBaseline,
  printViolations,
  readText,
  splitLines,
} from '../../core/shared.mjs';
import { collectChangedTargets } from '../../runtime/changed-targets.helpers.mjs';

export function runLineLengthCheck({ scope = 'workspace', files = null } = {}) {
  const baseline = loadBaseline();
  const targets = collectChangedTargets({ scope });
  const scopedFiles = files == null ? null : new Set(files);
  const trackedFiles = targets.changedFiles.filter(
    (relativePath) =>
      isCodeFile(relativePath) &&
      !isIgnoredRelativePath(relativePath) &&
      fs.existsSync(fromRelativePath(relativePath)) &&
      (scopedFiles == null || scopedFiles.has(relativePath))
  );
  const violations = [];

  for (const relativePath of trackedFiles) {
    const lines = splitLines(readText(relativePath));
    const changedLineNumbers = targets.untrackedFiles.has(relativePath)
      ? null
      : targets.changedLineMap.get(relativePath);

    violations.push(
      ...collectLineLengthViolations(relativePath, lines, {
        changedLineNumbers,
      })
    );
  }

  return {
    skipped: trackedFiles.length === 0,
    gitLookupSkipped: targets.gitLookupSkipped ?? false,
    files: trackedFiles,
    violations: filterAllowedViolations(violations, baseline),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const scope = process.argv.includes('--staged') ? 'staged' : 'workspace';
  const result = runLineLengthCheck({ scope });

  if (result.skipped) {
    process.stdout.write('Line-length check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Changed-line length violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Changed-line length passed\n');
}
