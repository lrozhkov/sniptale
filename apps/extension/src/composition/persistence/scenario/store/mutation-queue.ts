export function createScenarioStoreMutationQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueueScenarioStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = tail.then(operation, operation);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
