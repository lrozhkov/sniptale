export type ScenarioSessionPersistedWriteQueue = ReturnType<
  typeof createScenarioSessionPersistedWriteQueue
>;

export function createScenarioSessionPersistedWriteQueue() {
  let queue: Promise<void> = Promise.resolve();

  return function runPersistedWrite<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    const operation = queue.catch(() => undefined).then(task);
    queue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };
}
