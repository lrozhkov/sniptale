/**
 * Pure helpers for diff-aware changed-line readability checks.
 */

import { QUALITY_LIMITS } from '../../core/quality.config.mjs';
import { isDataCarrierFile } from '../../core/shared.mjs';

const GENERATED_DATA_FIXTURE_PATTERN =
  /(?:(?:^|\/)(?:generated|fixtures?|snapshots?)(?:\/|\.)|\.(?:snap|snapshot|fixture|generated)\.[cm]?[jt]sx?$)/u;

function isStaticModuleSpecifierLine(line) {
  const trimmed = line.trim();
  if (/\b(?:import|require)\s*\(\s*(['"])[^'"]+\1\s*\)/u.test(trimmed)) return true;
  const sourceMatch = trimmed.match(/(['"])[^'"]+\1;?$/u);
  if (!sourceMatch || sourceMatch.index === undefined) return false;
  const prefix = trimmed.slice(0, sourceMatch.index).trimEnd();
  return (
    prefix.startsWith('import ') ||
    (prefix.startsWith('export ') && prefix.endsWith(' from')) ||
    prefix === '} from'
  );
}

function isClassifiedLongLiteral(line) {
  return (
    /(?:https?:\/\/|data:[^,]+,|\b(?:sha256|signature|digest|snapshot)\b)/iu.test(line) ||
    /\/[^/\n]{80,}\/[dgimsuvy]*/u.test(line) ||
    /\b[0-9a-f]{64,}\b/iu.test(line)
  );
}

function resolveLineLimit(relativePath, line) {
  if (isDataCarrierFile(relativePath) || GENERATED_DATA_FIXTURE_PATTERN.test(relativePath)) {
    return QUALITY_LIMITS.maxGeneratedDataLineLength;
  }
  if (isStaticModuleSpecifierLine(line)) return QUALITY_LIMITS.maxModuleSpecifierLength;
  if (isClassifiedLongLiteral(line)) return QUALITY_LIMITS.maxClassifiedLiteralLength;
  return QUALITY_LIMITS.maxLineLength;
}

/**
 * Collect `max-line-length` violations for the relevant changed lines in a file.
 */
export function collectLineLengthViolations(
  relativePath,
  lines,
  { changedLineNumbers = null, maxLineLength = QUALITY_LIMITS.maxLineLength } = {}
) {
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
    const resolvedLimit =
      maxLineLength === QUALITY_LIMITS.maxLineLength
        ? resolveLineLimit(relativePath, line)
        : maxLineLength;
    if (line.length <= resolvedLimit) {
      continue;
    }

    violations.push({
      rule: 'max-line-length',
      file: relativePath,
      line: lineNumber,
      message: `has ${line.length} characters on a changed line (limit ${resolvedLimit})`,
    });
  }

  return violations;
}
