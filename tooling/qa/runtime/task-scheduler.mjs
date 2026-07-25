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
    return { ...task, order, exclusive: task.exclusive === true };
  });
}

function canStart(task, active, usage, profile) {
  if (task.exclusive) return active.size === 0;
  if ([...active.values()].some(({ task: activeTask }) => activeTask.exclusive)) return false;
  return (
    usage.cpuTokens + task.cpuTokens <= profile.cpuTokens &&
    usage.memoryMiB + task.memoryMiB <= profile.memoryMiB
  );
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

function startTask(task, queuedAtMs, now, signal) {
  const startedAtMs = now();
  const state = { task, queuedAtMs, startedAtMs };
  state.completion = Promise.resolve()
    .then(() => task.run({ signal }))
    .then(
      (value) => createCompletedState(state, { value }, now()),
      (error) => createCompletedState(state, { error }, now())
    );
  return state;
}

export async function runBoundedTasks(tasks, { now = Date.now, profile } = {}) {
  if (!profile) throw new Error('A QA resource profile is required.');
  assertPositiveInteger(profile.cpuTokens, 'profile cpuTokens');
  assertPositiveInteger(profile.memoryMiB, 'profile memoryMiB');

  const queuedAtMs = now();
  const pending = normalizeTasks(tasks, profile);
  const active = new Map();
  const completed = [];
  const usage = { cpuTokens: 0, memoryMiB: 0 };
  const cancellation = new AbortController();
  let fatalError = null;

  while (pending.length > 0 || active.size > 0) {
    if (!fatalError) {
      for (let index = 0; index < pending.length; ) {
        const task = pending[index];
        if (!canStart(task, active, usage, profile)) {
          index += 1;
          continue;
        }

        pending.splice(index, 1);
        const state = startTask(task, queuedAtMs, now, cancellation.signal);
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
    if (!fatalError && result.error) {
      fatalError = result.error;
      cancellation.abort(fatalError);
    }
  }

  if (fatalError) {
    await Promise.all([...active.values()].map(({ completion }) => completion));
    throw fatalError;
  }

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
