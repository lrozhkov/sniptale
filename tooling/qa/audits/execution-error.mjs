import { normalizeSyncProcessResult } from '../runtime/sync-process-result.mjs';

const MAXIMUM_OUTPUT_CHARACTERS = 16 * 1024;

function boundedOutput(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.length <= MAXIMUM_OUTPUT_CHARACTERS) return text;
  const half = Math.floor((MAXIMUM_OUTPUT_CHARACTERS - 80) / 2);
  const omitted = text.length - half * 2;
  return `${text.slice(0, half)}\n... <${omitted} characters omitted> ...\n${text.slice(-half)}`;
}

function isAuditExecutionErrorKind(kind) {
  return (
    kind === 'environment-network' ||
    kind === 'tool-unavailable' ||
    kind === 'bootstrap-failed' ||
    kind === 'invalid-output' ||
    kind === 'unexpected-exit'
  );
}

function boundedMessage(value) {
  const text = String(value);
  return text.length <= 2000 ? text : `${text.slice(0, 1960)}... <message truncated>`;
}

function outputFromResult(result, key) {
  return boundedOutput(result && typeof result === 'object' ? result[key] : '');
}

function hasNetworkFailureText(text) {
  return (
    /\b(?:EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|ENOTFOUND|ETIMEDOUT|ERR_NETWORK)\b/iu.test(
      text
    ) || /\b(?:getaddrinfo|network is unreachable|socket hang up|unable to resolve)\b/iu.test(text)
  );
}

function hasNetworkFailure(result) {
  return hasNetworkFailureText(
    [outputFromResult(result, 'stderr'), outputFromResult(result, 'stdout')].join('\n')
  );
}

function failureKind(defaultKind, result) {
  return hasNetworkFailure(result) ? 'environment-network' : defaultKind;
}

export class AuditExecutionError extends Error {
  constructor(kind, message, { durationMs = null, result = null } = {}) {
    if (!isAuditExecutionErrorKind(kind)) {
      throw new TypeError(`Unknown audit execution error kind: ${String(kind)}`);
    }
    super(boundedMessage(message));
    this.name = 'AuditExecutionError';
    this.kind = kind;
    this.exitCode = Number.isInteger(result?.status) ? result.status : null;
    this.stdout = outputFromResult(result, 'stdout');
    this.stderr = outputFromResult(result, 'stderr');
    this.durationMs =
      typeof durationMs === 'number' && Number.isFinite(durationMs)
        ? Math.max(0, durationMs)
        : null;
  }
}

export function auditResultError(defaultKind, message, result) {
  return new AuditExecutionError(failureKind(defaultKind, result), message, { result });
}

export function mergeAuditCommandResults(results) {
  return {
    status: results.every((result) => result.status === 0) ? 0 : 1,
    stdout: results.map((result) => result.stdout ?? '').join('\n'),
    stderr: results.map((result) => result.stderr ?? '').join('\n'),
  };
}

export function auditCommandError(error, { tool }) {
  const code = error && typeof error === 'object' ? error.code : null;
  const kind = code === 'ENOENT' ? 'tool-unavailable' : 'bootstrap-failed';
  const message = error instanceof Error ? error.message : String(error);
  return new AuditExecutionError(kind, `${tool} failed to start: ${message}`);
}

export function normalizeAuditCommandResult(result, { tool }) {
  const normalized = normalizeSyncProcessResult(result);
  if (normalized?.error && !Number.isInteger(normalized.status)) {
    throw auditCommandError(normalized.error, { tool });
  }
  return normalized;
}

export function executeAuditCommand(runner, { tool }) {
  try {
    return normalizeAuditCommandResult(runner(), { tool });
  } catch (error) {
    if (error instanceof AuditExecutionError) throw error;
    throw auditCommandError(error, { tool });
  }
}

export function normalizeAuditFailure(error, { defaultKind = 'invalid-output' } = {}) {
  if (error instanceof AuditExecutionError) return error;
  const code = error && typeof error === 'object' ? error.code : null;
  const kind = code === 'ENOENT' ? 'tool-unavailable' : defaultKind;
  return new AuditExecutionError(kind, error instanceof Error ? error.message : String(error));
}
