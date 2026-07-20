import { readRunRecords } from './maintenance.mjs';

function emptyOutcomes() {
  return {
    total: 0,
    allPassed: 0,
    problemsFound: 0,
    interrupted: 0,
    running: 0,
    skipped: 0,
    durationMs: [],
    problemCount: 0,
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function finishOutcomes(value) {
  const { durationMs, ...counts } = value;
  const decided = counts.allPassed + counts.problemsFound + counts.interrupted;
  return {
    ...counts,
    passRate: decided === 0 ? null : counts.allPassed / decided,
    timing: {
      minimumMs: durationMs.length === 0 ? null : Math.min(...durationMs),
      p50Ms: percentile(durationMs, 0.5),
      p95Ms: percentile(durationMs, 0.95),
      maximumMs: durationMs.length === 0 ? null : Math.max(...durationMs),
    },
  };
}

function addRun(bucket, record) {
  bucket.total += 1;
  const field = {
    running: 'running',
    'all-passed': 'allPassed',
    skipped: 'skipped',
    'problems-found': 'problemsFound',
    interrupted: 'interrupted',
  }[record.status];
  bucket[field] += 1;
  if (record.durationMs !== null) bucket.durationMs.push(record.durationMs);
  bucket.problemCount += record.summary.problemCount;
}

function addStep(bucket, step) {
  bucket.total += 1;
  bucket.durationMs.push(step.durationMs);
  if (step.outcome === 'passed') bucket.allPassed += 1;
  else if (step.outcome === 'interrupted') bucket.interrupted += 1;
  else if (step.outcome === 'skipped') bucket.skipped += 1;
  else bucket.problemsFound += 1;
  bucket.problemCount += step.problemIds.length;
}

function increment(map, id) {
  map.set(id, (map.get(id) ?? 0) + 1);
}

function toSortedEntries(map) {
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, outcomes]) => ({ id, ...finishOutcomes(outcomes) }));
}

function createBuckets() {
  return {
    overall: emptyOutcomes(),
    wrappers: new Map(),
    modes: new Map(),
    roots: new Map(),
    controls: new Map(),
    steps: new Map(),
    tasks: new Map(),
    workflows: new Map(),
    skipReasons: new Map(),
    problems: new Map(),
  };
}

function addToRunBucket(map, id, record) {
  if (!id) return;
  const bucket = map.get(id) ?? emptyOutcomes();
  addRun(bucket, record);
  map.set(id, bucket);
}

function addRecordSteps(buckets, record) {
  for (const step of record.steps) {
    const stepBucket = buckets.steps.get(step.stepId) ?? emptyOutcomes();
    addStep(stepBucket, step);
    buckets.steps.set(step.stepId, stepBucket);
    if (step.skipReasonId) increment(buckets.skipReasons, step.skipReasonId);
    for (const problemId of step.problemIds) increment(buckets.problems, problemId);
    for (const controlId of step.controlIds) {
      const control = buckets.controls.get(controlId) ?? emptyOutcomes();
      addStep(control, step);
      buckets.controls.set(controlId, control);
    }
  }
}

function addRecord(buckets, record) {
  addRun(buckets.overall, record);
  addToRunBucket(buckets.wrappers, record.wrapperId, record);
  addToRunBucket(buckets.modes, `${record.wrapperId}/${record.repository.mode}`, record);
  addToRunBucket(buckets.roots, record.rootRunId, record);
  addToRunBucket(buckets.tasks, record.correlation.taskId, record);
  addToRunBucket(buckets.workflows, record.correlation.workflowId, record);
  addRecordSteps(buckets, record);
}

function countEntries(map) {
  return [...map]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, total]) => ({ id, total }));
}

export function collectRunStatistics({ rootDir = process.cwd() } = {}) {
  const entries = readRunRecords({ rootDir });
  const records = entries.filter((entry) => entry.record).map((entry) => entry.record);
  const buckets = createBuckets();
  for (const record of records) addRecord(buckets, record);
  return {
    schemaVersion: 2,
    invalidRecordCount: entries.length - records.length,
    overall: finishOutcomes(buckets.overall),
    wrappers: toSortedEntries(buckets.wrappers),
    modes: toSortedEntries(buckets.modes),
    roots: toSortedEntries(buckets.roots),
    controls: toSortedEntries(buckets.controls),
    steps: toSortedEntries(buckets.steps),
    skipReasons: countEntries(buckets.skipReasons),
    problems: countEntries(buckets.problems),
    tasks: toSortedEntries(buckets.tasks),
    workflows: toSortedEntries(buckets.workflows),
  };
}
