import { auditResultError } from './execution-error.mjs';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function commandDetail(result) {
  if (!isObject(result)) return '';
  for (const value of [result.stderr, result.stdout]) {
    if (typeof value === 'string' && value.trim().length > 0) return `: ${value.trim()}`;
  }
  return '';
}

export function requireAuditCommandStatus(result, { statuses = [0, 1], tool }) {
  if (!isObject(result) || !Number.isInteger(result.status)) {
    throw auditResultError(
      'invalid-output',
      `${tool} returned a missing or invalid exit status`,
      result
    );
  }
  if (!statuses.includes(result.status)) {
    throw auditResultError(
      'unexpected-exit',
      `${tool} returned undocumented exit status ${result.status}${commandDetail(result)}`,
      result
    );
  }
  return result.status;
}

export function parseRequiredAuditJson(
  value,
  { commandResult = null, describeSchema, source, tool }
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw auditResultError(
      'invalid-output',
      `${tool} ${source} is required and must contain JSON`,
      commandResult
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw auditResultError(
      'invalid-output',
      `${tool} ${source} is not valid JSON${detail}`,
      commandResult
    );
  }

  const schemaProblem = describeSchema(parsed);
  if (schemaProblem) {
    throw auditResultError(
      'invalid-output',
      `${tool} ${source} has an invalid schema: ${schemaProblem}`,
      commandResult
    );
  }
  return parsed;
}

export function requireFindingStatusConsistency({
  commandResult = null,
  findingCount,
  status,
  tool,
}) {
  if (status === 0 && findingCount > 0) {
    throw auditResultError(
      'invalid-output',
      `${tool} returned clean exit status 0 with ${findingCount} finding(s)`,
      commandResult
    );
  }
  if (status === 1 && findingCount === 0) {
    throw auditResultError(
      'invalid-output',
      `${tool} returned finding exit status 1 with no actionable findings`,
      commandResult
    );
  }
}

export function isAuditObject(value) {
  return isObject(value);
}
