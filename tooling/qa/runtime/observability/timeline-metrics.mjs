function terminalActivities(timeline) {
  return timeline.activities.filter(({ finishedAt }) => finishedAt !== null);
}

function unionDuration(intervals) {
  const sorted = intervals
    .map(([start, end]) => [Date.parse(start), Date.parse(end)])
    .sort(([left], [right]) => left - right);
  let total = 0;
  let current = null;
  for (const interval of sorted) {
    if (!current || interval[0] > current[1]) {
      if (current) total += current[1] - current[0];
      current = interval;
    } else {
      current[1] = Math.max(current[1], interval[1]);
    }
  }
  if (current) total += current[1] - current[0];
  return total;
}

function criticalPath(activities) {
  const byId = new Map(activities.map((activity) => [activity.activityId, activity]));
  const memo = new Map();
  const visiting = new Set();
  function visit(activity) {
    if (memo.has(activity.activityId)) return memo.get(activity.activityId);
    if (visiting.has(activity.activityId)) return { durationMs: 0, activities: [] };
    visiting.add(activity.activityId);
    const candidates = activity.dependencies
      .map((dependency) => byId.get(dependency))
      .filter(Boolean)
      .map(visit);
    const ownStartMs = Date.parse(activity.startedAt ?? activity.finishedAt);
    const ownFinishMs = Date.parse(activity.finishedAt);
    const parent = candidates
      .map((candidate) => ({
        ...candidate,
        durationMs: Math.max(0, ownFinishMs - candidate.startedAtMs),
      }))
      .sort((left, right) => right.durationMs - left.durationMs)[0];
    const result = parent
      ? {
          durationMs: parent.durationMs,
          startedAtMs: parent.startedAtMs,
          activities: [...parent.activities, activity.activityId],
        }
      : {
          durationMs: Math.max(0, ownFinishMs - ownStartMs),
          startedAtMs: ownStartMs,
          activities: [activity.activityId],
        };
    visiting.delete(activity.activityId);
    memo.set(activity.activityId, result);
    return result;
  }
  return (
    activities.map(visit).sort((left, right) => right.durationMs - left.durationMs)[0] ?? {
      durationMs: 0,
      activities: [],
    }
  );
}

export function summarizeTimeline(record) {
  const activities = terminalActivities(record.timeline ?? { activities: [] });
  const critical = criticalPath(activities);
  const resourceWaitMs = activities.reduce(
    (total, activity) =>
      total + activity.waitDurations.resourceTokensMs + activity.waitDurations.concurrencyLimitMs,
    0
  );
  return {
    wallClockMs: record.durationMs ?? Date.now() - Date.parse(record.startedAt),
    criticalPathMs: critical.durationMs,
    criticalPath: critical.activities,
    activeExecutionMs: unionDuration(
      activities
        .filter(({ startedAt }) => startedAt !== null)
        .map(({ startedAt, finishedAt }) => [startedAt, finishedAt])
    ),
    queueWaitMs: activities.reduce((total, activity) => total + (activity.queueDurationMs ?? 0), 0),
    resourceWaitMs,
    topSlowActivities: activities
      .toSorted(
        (left, right) =>
          (right.durationMs ?? 0) - (left.durationMs ?? 0) ||
          left.activityId.localeCompare(right.activityId)
      )
      .slice(0, 5)
      .map(({ activityId, durationMs }) => ({ activityId, durationMs })),
    reused: activities.filter(({ reused }) => reused).map(({ activityId }) => activityId),
    skipped: activities
      .filter(({ state }) => state === 'skipped')
      .map(({ activityId }) => activityId),
  };
}
