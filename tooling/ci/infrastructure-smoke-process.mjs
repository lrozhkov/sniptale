const SAFE_PROCESS_TOKEN = /^[A-Za-z0-9_-]{1,32}$/u;

function safeProcessToken(value) {
  const token = String(value ?? 'unknown');
  return SAFE_PROCESS_TOKEN.test(token) ? token : 'unknown';
}

export function isAcceptedDockerResult(result, acceptedStatuses = [0]) {
  return (
    result.error == null &&
    result.signal == null &&
    Number.isInteger(result.status) &&
    acceptedStatuses.includes(result.status)
  );
}

export function getInfrastructureSmokeTimeoutMs(id) {
  if (id === 'node') return 180_000;
  if (id === 'semgrep') return 90_000;
  return 30_000;
}

export function describeDockerFailure(result, timeoutMs) {
  if (result.error?.code === 'ETIMEDOUT') return `timed out after ${timeoutMs}ms`;
  if (result.error)
    return `spawn error ${safeProcessToken(result.error.code ?? result.error.name)}`;
  if (result.signal) return `signal ${safeProcessToken(result.signal)}`;
  return `exit ${Number.isInteger(result.status) ? result.status : 'unknown'}`;
}
