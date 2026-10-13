import { sanitizeLogText } from '../../runtime/observability/sanitize.mjs';

function* outputLines(text) {
  let offset = 0;
  while (offset < text.length) {
    const end = text.indexOf('\n', offset);
    yield text.slice(offset, end < 0 ? undefined : end);
    if (end < 0) break;
    offset = end + 1;
  }
}

/** Read source locations from the supported text formats. Keep other output in the run log. */
export function collectProcessDiagnosticLocations(step) {
  if (!['Oxlint', 'ESLint', 'Typecheck', 'Unit tests'].includes(step.label)) return [];
  const locations = [];
  for (const stream of [step.stdout, step.stderr]) {
    if (typeof stream !== 'string') continue;
    let pendingTest = null;
    let remainingReasonLines = 0;
    for (const rawLine of outputLines(stream)) {
      if (locations.length >= 100 && !pendingTest) break;
      const line = (
        rawLine.includes(String.fromCharCode(27)) ? sanitizeLogText(rawLine) : rawLine
      ).trim();
      if (
        pendingTest &&
        remainingReasonLines-- > 0 &&
        /^(?:\w*Error:|AssertionError:)/u.test(line)
      ) {
        pendingTest.message += `: ${line}`;
        pendingTest = null;
      }
      if (remainingReasonLines <= 0) pendingTest = null;
      if (locations.length >= 100) continue;
      const source = line.match(
        /^((?:[A-Za-z]:[\\/])?[^:\r\n]+?\.[cm]?[jt]sx?)(?::(\d+):(\d+)|\((\d+),(\d+)\))(?::\s*|\s+-\s+)(.+)$/u
      );
      if (source) {
        const sourceLine = Number(source[2] ?? source[4]);
        if (Number.isSafeInteger(sourceLine) && sourceLine > 0) {
          locations.push({ file: source[1], line: sourceLine, message: source[6] });
        }
        continue;
      }
      const test =
        step.label === 'Unit tests'
          ? line.match(/^FAIL\s+(.+?\.[cm]?[jt]sx?)(?:\s+>\s+(.+)|\s+\[.+\])$/u)
          : null;
      if (test) {
        pendingTest = { file: test[1], line: null, message: test[2] ?? 'Test suite failed' };
        remainingReasonLines = 8;
        locations.push(pendingTest);
      }
    }
  }
  return locations;
}
