interface NativeTransferQueue {
  run<TValue>(key: string, task: () => Promise<TValue>): Promise<TValue>;
}

export function createNativeTransferQueue(): NativeTransferQueue {
  const chains = new Map<string, Promise<void>>();

  return {
    run(key, task) {
      const previous = chains.get(key) ?? Promise.resolve();
      const current = previous.then(task, task);
      const next = current.then(
        () => undefined,
        () => undefined
      );
      chains.set(key, next);
      void next.then(() => {
        if (chains.get(key) === next) {
          chains.delete(key);
        }
      });
      return current;
    },
  };
}
