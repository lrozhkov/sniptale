/**
 * Pure helpers for diff-aware changed-line readability checks.
 */

import { QUALITY_LIMITS } from '../../core/quality.config.mjs';
import { isDataCarrierFile } from '../../core/shared.mjs';

/**
 * Collect `max-line-length` violations for the relevant changed lines in a file.
 */
export function collectLineLengthViolations(
  relativePath,
  lines,
  { changedLineNumbers = null, maxLineLength = QUALITY_LIMITS.maxLineLength } = {}
) {
  if (isDataCarrierFile(relativePath)) {
    return [];
  }

  const candidateLineNumbers =
    changedLineNumbers == null
      ? lines.map((_, index) => index + 1)
      : [...new Set(changedLineNumbers)]
          .filter(
            (lineNumber) =>
              Number.isInteger(lineNumber) && lineNumber > 0 && lineNumber <= lines.length
          )
          .sort((left, right) => left - right);

  const violations = [];

  for (const lineNumber of candidateLineNumbers) {
    const line = lines[lineNumber - 1];
    if (line.length <= maxLineLength) {
      continue;
    }

    violations.push({
      rule: 'max-line-length',
      file: relativePath,
      line: lineNumber,
      message: `has ${line.length} characters on a changed line (limit ${maxLineLength})`,
    });
  }

  return violations;
}
