function assertSummaryConsistency(record) {
  if (record.summary.stepCount !== record.steps.length) {
    throw new TypeError('summary.stepCount does not match steps');
  }
  const problemIds = [...new Set(record.steps.flatMap((step) => step.problemIds))].sort();
  if (JSON.stringify(problemIds) !== JSON.stringify([...record.summary.problemIds].sort())) {
    throw new TypeError('summary.problemIds does not match steps');
  }
  if (record.summary.problemCount !== problemIds.length) {
    throw new TypeError('summary.problemCount does not match problemIds');
  }
  const expectedCounts = {
    passed: record.steps.filter((step) => step.outcome === 'passed').length,
    problemsFound: record.steps.filter((step) => step.outcome === 'problems-found').length,
    skipped: record.steps.filter((step) => step.outcome === 'skipped').length,
    errors: record.steps.filter((step) => step.outcome === 'error').length,
    interrupted: record.steps.filter((step) => step.outcome === 'interrupted').length,
  };
  for (const [key, count] of Object.entries(expectedCounts)) {
    if (record.summary[key] !== count) throw new TypeError(`summary.${key} does not match steps`);
  }
}

export function assertLifecycleConsistency(record) {
  if (record.parentRunId === null && record.rootRunId !== record.runId) {
    throw new TypeError('a root run must identify itself as rootRunId');
  }
  if (record.parentRunId !== null && record.rootRunId === record.runId) {
    throw new TypeError('a child run must inherit its rootRunId');
  }
  if (record.parentRunId === record.runId) {
    throw new TypeError('a run cannot be its own parent');
  }
  const isRunning = record.status === 'running';
  if (isRunning !== (record.finishedAt === null || record.durationMs === null)) {
    throw new TypeError('running state and finish fields are inconsistent');
  }
  if (isRunning !== (record.exitCode === null)) {
    throw new TypeError('running state and exitCode are inconsistent');
  }
  if (
    !isRunning &&
    Date.parse(record.finishedAt) - Date.parse(record.startedAt) !== record.durationMs
  ) {
    throw new TypeError('run durationMs must match its timestamp interval');
  }
  if (['all-passed', 'skipped'].includes(record.status) && record.exitCode !== 0) {
    throw new TypeError('successful run status must have exitCode 0');
  }
  if (['problems-found', 'interrupted'].includes(record.status) && record.exitCode === 0) {
    throw new TypeError('non-success run must have a non-zero exitCode');
  }
  assertSummaryConsistency(record);
  if (record.status === 'all-passed' && record.steps.some((step) => step.problemIds.length > 0)) {
    throw new TypeError('all-passed run must not contain problems');
  }
  if (record.status === 'skipped' && record.summary.skipped === 0) {
    throw new TypeError('skipped run must contain a skipped step');
  }
  if (record.status === 'skipped' && record.summary.problemCount > 0) {
    throw new TypeError('skipped run must not contain problems');
  }
  if (record.status === 'interrupted' && record.summary.interrupted === 0) {
    throw new TypeError('interrupted run must contain an interrupted step');
  }
  if (record.status === 'problems-found' && record.summary.problemCount === 0) {
    throw new TypeError('problems-found run must contain a stable problem identifier');
  }
}
