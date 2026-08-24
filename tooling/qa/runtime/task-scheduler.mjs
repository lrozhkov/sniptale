function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function normalizeTasks(tasks, profile) {
  const ids = new Set();
  return tasks.map((task, order) => {
    if (!task || typeof task !== 'object' || typeof task.id !== 'string' || task.id === '') {
      throw new Error('Every scheduled QA task must have a non-empty id.');
    }
    if (ids.has(task.id)) throw new Error(`Duplicate scheduled QA task id: ${task.id}`);
    ids.add(task.id);
    assertPositiveInteger(task.cpuTokens, `${task.id} cpuTokens`);
    assertPositiveInteger(task.memoryMiB, `${task.id} memoryMiB`);
    if (task.cpuTokens > profile.cpuTokens || task.memoryMiB > profile.memoryMiB) {
      throw new Error(
        `${task.id} requires ${task.cpuTokens} CPU/${task.memoryMiB} MiB but the QA profile allows ` +
          `${profile.cpuTokens} CPU/${profile.memoryMiB} MiB.`
      );
    }
    if (typeof task.run !== 'function') throw new Error(`${task.id} must provide a run function.`);
    const dependencies = [...new Set(task.dependencies ?? [])];
    if (dependencies.some((dependency) => typeof dependency !== 'string' || dependency === '')) {
      throw new Error(`${task.id} dependencies must be non-empty task ids.`);
    }
    return { ...task, dependencies, order, exclusive: task.exclusive === true };
  });
}

function timelineLaneId(schedulerId, taskId) {
  const segment = taskId.replaceAll(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
  return `${schedulerId}.lane.${segment}`;
}

function canStart(task, active, usage, profile, completedIds) {
  if (task.dependencies.some((dependency) => !completedIds.has(dependency))) return false;
  if (task.exclusive) return active.size === 0;
  if ([...active.values()].some(({ task: activeTask }) => activeTask.exclusive)) return false;
  return (
    usage.cpuTokens + task.cpuTokens <= profile.cpuTokens &&
    usage.memoryMiB + task.memoryMiB <= profile.memoryMiB
  );
}

function waitReasons(task, active, usage, profile, completedIds) {
  if (task.dependencies.some((dependency) => !completedIds.has(dependency))) {
    return ['dependency'];
  }
  if (
    task.exclusive ? active.size > 0 : [...active.values()].some(({ task: item }) => item.exclusive)
  ) {
    return ['concurrency-limit'];
  }
  if (
    usage.cpuTokens + task.cpuTokens > profile.cpuTokens ||
    usage.memoryMiB + task.memoryMiB > profile.memoryMiB
  ) {
    return ['resource-tokens'];
  }
  return [];
}

const WAIT_DURATION_FIELDS = {
  dependency: 'dependencyMs',
  'resource-tokens': 'resourceTokensMs',
  'concurrency-limit': 'concurrencyLimitMs',
};

function createWaitDurations() {
  return { dependencyMs: 0, resourceTokensMs: 0, concurrencyLimitMs: 0 };
}

function planScheduledTasks(tasks, profile, planningId, transition) {
  try {
    const pending = normalizeTasks(tasks, profile);
    const taskIds = new Set(pending.map(({ id }) => id));
    const timelineIds = pending.map(({ id }) => timelineLaneId('scheduler', id));
    if (new Set(timelineIds).size !== timelineIds.length) {
      throw new Error('Scheduled QA task ids collide after timeline normalization.');
    }
    for (const task of pending) {
      for (const dependency of task.dependencies) {
        if (!taskIds.has(dependency)) {
          throw new Error(`${task.id} has unknown dependency ${dependency}.`);
        }
      }
    }
    transition({ activityId: planningId, kind: 'scheduler-planning', state: 'completed' });
    return pending;
  } catch (error) {
    transition({ activityId: planningId, kind: 'scheduler-planning', state: 'failed' });
    throw error;
  }
}

function createWaitTracker() {
  const tracked = new Map();
  function update(taskId, reasons, timestampMs) {
    const reason = reasons[0] ?? null;
    const tracking = tracked.get(taskId) ?? {
      reason: null,
      sinceMs: timestampMs,
      durations: createWaitDurations(),
    };
    if (tracking.reason !== reason) {
      if (tracking.reason !== null) {
        tracking.durations[WAIT_DURATION_FIELDS[tracking.reason]] += timestampMs - tracking.sinceMs;
      }
      tracking.reason = reason;
      tracking.sinceMs = timestampMs;
    }
    tracked.set(taskId, tracking);
  }
  return {
    update,
    finish(taskId, timestampMs) {
      update(taskId, [], timestampMs);
      return tracked.get(taskId)?.durations ?? createWaitDurations();
    },
  };
}

function queueTaskActivities(pending, schedulerId, transition) {
  const remaining = [...pending];
  const queuedIds = new Set();
  while (remaining.length > 0) {
    const index = remaining.findIndex((task) =>
      task.dependencies.every((dependency) => queuedIds.has(dependency))
    );
    if (index === -1) {
      throw new Error('Scheduled QA task dependencies contain a cycle.');
    }
    const [task] = remaining.splice(index, 1);
    transition({
      activityId: timelineLaneId(schedulerId, task.id),
      kind: 'scheduler-lane',
      state: 'queued',
      dependencies: task.dependencies.map((dependency) => timelineLaneId(schedulerId, dependency)),
      executionProfile: {
        cpuTokens: task.cpuTokens,
        memoryMiB: task.memoryMiB,
        workers: task.workers ?? 1,
        pid: process.pid,
        workerId: null,
        ...(task.executionProfile ?? {}),
      },
    });
    queuedIds.add(task.id);
  }
}

function createCompletedState(state, outcome, finishedAtMs) {
  return {
    id: state.task.id,
    order: state.task.order,
    cpuTokens: state.task.cpuTokens,
    memoryMiB: state.task.memoryMiB,
    exclusive: state.task.exclusive,
    queuedMs: state.startedAtMs - state.queuedAtMs,
    durationMs: finishedAtMs - state.startedAtMs,
    ...outcome,
  };
}

function startTask(task, queuedAtMs, now, signal, activityId) {
  const startedAtMs = now();
  const state = { task, queuedAtMs, startedAtMs };
  state.completion = Promise.resolve()
    .then(() => withTimelineActivity(activityId, () => task.run({ activityId, signal })))
    .then(
      (value) => createCompletedState(state, { value }, now()),
      (error) => createCompletedState(state, { error }, now())
    );
  return state;
}

export async function runBoundedTasks(
  tasks,
  { now = Date.now, profile, schedulerId = `scheduler-${++schedulerSequence}`, onTransition } = {}
) {
  if (!profile) throw new Error('A QA resource profile is required.');
  assertPositiveInteger(profile.cpuTokens, 'profile cpuTokens');
  assertPositiveInteger(profile.memoryMiB, 'profile memoryMiB');

  const transition = (event) => {
    const timedEvent = { ...event, at: event.at ?? new Date(now()).toISOString() };
    onTransition?.(timedEvent);
    recordTimelineTransition(timedEvent);
    return timedEvent;
  };
  const planningId = `${schedulerId}.planning`;
  transition({ activityId: planningId, kind: 'scheduler-planning', state: 'queued' });
  transition({ activityId: planningId, kind: 'scheduler-planning', state: 'started' });
  const queuedAtMs = now();
  const pending = planScheduledTasks(tasks, profile, planningId, transition);
  const active = new Map();
  const completed = [];
  const completedIds = new Set();
  const observedWaitReasons = new Map();
  const waitTracker = createWaitTracker();
  const usage = { cpuTokens: 0, memoryMiB: 0 };
  const cancellation = new AbortController();
  let fatalError = null;

  queueTaskActivities(pending, schedulerId, transition);

  while (pending.length > 0 || active.size > 0) {
    if (!fatalError) {
      for (let index = 0; index < pending.length;) {
        const task = pending[index];
        if (!canStart(task, active, usage, profile, completedIds)) {
          const reasons = waitReasons(task, active, usage, profile, completedIds);
          const previous = observedWaitReasons.get(task.id) ?? [];
          observedWaitReasons.set(task.id, [...new Set([...previous, ...reasons])]);
          waitTracker.update(task.id, reasons, now());
          index += 1;
          continue;
        }

        pending.splice(index, 1);
        const activityId = timelineLaneId(schedulerId, task.id);
        const waitDurations = waitTracker.finish(task.id, now());
        transition({
          activityId,
          kind: 'scheduler-lane',
          state: 'started',
          waitReasons: observedWaitReasons.get(task.id) ?? [],
          waitDurations,
        });
        const state = startTask(task, queuedAtMs, now, cancellation.signal, activityId);
        active.set(task.id, state);
        usage.cpuTokens += task.cpuTokens;
        usage.memoryMiB += task.memoryMiB;
        if (task.exclusive) break;
      }
    }

    if (active.size === 0) {
      if (fatalError) break;
      throw new Error('QA scheduler cannot make progress with the selected resource profile.');
    }

    const result = await Promise.race([...active.values()].map(({ completion }) => completion));
    const state = active.get(result.id);
    active.delete(result.id);
    usage.cpuTokens -= state.task.cpuTokens;
    usage.memoryMiB -= state.task.memoryMiB;
    completed.push(result);
    completedIds.add(result.id);
    transition({
      activityId: timelineLaneId(schedulerId, result.id),
      kind: 'scheduler-lane',
      state: result.error ? (fatalError ? 'interrupted' : 'failed') : 'completed',
    });
    if (!fatalError && result.error) {
      fatalError = result.error;
      cancellation.abort(fatalError);
    }
  }

  if (fatalError) {
    const interrupted = await Promise.all([...active.values()].map(({ completion }) => completion));
    for (const result of interrupted) {
      transition({
        activityId: timelineLaneId(schedulerId, result.id),
        kind: 'scheduler-lane',
        state: 'interrupted',
      });
    }
    for (const task of pending) {
      const waitDurations = waitTracker.finish(task.id, now());
      transition({
        activityId: timelineLaneId(schedulerId, task.id),
        kind: 'scheduler-lane',
        state: 'skipped',
        waitReasons: observedWaitReasons.get(task.id) ?? ['dependency'],
        waitDurations,
      });
    }
    throw fatalError;
  }

  const completionId = `${schedulerId}.completion`;
  transition({
    activityId: completionId,
    kind: 'scheduler-completion',
    state: 'queued',
    dependencies: completed.map(({ id }) => timelineLaneId(schedulerId, id)),
  });
  transition({ activityId: completionId, kind: 'scheduler-completion', state: 'started' });
  transition({ activityId: completionId, kind: 'scheduler-completion', state: 'completed' });

  return completed.toSorted((left, right) => left.order - right.order);
}

export function formatTaskScheduleDetail(result, profile) {
  return [
    `lane=${result.id}`,
    `queue=${result.queuedMs}ms`,
    `wall=${result.durationMs}ms`,
    `budget=${result.cpuTokens}cpu/${result.memoryMiB}MiB`,
    `profile=${profile.cpuTokens}cpu/${profile.memoryMiB}MiB`,
  ].join('; ');
}

export function appendTaskScheduleDetail(step, detail) {
  return { ...step, detail: [step.detail, detail].filter(Boolean).join('; ') };
}

export function appendTaskScheduleDetailToFirst(steps, detail) {
  const [first, ...remaining] = steps;
  return [appendTaskScheduleDetail(first, detail), ...remaining];
}

export function indexTaskResults(results) {
  return Object.fromEntries(results.map((result) => [result.id, result.value]));
}

export function appendTaskResultScheduleDetail(value, key, detail, { list = false } = {}) {
  return {
    ...value,
    [key]: list
      ? appendTaskScheduleDetailToFirst(value[key], detail)
      : appendTaskScheduleDetail(value[key], detail),
  };
}
import {
  recordTimelineTransition,
  withTimelineActivity,
} from './observability/timeline-context.mjs';

let schedulerSequence = 0;
