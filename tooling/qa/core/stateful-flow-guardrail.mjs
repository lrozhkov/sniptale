import { toRelativePath } from './shared.mjs';
import { collectStatefulFlowFindings } from './verify-advisory.stateful-flow.helpers.mjs';

function createViolation(rule, file, line, reason) {
  return {
    rule,
    file,
    line,
    message: reason,
  };
}

export function collectStatefulFlowFamilyViolations(files, { family, rule }) {
  return files.flatMap((filePath) =>
    collectStatefulFlowFindings(filePath, (input) => input)
      .filter((finding) => finding.family === family)
      .map((finding) =>
        createViolation(rule, toRelativePath(filePath), finding.line, finding.reason)
      )
  );
}
