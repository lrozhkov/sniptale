import { formatDuration } from '../runtime/run-metrics.helpers.mjs';

function normalizeDuration(durationMs) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return 0;
  }

  return Math.max(0, durationMs);
}

export function formatStepDetail(detail = '', durationMs) {
  const duration = formatDuration(normalizeDuration(durationMs));
  return detail ? `${detail}; ${duration}` : duration;
}

export function formatStepSummary(summary = 'failed', durationMs) {
  return `${summary} (${formatDuration(normalizeDuration(durationMs))})`;
}

export function withStepDuration(step, durationMs) {
  return {
    ...step,
    durationMs: normalizeDuration(durationMs),
  };
}

export function measureSyncStep(runner) {
  const startedAtMs = Date.now();
  const value = runner();
  return {
    durationMs: Date.now() - startedAtMs,
    value,
  };
}

export async function measureAsyncStep(runner) {
  const startedAtMs = Date.now();
  const value = await runner();
  return {
    durationMs: Date.now() - startedAtMs,
    value,
  };
}

export function timeSyncStep(runner) {
  const { durationMs, value } = measureSyncStep(runner);
  return withStepDuration(value, durationMs);
}

export async function timeAsyncStep(runner) {
  const { durationMs, value } = await measureAsyncStep(runner);
  return withStepDuration(value, durationMs);
}
