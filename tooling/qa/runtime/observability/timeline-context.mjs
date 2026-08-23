import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function withObservabilityTimeline(session, runner) {
  return storage.run({ activityId: null, session }, runner);
}

export function withTimelineActivity(activityId, runner) {
  const current = storage.getStore();
  if (!current) return runner();
  return storage.run({ ...current, activityId }, runner);
}

export function currentTimelineActivityId() {
  return storage.getStore()?.activityId ?? null;
}

export function recordTimelineTransition(input) {
  return storage.getStore()?.session?.recordActivityTransition(input) ?? null;
}

export function updateTimelineExecutionProfile(activityId, executionProfile) {
  return storage.getStore()?.session?.updateActivityExecutionProfile(activityId, executionProfile);
}

function terminalState(value) {
  if (Array.isArray(value)) {
    if (value.some((item) => item?.status === 'failed')) return 'failed';
    if (value.length > 0 && value.every((item) => ['skipped', 'blocked'].includes(item?.status))) {
      return 'skipped';
    }
    return 'completed';
  }
  if (typeof value?.status === 'number') return value.status === 0 ? 'completed' : 'failed';
  if (typeof value?.exitCode === 'number') return value.exitCode === 0 ? 'completed' : 'failed';
  if (value?.status === 'failed') return 'failed';
  if (value?.status === 'skipped' || value?.status === 'blocked') return 'skipped';
  return 'completed';
}

function completeTimelineActivity(input, value) {
  recordTimelineTransition({
    activityId: input.activityId,
    kind: input.kind,
    state: terminalState(value),
  });
  return value;
}

function failTimelineActivity(input, error) {
  recordTimelineTransition({ activityId: input.activityId, kind: input.kind, state: 'failed' });
  throw error;
}

export async function runTimelineActivity(input, runner) {
  recordTimelineTransition({ ...input, state: 'queued' });
  recordTimelineTransition({ activityId: input.activityId, kind: input.kind, state: 'started' });
  try {
    return completeTimelineActivity(input, await runner());
  } catch (error) {
    return failTimelineActivity(input, error);
  }
}

export function runTimelineActivitySync(input, runner) {
  recordTimelineTransition({ ...input, state: 'queued' });
  recordTimelineTransition({ activityId: input.activityId, kind: input.kind, state: 'started' });
  try {
    return completeTimelineActivity(input, runner());
  } catch (error) {
    return failTimelineActivity(input, error);
  }
}

export function recordSkippedTimelineActivity(input) {
  recordTimelineTransition({ ...input, state: 'queued' });
  recordTimelineTransition({ activityId: input.activityId, kind: input.kind, state: 'skipped' });
}
