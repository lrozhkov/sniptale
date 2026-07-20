const operationChains = new Map<number, Promise<void>>();

export function runScreenshotModeOperation<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const previousOperation = operationChains.get(tabId) ?? Promise.resolve();
  const operation = previousOperation.catch(() => undefined).then(work);
  const chain = operation
    .then(
      () => undefined,
      () => undefined
    )
    .finally(() => {
      if (operationChains.get(tabId) === chain) {
        operationChains.delete(tabId);
      }
    });

  operationChains.set(tabId, chain);
  return operation;
}
