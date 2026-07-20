import path from 'node:path';

import { isAuditObject, parseRequiredAuditJson } from './result-contract.mjs';

function describeAstGrepSchema(value) {
  if (!Array.isArray(value)) return 'root must be an array';
  for (const [index, match] of value.entries()) {
    if (
      !isAuditObject(match) ||
      typeof match.file !== 'string' ||
      match.file.length === 0 ||
      typeof match.ruleId !== 'string' ||
      match.ruleId.length === 0 ||
      !isAuditObject(match.range) ||
      !isAuditObject(match.range.start) ||
      !Number.isInteger(match.range.start.line)
    ) {
      return `match ${index} requires file, ruleId, and range.start.line`;
    }
  }
  return null;
}

export function collectAstGrepMatches(scanResults) {
  return scanResults.flatMap(({ cwd, result }) =>
    parseRequiredAuditJson(result.stdout, {
      commandResult: result,
      describeSchema: describeAstGrepSchema,
      source: 'stdout',
      tool: 'ast-grep',
    }).map((match) => ({
      ...match,
      file: path.isAbsolute(match.file) ? match.file : path.join(cwd, match.file),
    }))
  );
}
