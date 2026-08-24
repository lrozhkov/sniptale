export function createSchedulerLaneTask({
  cpuTokens,
  executionProfile,
  exclusive = false,
  lane,
  memoryMiB,
  profile,
  typecheckCheckerCount,
  workerArguments = {},
  workerContext,
  workerRunner,
}) {
  return {
    id: lane,
    cpuTokens,
    dependencies: [],
    exclusive,
    executionProfile,
    memoryMiB,
    workers:
      lane === 'tests'
        ? profile.vitestMaxWorkers
        : lane === 'typecheck'
          ? typecheckCheckerCount
          : 1,
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
