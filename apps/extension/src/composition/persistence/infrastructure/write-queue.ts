export function createStorageWriteQueue() {
  let writeQueue: Promise<void> = Promise.resolve();

  return async function enqueueStorageWrite<T>(task: () => Promise<T>): Promise<T> {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };
}
