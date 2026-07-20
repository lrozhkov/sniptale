const tabWorkQueues = new Map<number, Promise<void>>();

export async function runCaptureTabExclusive<T>(tabId: number, work: () => Promise<T>): Promise<T> {
  const previous = tabWorkQueues.get(tabId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  tabWorkQueues.set(tabId, next);

  await previous.catch(() => undefined);

  try {
    return await work();
  } finally {
    releaseCurrent();
    if (tabWorkQueues.get(tabId) === next) {
      tabWorkQueues.delete(tabId);
    }
  }
}
