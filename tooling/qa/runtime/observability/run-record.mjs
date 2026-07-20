import { parseStep } from './schema.mjs';

export function isoTimestamp(clock) {
  return new Date(clock()).toISOString();
}

export function elapsedMilliseconds(startedAt, finishedAt) {
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

export function emptySummary() {
  return {
    stepCount: 0,
    passed: 0,
    problemsFound: 0,
    skipped: 0,
    errors: 0,
    interrupted: 0,
    problemCount: 0,
    problemIds: [],
  };
}

export function summarizeSteps(steps) {
  const summary = emptySummary();
  const outcomeFields = {
    passed: 'passed',
    'problems-found': 'problemsFound',
    skipped: 'skipped',
    error: 'errors',
    interrupted: 'interrupted',
  };
  summary.stepCount = steps.length;
  for (const step of steps) summary[outcomeFields[step.outcome]] += 1;
  summary.problemIds = [...new Set(steps.flatMap((step) => step.problemIds))].sort();
  summary.problemCount = summary.problemIds.length;
  return summary;
}

export function createStep(input, clock) {
  const measuredDuration = input.durationMs ?? null;
  const fallbackFinishedAt = isoTimestamp(clock);
  const finishedAt =
    input.finishedAt ??
    (input.startedAt && measuredDuration !== null
      ? new Date(Date.parse(input.startedAt) + measuredDuration).toISOString()
      : fallbackFinishedAt);
  const startedAt =
    input.startedAt ??
    (measuredDuration === null
      ? finishedAt
      : new Date(Date.parse(finishedAt) - measuredDuration).toISOString());
  return parseStep({
    stepId: input.stepId,
    outcome: input.outcome,
    startedAt,
    finishedAt,
    durationMs: measuredDuration ?? elapsedMilliseconds(startedAt, finishedAt),
    controlIds: [...new Set(input.controlIds ?? [])].sort(),
    problemIds: [...new Set(input.problemIds ?? [])].sort(),
    skipReasonId: input.skipReasonId ?? null,
    diagnostic: input.diagnostic ?? null,
  });
}

export function resolveFinalStatus(steps, requestedStatus) {
  if (requestedStatus === 'interrupted') return 'interrupted';
  if (requestedStatus && requestedStatus !== 'running') return requestedStatus;
  return steps.some((step) => ['problems-found', 'error', 'interrupted'].includes(step.outcome))
    ? 'problems-found'
    : 'all-passed';
}

export function resolveExitCode(status, requestedExitCode) {
  if (requestedExitCode !== undefined) return requestedExitCode;
  return ['all-passed', 'skipped'].includes(status) ? 0 : 1;
}
