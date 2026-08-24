import { ACTIVITY_STATES, ACTIVITY_WAIT_REASONS } from './constants.mjs';
import {
  assertExactKeys,
  assertId,
  assertIsoTimestamp,
  assertNonNegativeInteger,
  assertNonNegativeNumber,
  assertObject,
  assertStringArray,
} from './schema-assertions.mjs';

const TERMINAL_STATES = new Set(['completed', 'failed', 'skipped', 'interrupted']);
const PROFILE_KEYS = [
  'cpuTokens',
  'memoryMiB',
  'workers',
  'pid',
  'workerId',
  'checkerCount',
  'toolName',
  'toolVersion',
];
const ACTIVITY_KEYS = [
  'activityId',
  'kind',
  'state',
  'queuedAt',
  'startedAt',
  'finishedAt',
  'durationMs',
  'queueDurationMs',
  'dependencies',
  'waitReasons',
  'waitDurations',
  'executionProfile',
  'reused',
];
const EVENT_KEYS = ['sequence', 'activityId', 'state', 'at'];
const WAIT_DURATION_KEYS = ['dependencyMs', 'resourceTokensMs', 'concurrencyLimitMs'];

function nullableNonNegativeInteger(value, label) {
  if (value !== null) assertNonNegativeInteger(value, label);
}

function parseExecutionProfile(value) {
  assertObject(value, 'activity.executionProfile');
  assertExactKeys(value, PROFILE_KEYS, 'activity.executionProfile');
  nullableNonNegativeInteger(value.cpuTokens, 'activity.executionProfile.cpuTokens');
  nullableNonNegativeInteger(value.memoryMiB, 'activity.executionProfile.memoryMiB');
  nullableNonNegativeInteger(value.workers, 'activity.executionProfile.workers');
  nullableNonNegativeInteger(value.pid, 'activity.executionProfile.pid');
  if (value.workerId !== null) assertId(value.workerId, 'activity.executionProfile.workerId');
  if (value.checkerCount != null) {
    assertNonNegativeInteger(value.checkerCount, 'activity.executionProfile.checkerCount');
  }
  for (const key of ['toolName', 'toolVersion']) {
    if (value[key] != null && (typeof value[key] !== 'string' || value[key].length === 0)) {
      throw new TypeError(`activity.executionProfile.${key} must be a non-empty string or null`);
    }
  }
  return {
    ...value,
    checkerCount: value.checkerCount ?? null,
    toolName: value.toolName ?? null,
    toolVersion: value.toolVersion ?? null,
  };
}

function parseActivity(value) {
  assertObject(value, 'activity');
  assertExactKeys(value, ACTIVITY_KEYS, 'activity');
  assertId(value.activityId, 'activity.activityId');
  assertId(value.kind, 'activity.kind');
  if (!ACTIVITY_STATES.includes(value.state)) throw new TypeError('activity.state is invalid');
  assertIsoTimestamp(value.queuedAt, 'activity.queuedAt');
  assertIsoTimestamp(value.startedAt, 'activity.startedAt', { nullable: true });
  assertIsoTimestamp(value.finishedAt, 'activity.finishedAt', { nullable: true });
  assertNonNegativeNumber(value.durationMs, 'activity.durationMs', { nullable: true });
  assertNonNegativeNumber(value.queueDurationMs, 'activity.queueDurationMs', { nullable: true });
  assertStringArray(value.dependencies, 'activity.dependencies');
  assertStringArray(value.waitReasons, 'activity.waitReasons');
  if (value.waitReasons.some((reason) => !ACTIVITY_WAIT_REASONS.includes(reason))) {
    throw new TypeError('activity.waitReasons contains an invalid reason');
  }
  if (typeof value.reused !== 'boolean') throw new TypeError('activity.reused must be boolean');
  assertObject(value.waitDurations, 'activity.waitDurations');
  assertExactKeys(value.waitDurations, WAIT_DURATION_KEYS, 'activity.waitDurations');
  for (const key of WAIT_DURATION_KEYS) {
    assertNonNegativeNumber(value.waitDurations[key], `activity.waitDurations.${key}`);
  }
  if (value.startedAt !== null) {
    const queueDurationMs = Date.parse(value.startedAt) - Date.parse(value.queuedAt);
    if (queueDurationMs !== value.queueDurationMs) {
      throw new TypeError('activity.queueDurationMs must match its timestamp interval');
    }
  } else if (value.finishedAt !== null) {
    const queueDurationMs = Date.parse(value.finishedAt) - Date.parse(value.queuedAt);
    if (queueDurationMs !== value.queueDurationMs) {
      throw new TypeError('unstarted activity queueDurationMs must end at its terminal decision');
    }
  } else if (value.queueDurationMs !== null) {
    throw new TypeError('queued activity cannot have queueDurationMs');
  }
  if (value.finishedAt !== null) {
    const durationMs =
      value.startedAt === null ? 0 : Date.parse(value.finishedAt) - Date.parse(value.startedAt);
    if (durationMs !== value.durationMs) {
      throw new TypeError('activity.durationMs must match its execution interval');
    }
  } else if (value.durationMs !== null) {
    throw new TypeError('unfinished activity cannot have durationMs');
  }
  if (TERMINAL_STATES.has(value.state) !== (value.finishedAt !== null)) {
    throw new TypeError('activity terminal state and finishedAt are inconsistent');
  }
  return {
    ...value,
    dependencies: [...value.dependencies],
    waitReasons: [...new Set(value.waitReasons)].sort(),
    waitDurations: { ...value.waitDurations },
    executionProfile: parseExecutionProfile(value.executionProfile),
  };
}

function parseEvent(value, expectedSequence) {
  assertObject(value, 'timeline event');
  assertExactKeys(value, EVENT_KEYS, 'timeline event');
  assertNonNegativeInteger(value.sequence, 'timeline event.sequence');
  if (value.sequence !== expectedSequence) throw new TypeError('timeline event sequence drifted');
  assertId(value.activityId, 'timeline event.activityId');
  if (!ACTIVITY_STATES.includes(value.state))
    throw new TypeError('timeline event.state is invalid');
  assertIsoTimestamp(value.at, 'timeline event.at');
  return { ...value };
}

export function parseTimeline(value) {
  assertObject(value, 'timeline');
  assertExactKeys(value, ['events', 'activities'], 'timeline');
  if (!Array.isArray(value.events) || !Array.isArray(value.activities)) {
    throw new TypeError('timeline events and activities must be arrays');
  }
  const events = value.events.map((event, index) => parseEvent(event, index));
  for (let index = 1; index < events.length; index += 1) {
    if (Date.parse(events[index].at) < Date.parse(events[index - 1].at)) {
      throw new TypeError('timeline event timestamps must be monotonic');
    }
  }
  const activities = value.activities.map(parseActivity);
  const ids = new Set(activities.map(({ activityId }) => activityId));
  if (ids.size !== activities.length) throw new TypeError('timeline activity ids must be unique');
  if (events.some(({ activityId }) => !ids.has(activityId))) {
    throw new TypeError('timeline event references an unknown activity');
  }
  for (const activity of activities) {
    if (activity.dependencies.some((dependency) => !ids.has(dependency))) {
      throw new TypeError('timeline activity references an unknown dependency');
    }
    const activityEvents = events.filter(({ activityId }) => activityId === activity.activityId);
    const states = activityEvents.map(({ state }) => state);
    if (states[0] !== 'queued' || states.at(-1) !== activity.state) {
      throw new TypeError('timeline activity events are incomplete');
    }
    const expectedStates =
      activity.state === 'queued'
        ? ['queued']
        : activity.state === 'started'
          ? ['queued', 'started']
          : activity.startedAt === null
            ? ['queued', activity.state]
            : ['queued', 'started', activity.state];
    if (JSON.stringify(states) !== JSON.stringify(expectedStates)) {
      throw new TypeError('timeline activity state transitions are invalid');
    }
    if (
      activityEvents[0].at !== activity.queuedAt ||
      (activity.startedAt !== null && activityEvents[1].at !== activity.startedAt) ||
      (activity.finishedAt !== null && activityEvents.at(-1).at !== activity.finishedAt)
    ) {
      throw new TypeError('timeline activity timestamps drifted from its events');
    }
  }
  const byId = new Map(activities.map((activity) => [activity.activityId, activity]));
  const visited = new Set();
  const visiting = new Set();
  function visit(activityId) {
    if (visited.has(activityId)) return;
    if (visiting.has(activityId)) throw new TypeError('timeline dependencies must be acyclic');
    visiting.add(activityId);
    for (const dependency of byId.get(activityId).dependencies) visit(dependency);
    visiting.delete(activityId);
    visited.add(activityId);
  }
  for (const activity of activities) visit(activity.activityId);
  return { events, activities };
}
