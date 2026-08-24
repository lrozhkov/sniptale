export function createSchedulerLaneTask({
  cpuTokens,
  dependencies = [],
  executionProfile,
  exclusive = false,
  lane,
  memoryMiB,
  profile,
  typecheckCheckerCount,
  workers = null,
  workerArguments = {},
  workerContext,
  workerRunner,
}) {
  return {
    id: lane,
    cpuTokens,
    dependencies,
    exclusive,
    executionProfile,
    memoryMiB,
    workers:
      workers ??
      (lane === 'tests'
        ? profile.vitestMaxWorkers
        : lane === 'typecheck'
          ? typecheckCheckerCount
          : 1),
    run: ({ signal }) =>
      workerRunner({
        ...workerArguments,
        context: workerContext,
        lane,
        memoryMiB,
        signal,
        typecheckCheckerCount,
        vitestMaxWorkers: profile.vitestMaxWorkers,
      }),
  };
}
